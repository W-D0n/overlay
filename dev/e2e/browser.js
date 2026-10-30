// @ts-check
/**
 * dev/e2e/browser.js — Un navigateur piloté pour les essais de bout en bout : Chrome, par son protocole de débogage (CDP),
 * sans aucune dépendance (la WebSocket est celle de Bun).
 *
 * Les gestes sont de **vrais événements d'entrée** (souris, clavier, glisser), pas des `element.click()` : c'est ce qui révèle
 * un clic perdu, un bouton invisible qui intercepte, une frappe qui ne déclenche pas `input`. Les requêtes vers le port
 * d'état codé en dur dans les pages (5932) sont redirigées vers le serveur d'essai, de sorte qu'aucun essai ne touche
 * jamais les serveurs de l'owner.
 *
 * Outillage de dev : il ne s'exécute ni dans OBS ni dans le live.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const MODIFIER_BITS = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @returns {string | null} le premier navigateur Chromium trouvé */
export function findChrome() {
  return CHROME_CANDIDATES.find((path) => typeof path === 'string' && existsSync(path)) ?? null;
}

/**
 * @typedef {{ x: number, y: number, width: number, height: number }} Box
 * @typedef {{ modifiers?: string[], clickCount?: number, position?: { x: number, y: number } }} ClickOptions
 */

/**
 * @param {{ stateRedirect?: { from: number, to: number }, viewport?: { width: number, height: number } }} [options]
 */
export async function launchBrowser({ stateRedirect, viewport = { width: 1700, height: 1200 } } = {}) {
  const executable = findChrome();
  if (executable === null) throw new Error('aucun Chrome ni Edge trouvé (variable CHROME_PATH pour l’indiquer)');
  const userData = mkdtempSync(join(tmpdir(), 'overlay-e2e-'));
  const process_ = Bun.spawn([
    executable, '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userData}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio', `--window-size=${viewport.width},${viewport.height}`, 'about:blank',
  ], { stdout: 'ignore', stderr: 'ignore' });

  // Chrome dépose son port de débogage dans `DevToolsActivePort`, à la racine de son profil.
  let port = 0;
  const activePortFile = join(userData, 'DevToolsActivePort');
  const deadline = Date.now() + 20_000;
  while (port === 0 && Date.now() < deadline) {
    if (existsSync(activePortFile)) {
      const [first] = readFileSync(activePortFile, 'utf8').trim().split(String.fromCharCode(10));
      port = Number(first) || 0;
    }
    if (port === 0) await sleep(100);
  }
  if (port === 0) {
    process_.kill();
    throw new Error('Chrome n’a pas annoncé son port de débogage');
  }

  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const pageTarget = targets.find((/** @type {*} */ target) => target.type === 'page');
  const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

  let nextId = 1;
  /** @type {Map<number, { resolve: (value: any) => void, reject: (error: Error) => void }>} */
  const pending = new Map();
  /** @type {Map<string, Set<(params: any) => void>>} */
  const handlers = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined) {
      const call = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) call?.reject(new Error(`${message.error.message}`));
      else call?.resolve(message.result);
    } else {
      for (const handler of handlers.get(message.method) ?? []) handler(message.params);
    }
  };
  /** @param {string} method @param {Record<string, unknown>} [params] @returns {Promise<any>} */
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  /** @param {string} method @param {(params: any) => void} handler */
  const on = (method, handler) => {
    if (!handlers.has(method)) handlers.set(method, new Set());
    /** @type {Set<(params: any) => void>} */ (handlers.get(method)).add(handler);
  };

  /** @type {string[]} */
  const errors = [];
  on('Runtime.exceptionThrown', (params) => errors.push(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? 'exception'));
  on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') errors.push(params.args.map((/** @type {*} */ arg) => arg.value ?? arg.description).join(' '));
  });
  on('Log.entryAdded', (params) => {
    if (params.entry.level === 'error') errors.push(`${params.entry.text}${params.entry.url ? ` (${params.entry.url})` : ''}`);
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });

  if (stateRedirect !== undefined) {
    const { from, to } = stateRedirect;
    // Les pages codent le port d'état en dur : HTTP et WebSocket sont réécrits vers le serveur d'essai.
    on('Fetch.requestPaused', (params) => {
      send('Fetch.continueRequest', { requestId: params.requestId, url: params.request.url.replace(`:${from}`, `:${to}`) }).catch(() => {});
    });
    await send('Fetch.enable', { patterns: [{ urlPattern: `http://localhost:${from}/*` }] });
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        const Native = window.WebSocket;
        function Redirected(url, protocols) { return new Native(String(url).replace(':${from}', ':${to}'), protocols); }
        Redirected.prototype = Native.prototype;
        for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Redirected[key] = Native[key];
        window.WebSocket = Redirected;
      })();`,
    });
  }

  /** @type {{ x: number, y: number }} */
  let pointer = { x: 0, y: 0 };

  /** @param {string[]} [names] @returns {number} */
  const modifierBits = (names = []) => names.reduce((bits, name) => bits | (MODIFIER_BITS[/** @type {keyof typeof MODIFIER_BITS} */ (name)] ?? 0), 0);

  /**
   * Évalue une expression dans la page et rend sa valeur.
   * @param {string} expression
   */
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }

  /** @param {string} selector @param {number} [timeoutMs] @returns {Promise<Box>} la boîte de l'élément, une fois visible et immobile */
  async function boxOf(selector, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    let last = '';
    while (Date.now() < deadline) {
      const box = await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (r.width === 0 || r.height === 0 || style.visibility === 'hidden' || style.display === 'none') return null;
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      })()`);
      if (box !== null) {
        const serialized = JSON.stringify(box);
        if (serialized === last) return box;
        last = serialized;
      }
      await sleep(60);
    }
    throw new Error(`élément introuvable ou invisible : ${selector}`);
  }

  /** @param {number} x @param {number} y @param {Record<string, unknown>} [extra] */
  const mouse = (x, y, extra = {}) => send('Input.dispatchMouseEvent', { x, y, ...extra });

  const api = {
    errors,
    send,
    on,
    evaluate,
    boxOf,

    /** @param {string} url */
    async goto(url) {
      await send('Page.navigate', { url });
      await sleep(300);
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        if ((await evaluate('document.readyState')) === 'complete') return;
        await sleep(100);
      }
      throw new Error(`page non chargée : ${url}`);
    },

    /**
     * Attend qu'une expression devienne vraie.
     * @param {string} expression
     * @param {number} [timeoutMs]
     */
    async waitFor(expression, timeoutMs = 8000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await evaluate(expression).catch(() => false)) return true;
        await sleep(80);
      }
      return false;
    },

    sleep,

    /**
     * Un vrai clic : déplacement, appui, relâchement, au centre de l'élément (ou à `position` relative à lui). Si un autre
     * élément couvre ce point, le clic part vers lui : c'est voulu, c'est ce que vit l'utilisateur.
     * @param {string} selector
     * @param {ClickOptions} [options]
     */
    async click(selector, { modifiers = [], clickCount = 1, position } = {}) {
      const box = await boxOf(selector);
      const x = box.x + (position?.x ?? box.width / 2);
      const y = box.y + (position?.y ?? box.height / 2);
      pointer = { x, y };
      const bits = modifierBits(modifiers);
      await mouse(x, y, { type: 'mouseMoved', modifiers: bits });
      for (let count = 1; count <= clickCount; count += 1) {
        await mouse(x, y, { type: 'mousePressed', button: 'left', clickCount: count, modifiers: bits });
        await mouse(x, y, { type: 'mouseReleased', button: 'left', clickCount: count, modifiers: bits });
      }
    },

    /** @param {string} selector @param {ClickOptions} [options] */
    dblclick(selector, options = {}) {
      return api.click(selector, { ...options, clickCount: 2 });
    },

    /**
     * Remplace le contenu d'un champ comme une saisie : focus, sélection, puis insertion de texte (qui déclenche `input`).
     * @param {string} selector
     * @param {string | number} value
     */
    async fill(selector, value) {
      await api.click(selector);
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`);
      await send('Input.insertText', { text: String(value) });
    },

    /**
     * Choisit une option d'un `select` (le menu natif n'est pas pilotable : valeur posée, puis `input` et `change`).
     * @param {string} selector
     * @param {string} value
     */
    async selectOption(selector, value) {
      await boxOf(selector);
      await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    },

    /**
     * Une touche ou un raccourci, « Control+Shift+z », « Delete », « Alt+ArrowUp ».
     * @param {string} combo
     */
    async press(combo) {
      const parts = combo.split('+');
      const key = /** @type {string} */ (parts.pop());
      const names = parts;
      const bits = modifierBits(names);
      const isLetter = /^[a-z]$/i.test(key);
      const code = isLetter ? `Key${key.toUpperCase()}` : key;
      const virtual = isLetter ? key.toUpperCase().charCodeAt(0) : ({ Enter: 13, Escape: 27, Delete: 46, Backspace: 8, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, F2: 113, Tab: 9 }[/** @type {string} */ (key)] ?? 0);
      const shown = isLetter && names.includes('Shift') ? key.toUpperCase() : key;
      const printable = key.length === 1 && !names.includes('Control') && !names.includes('Meta') && !names.includes('Alt');
      for (const name of names) await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: name, code: `${name}Left`, modifiers: modifierBits(names.slice(0, names.indexOf(name) + 1)), windowsVirtualKeyCode: { Control: 17, Shift: 16, Alt: 18, Meta: 91 }[/** @type {'Control'} */ (name)] });
      await send('Input.dispatchKeyEvent', { type: printable ? 'keyDown' : 'rawKeyDown', key: shown, code, modifiers: bits, windowsVirtualKeyCode: virtual, ...(printable ? { text: shown } : {}) });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: shown, code, modifiers: bits, windowsVirtualKeyCode: virtual });
      for (const name of [...names].reverse()) await send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: `${name}Left`, windowsVirtualKeyCode: { Control: 17, Shift: 16, Alt: 18, Meta: 91 }[/** @type {'Control'} */ (name)] });
    },

    /** @param {string} selector */
    async focus(selector) {
      await boxOf(selector);
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    },

    /**
     * Glisser-déposer HTML5, comme à la souris : appui sur la source, déplacement, relâchement sur la cible.
     * @param {string} from
     * @param {string} to
     * @param {{ position?: { x: number, y: number } }} [target] point d'arrivée relatif à la cible
     */
    async drag(from, to, target = {}) {
      const source = await boxOf(from);
      const destination = await boxOf(to);
      const sx = source.x + source.width / 2;
      const sy = source.y + source.height / 2;
      const dx = destination.x + (target.position?.x ?? destination.width / 2);
      const dy = destination.y + (target.position?.y ?? destination.height / 2);
      /** @type {any} */
      let intercepted = null;
      on('Input.dragIntercepted', (params) => { intercepted = params.data; });
      await send('Input.setInterceptDrags', { enabled: true });
      await mouse(sx, sy, { type: 'mouseMoved' });
      await mouse(sx, sy, { type: 'mousePressed', button: 'left', clickCount: 1 });
      await mouse(sx + 6, sy + 6, { type: 'mouseMoved', button: 'left', buttons: 1 });
      await mouse(dx, dy, { type: 'mouseMoved', button: 'left', buttons: 1 });
      const deadline = Date.now() + 2000;
      while (intercepted === null && Date.now() < deadline) await sleep(30);
      if (intercepted === null) {
        await send('Input.setInterceptDrags', { enabled: false });
        await mouse(dx, dy, { type: 'mouseReleased', button: 'left', clickCount: 1 });
        throw new Error(`glisser impossible : aucun glisser démarré depuis ${from}`);
      }
      await send('Input.dispatchDragEvent', { type: 'dragEnter', x: dx, y: dy, data: intercepted });
      await send('Input.dispatchDragEvent', { type: 'dragOver', x: dx, y: dy, data: intercepted });
      await send('Input.dispatchDragEvent', { type: 'drop', x: dx, y: dy, data: intercepted });
      await send('Input.setInterceptDrags', { enabled: false });
      await mouse(dx, dy, { type: 'mouseReleased', button: 'left', clickCount: 1 });
      await sleep(80);
    },

    /**
     * Gestes de souris de bas niveau, pour les essais qui observent l'état *pendant* un glissement.
     * @param {number} x @param {number} y @param {{ modifiers?: string[] }} [options]
     */
    async mouseDown(x, y, { modifiers = [] } = {}) {
      pointer = { x, y };
      await mouse(x, y, { type: 'mouseMoved', modifiers: modifierBits(modifiers) });
      await mouse(x, y, { type: 'mousePressed', button: 'left', clickCount: 1, modifiers: modifierBits(modifiers) });
    },
    /** @param {number} x @param {number} y @param {{ modifiers?: string[] }} [options] */
    async mouseMove(x, y, { modifiers = [] } = {}) {
      pointer = { x, y };
      await mouse(x, y, { type: 'mouseMoved', button: 'left', buttons: 1, modifiers: modifierBits(modifiers) });
    },
    /** @param {number} x @param {number} y @param {{ modifiers?: string[] }} [options] */
    async mouseUp(x, y, { modifiers = [] } = {}) {
      await mouse(x, y, { type: 'mouseReleased', button: 'left', clickCount: 1, modifiers: modifierBits(modifiers) });
    },
    /** Molette. @param {number} x @param {number} y @param {number} deltaY @param {{ modifiers?: string[] }} [options] */
    async wheel(x, y, deltaY, { modifiers = [] } = {}) {
      await mouse(x, y, { type: 'mouseWheel', deltaX: 0, deltaY, modifiers: modifierBits(modifiers) });
    },
    /** Appui seul sur une touche (sans relâchement). @param {string} key */
    async keyDown(key) {
      const code = key === ' ' ? 'Space' : key;
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: key === ' ' ? 32 : 0, text: key.length === 1 ? key : undefined });
    },
    /** @param {string} key */
    async keyUp(key) {
      const code = key === ' ' ? 'Space' : key;
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: key === ' ' ? 32 : 0 });
    },

    /** @param {string} path chemin du fichier PNG à écrire */
    async screenshot(path) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path, Buffer.from(data, 'base64'));
    },

    async close() {
      try {
        await send('Browser.close');
      } catch {
        // Le navigateur peut déjà être fermé.
      }
      socket.close();
      process_.kill();
      await sleep(200);
      try {
        rmSync(userData, { recursive: true, force: true });
      } catch {
        // Un fichier verrouillé par Chrome en cours d'arrêt : le dossier est temporaire, il sera purgé par le système.
      }
    },
  };
  return api;
}
