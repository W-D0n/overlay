import { describe, expect, test } from 'bun:test';
import { ALERT_CLASS_MS, BRIDGE_VERSION, MAX_REPORTED_ERRORS, bridge, composeDocument, contentSecurityPolicy, resolveAssetReferences } from './code-document.js';
import { parseParamSpec, normalizeParamValues } from './code-params.js';

const BASE = 'http://localhost:5932';
const ID = 'a'.repeat(32);

describe('resolveAssetReferences', () => {
  test('asset:<identifiant> devient l’adresse du fichier dans la médiathèque, où qu’il soit écrit', () => {
    expect(resolveAssetReferences(`url(asset:${ID}) "asset:${ID}"`, BASE)).toBe(`url(${BASE}/assets/${ID}) "${BASE}/assets/${ID}"`);
  });

  test('une référence trop courte, trop longue ou sans le préfixe n’est pas touchée', () => {
    expect(resolveAssetReferences('asset:abc', BASE)).toBe('asset:abc');
    expect(resolveAssetReferences(`${ID}`, BASE)).toBe(ID);
    expect(resolveAssetReferences(`asset:${ID}f`, BASE)).toBe(`${BASE}/assets/${ID}f`);
  });
});

describe('contentSecurityPolicy', () => {
  const policy = contentSecurityPolicy(BASE);

  test('tout est interdit par défaut : ni réseau, ni sous-document, ni formulaire, ni <base>', () => {
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("form-action 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).not.toMatch(/frame-src|child-src/);
  });

  test('seule la médiathèque sort du document : jamais l’origine entière du serveur d’état', () => {
    for (const directive of ['script-src', 'style-src', 'img-src', 'font-src', 'media-src', 'connect-src']) {
      const part = policy.split('; ').find((entry) => entry.startsWith(directive));
      expect(part).toContain(`${BASE}/assets/`);
      expect(part?.split(' ')).not.toContain(BASE);
      expect(part).not.toMatch(/ \*|https?:\/\/(?!localhost)/);
    }
  });

  test('une origine qui n’en est pas une est refusée (elle finirait dans un attribut)', () => {
    expect(() => contentSecurityPolicy('http://x" onload="1')).toThrow();
    expect(() => contentSecurityPolicy('javascript:alert(1)')).toThrow();
    expect(() => contentSecurityPolicy(`${BASE}/`)).toThrow();
  });
});

describe('composeDocument', () => {
  const { params } = parseParamSpec('[{"key":"taille","type":"number","default":10}]');
  const base = { html: '<p id="x">Salut</p>', css: 'p{color:red}', js: 'overlay.on("alert",()=>{})', params, values: normalizeParamValues(params, {}), size: { width: 1920, height: 1080 }, pixelRatio: 1, assetBase: BASE };

  test('la politique précède tout autre contenu, la passerelle précède le code de l’auteur', () => {
    const { srcdoc: html } = composeDocument(base);
    const csp = html.indexOf('Content-Security-Policy');
    const bridgeAt = html.indexOf('function bridge');
    expect(csp).toBeGreaterThan(-1);
    expect(csp).toBeLessThan(bridgeAt);
    expect(bridgeAt).toBeLessThan(html.indexOf('p{color:red}'));
    expect(html.indexOf('p{color:red}')).toBeLessThan(html.indexOf('id="x"'));
    expect(html.indexOf('id="x"')).toBeLessThan(html.indexOf('overlay.on("alert"'));
  });

  test('le JavaScript de l’auteur est un module', () => {
    expect(composeDocument(base).srcdoc).toContain('<script type="module">overlay.on("alert",()=>{})</script>');
  });

  test('les références de fichier sont résolues dans le HTML, le CSS et le JavaScript', () => {
    const { srcdoc: html } = composeDocument({ ...base, html: `<img src="asset:${ID}">`, css: `a{background:url(asset:${ID})}`, js: `import "asset:${ID}"` });
    expect(html.match(new RegExp(`${BASE}/assets/${ID}`, 'g'))).toHaveLength(3);
    expect(html).not.toContain(`asset:${ID}`);
  });

  test('un code qui contient </script> ou </style> ne referme pas la balise qui le porte', () => {
    const { srcdoc: html } = composeDocument({ ...base, js: 'const s = "</script><b>"', css: 'a::after{content:"</style>"}' });
    expect(html).not.toContain('"</script><b>"');
    expect(html).toContain('<\\/script><b>');
    expect(html).toContain('<\\/style>');
  });

  test('l’initialisation embarquée ne peut pas refermer son <script> (valeur de réglage hostile)', () => {
    const hostile = { ...base, values: { taille: 1, evil: '</script><script>alert(1)</script>' }, params: [...params, { key: 'evil', label: 'e', type: 'text', default: '' }] };
    const { srcdoc: html } = composeDocument(/** @type {*} */ (hostile));
    const bridgeScript = html.slice(html.indexOf('<script>(function bridge'), html.indexOf('</script>', html.indexOf('<script>(function bridge')));
    expect(bridgeScript).not.toContain('<script>alert');
    expect(bridgeScript).toContain('\\u003c/script>');
  });

  test('scriptLine est la ligne du document où commence le JavaScript de l’auteur, quel que soit le HTML qui le précède', () => {
    for (const html of ['<p>x</p>', '<p>a</p>\n<p>b</p>\n\n<p>c</p>', '']) {
      const { srcdoc, scriptLine } = composeDocument({ ...base, html, js: 'PREMIERE\nSECONDE' });
      const lines = srcdoc.split('\n');
      expect(lines[scriptLine - 1]).toContain('PREMIERE');
      expect(lines[scriptLine]).toContain('SECONDE');
    }
  });

  test('un HTML qui contient lui-même un module ne déplace pas la ligne du JavaScript de l’auteur', () => {
    const { srcdoc, scriptLine } = composeDocument({ ...base, html: '<script type="module">\nautre()\n</script>', js: 'MIEN' });
    expect(srcdoc.split('\n')[scriptLine - 1]).toContain('MIEN');
  });

  test('la politique est posée dans un attribut sans pouvoir en sortir', () => {
    const { srcdoc: html } = composeDocument(base);
    const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
    expect(meta).not.toBeNull();
    expect(meta?.[1]).toContain("default-src 'none'");
  });
});

/** Une fenêtre factice : écouteurs, parent qui enregistre ce qu’on lui poste, minuterie pilotée. */
function fakeWindow() {
  /** @type {Record<string, ((event: any) => void)[]>} */
  const listeners = {};
  const parent = { posted: /** @type {any[]} */ ([]), postMessage(/** @type {any} */ message) { this.posted.push(message); } };
  const classes = new Set();
  const properties = /** @type {Record<string, string>} */ ({});
  let offsetReads = 0;
  /** @type {{ callback: () => void, at: number, handle: number }[]} */
  const timers = [];
  let handleCounter = 0;
  let clock = 0;
  const scope = {
    parent,
    document: {
      documentElement: {
        style: { setProperty: (/** @type {string} */ name, /** @type {string} */ value) => { properties[name] = value; } },
        classList: { add: (/** @type {string} */ name) => classes.add(name), remove: (/** @type {string} */ name) => classes.delete(name) },
        get offsetWidth() { offsetReads += 1; return 0; },
      },
    },
    addEventListener: (/** @type {string} */ type, /** @type {*} */ listener) => { (listeners[type] ??= []).push(listener); },
    setTimeout: (/** @type {() => void} */ callback, /** @type {number} */ delay) => { handleCounter += 1; timers.push({ callback, at: clock + delay, handle: handleCounter }); return handleCounter; },
    clearTimeout: (/** @type {number} */ handle) => { const index = timers.findIndex((timer) => timer.handle === handle); if (index >= 0) timers.splice(index, 1); },
    overlay: /** @type {any} */ (undefined),
  };
  return {
    scope,
    classes,
    properties,
    parent,
    timers,
    offsetReads: () => offsetReads,
    advance(/** @type {number} */ ms) { clock += ms; for (const timer of timers.filter((entry) => entry.at <= clock)) { timers.splice(timers.indexOf(timer), 1); timer.callback(); } },
    dispatch(/** @type {string} */ type, /** @type {*} */ event) { for (const listener of listeners[type] ?? []) listener(event); },
    /** Un message de la fenêtre parente. */
    fromHost(/** @type {any} */ data) { this.dispatch('message', { source: parent, data: { overlayCode: BRIDGE_VERSION, ...data } }); },
  };
}

const INIT = { version: BRIDGE_VERSION, values: { taille: 10 }, variables: { '--param-taille': '10' }, size: { width: 800, height: 600 }, pixelRatio: 2, assetBase: BASE, alertClassMs: ALERT_CLASS_MS, maxErrors: MAX_REPORTED_ERRORS };

describe('bridge (dans le document)', () => {
  test('overlay donne les réglages, la taille, le ratio et les variables CSS dès le départ', () => {
    const win = fakeWindow();
    bridge(INIT, win.scope);
    expect(win.scope.overlay.params).toEqual({ taille: 10 });
    expect(win.scope.overlay.size).toEqual({ width: 800, height: 600 });
    expect(win.scope.overlay.pixelRatio).toBe(2);
    expect(win.properties['--param-taille']).toBe('10');
    expect(win.properties['--audio']).toBe('0');
  });

  test('overlay est figé : le code ne peut ni le remplacer ni y ajouter', () => {
    const win = fakeWindow();
    bridge(INIT, win.scope);
    expect(Object.isFrozen(win.scope.overlay)).toBe(true);
  });

  test('un message de réglages met à jour params, les variables CSS et prévient les écouteurs', () => {
    const win = fakeWindow();
    bridge(INIT, win.scope);
    const seen = [];
    win.scope.overlay.on('params', (/** @type {*} */ values) => seen.push(values));
    win.fromHost({ type: 'params', values: { taille: 50 }, variables: { '--param-taille': '50' } });
    expect(win.scope.overlay.params).toEqual({ taille: 50 });
    expect(win.properties['--param-taille']).toBe('50');
    expect(seen).toEqual([{ taille: 50 }]);
  });

  test('le son devient overlay.levels et --audio…', () => {
    const win = fakeWindow();
    bridge(INIT, win.scope);
    win.fromHost({ type: 'levels', levels: { level: 0.5, bass: 0.25, mid: 0.125, treble: 1 } });
    expect(win.scope.overlay.levels).toEqual({ level: 0.5, bass: 0.25, mid: 0.125, treble: 1 });
    expect(win.properties).toMatchObject({ '--audio': '0.5', '--audio-bass': '0.25', '--audio-mid': '0.125', '--audio-treble': '1' });
  });

  test('un niveau qui n’est pas un nombre vaut le silence', () => {
    const win = fakeWindow();
    bridge(INIT, win.scope);
    win.fromHost({ type: 'levels', levels: { level: 'fort', bass: null } });
    expect(win.scope.overlay.levels).toEqual({ level: 0, bass: 0, mid: 0, treble: 0 });
  });

  test('une alerte pose alert-<type> (relancée de force), prévient les écouteurs, puis la classe disparaît', () => {
    const win = fakeWindow();
    bridge(INIT, win.scope);
    const seen = [];
    win.scope.overlay.on('alert', (/** @type {*} */ alert) => seen.push(alert));
    win.fromHost({ type: 'alert', alert: { type: 'raid', username: 'Lena', amount: 42, ignoré: 1 } });
    expect([...win.classes]).toEqual(['alert-raid']);
    expect(seen).toEqual([{ type: 'raid', username: 'Lena', amount: 42 }]);
    expect(win.offsetReads()).toBe(1);
    win.advance(ALERT_CLASS_MS - 1);
    expect([...win.classes]).toEqual(['alert-raid']);
    win.advance(1);
    expect([...win.classes]).toEqual([]);
  });

  test('une deuxième alerte remplace la première et repart pour la durée complète', () => {
    const win = fakeWindow();
    bridge(INIT, win.scope);
    win.fromHost({ type: 'alert', alert: { type: 'follow' } });
    win.advance(2000);
    win.fromHost({ type: 'alert', alert: { type: 'sub' } });
    expect([...win.classes]).toEqual(['alert-sub']);
    win.advance(2000);
    expect([...win.classes]).toEqual(['alert-sub']);
    win.advance(1000);
    expect([...win.classes]).toEqual([]);
  });

  test('un type d’alerte qui n’est pas un mot court ne devient jamais un nom de classe', () => {
    const win = fakeWindow();
    bridge(INIT, win.scope);
    win.fromHost({ type: 'alert', alert: { type: 'x y"><script>' } });
    expect([...win.classes]).toEqual(['alert-any']);
  });

  test('un message d’une autre fenêtre, sans la bonne version, ou mal formé est ignoré', () => {
    const win = fakeWindow();
    bridge(INIT, win.scope);
    win.dispatch('message', { source: { autre: true }, data: { overlayCode: BRIDGE_VERSION, type: 'params', values: { taille: 99 } } });
    win.dispatch('message', { source: win.parent, data: { overlayCode: BRIDGE_VERSION + 1, type: 'params', values: { taille: 99 } } });
    win.dispatch('message', { source: win.parent, data: 'texte' });
    win.dispatch('message', { source: win.parent, data: null });
    win.fromHost({ type: 'params', values: 'pas un objet' });
    expect(win.scope.overlay.params).toEqual({ taille: 10 });
  });

  test('on() refuse un événement inconnu, rend la désinscription', () => {
    const win = fakeWindow();
    bridge(INIT, win.scope);
    expect(() => win.scope.overlay.on('fantome', () => {})).toThrow('événement inconnu');
    const seen = [];
    const off = win.scope.overlay.on('levels', (/** @type {*} */ levels) => seen.push(levels.level));
    win.fromHost({ type: 'levels', levels: { level: 1 } });
    off();
    win.fromHost({ type: 'levels', levels: { level: 0.5 } });
    expect(seen).toEqual([1]);
  });

  test('un écouteur qui lève est remonté à l’hôte sans empêcher les autres', () => {
    const win = fakeWindow();
    bridge(INIT, win.scope);
    const seen = [];
    win.scope.overlay.on('levels', () => { throw new Error('boum'); });
    win.scope.overlay.on('levels', (/** @type {*} */ levels) => seen.push(levels.level));
    win.fromHost({ type: 'levels', levels: { level: 1 } });
    expect(seen).toEqual([1]);
    expect(win.parent.posted).toEqual([{ overlayCode: BRIDGE_VERSION, type: 'error', message: 'boum', line: null, column: null, library: false }]);
  });

  test('assetUrl construit l’adresse d’un fichier, et refuse tout ce qui n’est pas un identifiant', () => {
    const win = fakeWindow();
    bridge(INIT, win.scope);
    expect(win.scope.overlay.assetUrl(ID)).toBe(`${BASE}/assets/${ID}`);
    expect(() => win.scope.overlay.assetUrl('../state')).toThrow();
    expect(() => win.scope.overlay.assetUrl(`${ID}/../../state`)).toThrow();
  });

  test('les erreurs du code et les promesses rejetées sont remontées, avec leur ligne', () => {
    const win = fakeWindow();
    bridge(INIT, win.scope);
    win.dispatch('error', { message: 'x is not defined', lineno: 7, colno: 3, error: null });
    win.dispatch('unhandledrejection', { reason: new Error('refusée') });
    expect(win.parent.posted.map((message) => [message.type, message.message, message.line])).toEqual([['error', 'x is not defined', 7], ['error', 'refusée', null]]);
  });

  test('une erreur venue d’un fichier de la médiathèque est marquée : ses lignes ne sont pas celles du code de l’auteur', () => {
    const win = fakeWindow();
    bridge(INIT, win.scope);
    win.dispatch('error', { message: 'dans three', lineno: 9000, colno: 1, filename: `${BASE}/assets/${ID}` });
    win.dispatch('error', { message: 'chez moi', lineno: 12, colno: 1, filename: 'about:srcdoc' });
    expect(win.parent.posted.map((message) => message.library)).toEqual([true, false]);
  });

  test('au-delà de la limite, les erreurs ne sont plus remontées (un code qui échoue à chaque image)', () => {
    const win = fakeWindow();
    bridge(INIT, win.scope);
    for (let index = 0; index < MAX_REPORTED_ERRORS + 30; index += 1) win.dispatch('error', { message: 'encore', lineno: 1, colno: 1 });
    expect(win.parent.posted).toHaveLength(MAX_REPORTED_ERRORS);
  });

  test('« ready » part au chargement de la page', () => {
    const win = fakeWindow();
    bridge(INIT, win.scope);
    expect(win.parent.posted).toEqual([]);
    win.dispatch('load', {});
    expect(win.parent.posted).toEqual([{ overlayCode: BRIDGE_VERSION, type: 'ready' }]);
  });

  test('une taille reçue met à jour overlay.size et prévient les écouteurs', () => {
    const win = fakeWindow();
    bridge(INIT, win.scope);
    const seen = [];
    win.scope.overlay.on('resize', (/** @type {*} */ size) => seen.push(size));
    win.fromHost({ type: 'resize', size: { width: 400, height: 300 }, pixelRatio: 3 });
    expect(win.scope.overlay.size).toEqual({ width: 400, height: 300 });
    expect(seen).toEqual([{ width: 400, height: 300, pixelRatio: 3 }]);
  });
});
