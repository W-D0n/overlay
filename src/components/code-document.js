// @ts-check
import { CODE_ASSET_REFERENCE } from '../layers/layer-kinds.js';
import { paramCssVariables } from './code-params.js';

/**
 * components/code-document.js — Le document isolé d'une couche Code : ce que l'`iframe` charge (`srcdoc`), construit ici et nulle part ailleurs.
 *
 * Le code de l'auteur ne s'exécute jamais dans la page de rendu ni dans le Studio : il vit dans une `iframe` `sandbox="allow-scripts"` (origine
 * opaque : ni cookies, ni stockage, ni accès à la page qui l'héberge, ni à l'API du Studio) et son document porte une **politique de sécurité
 * du contenu** posée par l'hôte avant tout code de l'auteur. Elle ne laisse sortir le code que vers la médiathèque (`<serveur d'état>/assets/`) :
 * pas de réseau, pas de sous-document, pas de formulaire. Une bibliothèque (three.js) est donc un fichier que l'auteur range dans la médiathèque
 * et référence par `asset:<identifiant>`, jamais une adresse extérieure : le live ne dépend d'aucun réseau.
 *
 * Le document contient, dans l'ordre : la politique, une feuille de base (fond transparent), la **passerelle** (`bridge`, qui définit `overlay`
 * avant le code de l'auteur), le CSS de l'auteur, son HTML, puis son JavaScript en **module** (`import`, `await` de premier niveau).
 *
 * @typedef {{ width: number, height: number }} CodeSize
 * @typedef {{
 *   version: number, values: Record<string, number | string | boolean>, variables: Record<string, string>, size: CodeSize, pixelRatio: number, assetBase: string,
 * }} BridgeInit
 */

/** Version du protocole entre l'hôte et le document ; le message qui n'en porte pas la bonne est ignoré des deux côtés. */
export const BRIDGE_VERSION = 1;

/** Durée pendant laquelle la classe `alert-<type>` reste posée sur la page après une alerte. */
export const ALERT_CLASS_MS = 3000;

/** Les erreurs du code que la passerelle remonte à l'hôte avant de se taire (un code qui échoue à chaque image n'inonde pas le Studio). */
export const MAX_REPORTED_ERRORS = 20;

const ORIGIN_PATTERN = /^https?:\/\/[A-Za-z0-9.\-[\]:]+$/;

/**
 * Remplace chaque `asset:<identifiant>` du texte par l'adresse du fichier dans la médiathèque.
 * @param {string} text
 * @param {string} assetBase l'origine du serveur d'état (`http://localhost:5932`)
 * @returns {string}
 */
export function resolveAssetReferences(text, assetBase) {
  return text.replace(CODE_ASSET_REFERENCE, (_match, id) => `${assetBase}/assets/${id}`);
}

/**
 * La politique de sécurité du contenu du document : tout est interdit, sauf ce que la médiathèque sert et ce qui est interne au document.
 * @param {string} assetBase
 * @returns {string}
 */
export function contentSecurityPolicy(assetBase) {
  if (!ORIGIN_PATTERN.test(assetBase)) throw new Error(`origine de la médiathèque invalide : ${assetBase}`);
  const library = `${assetBase}/assets/`;
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' ${library}`,
    `style-src 'unsafe-inline' ${library}`,
    `img-src data: blob: ${library}`,
    `font-src data: ${library}`,
    `media-src data: blob: ${library}`,
    `connect-src data: blob: ${library}`,
    "worker-src blob:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/**
 * La passerelle : s'exécute **dans** le document, avant le code de l'auteur, et lui donne `overlay`. Elle est écrite comme une fonction pour être
 * typée et testée, puis injectée par son texte : elle ne doit rien utiliser qui lui soit extérieur.
 *
 * Hôte → document : `params`, `levels`, `alert`, `resize`. Document → hôte : `ready`, `error`. Seuls les messages de la fenêtre parente et portant la bonne
 * version sont lus. Les réglages et le son sont aussi posés en variables CSS (`--param-<clé>`, `--audio`, `--audio-bass`, `--audio-mid`, `--audio-treble`) ;
 * une alerte pose `alert-<type>` sur la page (la classe est retirée et reposée de force, ce qui relance les animations CSS) pendant `alertClassMs`.
 *
 * @param {BridgeInit & { alertClassMs: number, maxErrors: number }} init
 * @param {any} [scope] la fenêtre du document (injectée par les tests)
 */
export function bridge(init, scope = globalThis) {
  const doc = scope.document;
  const root = doc.documentElement;
  /** @type {Record<string, Set<(value: any) => void>>} */
  const listeners = { params: new Set(), levels: new Set(), alert: new Set(), resize: new Set() };
  const state = {
    params: init.values,
    levels: { level: 0, bass: 0, mid: 0, treble: 0 },
    size: init.size,
    pixelRatio: init.pixelRatio,
  };
  let reported = 0;
  /** @type {any} */
  let alertTimer = null;
  /** @type {string | null} */
  let alertClass = null;

  /** @param {Record<string, unknown>} message */
  const post = (message) => scope.parent.postMessage({ overlayCode: init.version, ...message }, '*');

  /** @param {unknown} error @param {number} [line] @param {number} [column] @param {string} [filename] */
  function report(error, line, column, filename) {
    if (reported >= init.maxErrors) return;
    reported += 1;
    const text = error !== null && typeof error === 'object' && 'message' in error ? String(/** @type {any} */ (error).message) : String(error);
    // Une erreur d'un fichier de la médiathèque (bibliothèque) a ses lignes à elle : l'hôte ne les rapporte pas au code de l'auteur.
    const library = typeof filename === 'string' && filename.startsWith(`${init.assetBase}/assets/`);
    post({ type: 'error', message: text.slice(0, 500), line: line ?? null, column: column ?? null, library });
  }

  /** @param {string} type @param {unknown} value */
  function emit(type, value) {
    for (const listener of [...listeners[type]]) {
      try {
        listener(value);
      } catch (error) {
        report(error);
      }
    }
  }

  /** @param {Record<string, string>} variables */
  function setVariables(variables) {
    for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
  }

  /** @param {{ level?: number, bass?: number, mid?: number, treble?: number }} levels */
  function applyLevels(levels) {
    const next = { level: Number(levels.level) || 0, bass: Number(levels.bass) || 0, mid: Number(levels.mid) || 0, treble: Number(levels.treble) || 0 };
    state.levels = next;
    setVariables({ '--audio': String(next.level), '--audio-bass': String(next.bass), '--audio-mid': String(next.mid), '--audio-treble': String(next.treble) });
    emit('levels', next);
  }

  /** @param {{ type?: unknown, username?: unknown, amount?: unknown }} alert */
  function applyAlert(alert) {
    const type = typeof alert.type === 'string' && /^[a-z]{1,16}$/.test(alert.type) ? alert.type : 'any';
    if (alertClass !== null) root.classList.remove(alertClass);
    // Lire une mesure force le navigateur à résoudre le retrait : sans cela, retirer puis reposer la même classe ne relancerait pas l'animation.
    void root.offsetWidth;
    alertClass = `alert-${type}`;
    root.classList.add(alertClass);
    scope.clearTimeout(alertTimer);
    alertTimer = scope.setTimeout(() => {
      if (alertClass !== null) root.classList.remove(alertClass);
      alertClass = null;
    }, init.alertClassMs);
    emit('alert', {
      type,
      ...(typeof alert.username === 'string' ? { username: alert.username } : {}),
      ...(typeof alert.amount === 'number' && Number.isFinite(alert.amount) ? { amount: alert.amount } : {}),
    });
  }

  root.style.setProperty('color-scheme', 'normal');
  setVariables(init.variables);
  setVariables({ '--audio': '0', '--audio-bass': '0', '--audio-mid': '0', '--audio-treble': '0' });

  scope.overlay = Object.freeze({
    version: init.version,
    get params() { return state.params; },
    get levels() { return state.levels; },
    get size() { return state.size; },
    get pixelRatio() { return state.pixelRatio; },
    /** @param {string} type @param {(value: any) => void} listener */
    on(type, listener) {
      const set = listeners[type];
      if (set === undefined || typeof listener !== 'function') throw new TypeError(`overlay.on : événement inconnu « ${type} » (params, levels, alert, resize)`);
      set.add(listener);
      return () => { set.delete(listener); };
    },
    /** @param {string} id */
    assetUrl(id) {
      if (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id)) throw new TypeError('overlay.assetUrl : identifiant de fichier invalide');
      return `${init.assetBase}/assets/${id}`;
    },
  });

  scope.addEventListener('message', (/** @type {any} */ event) => {
    if (event.source !== scope.parent) return;
    const message = event.data;
    if (typeof message !== 'object' || message === null || message.overlayCode !== init.version) return;
    if (message.type === 'params' && typeof message.values === 'object' && message.values !== null) {
      state.params = message.values;
      if (typeof message.variables === 'object' && message.variables !== null) setVariables(message.variables);
      emit('params', state.params);
    } else if (message.type === 'levels' && typeof message.levels === 'object' && message.levels !== null) {
      applyLevels(message.levels);
    } else if (message.type === 'alert' && typeof message.alert === 'object' && message.alert !== null) {
      applyAlert(message.alert);
    } else if (message.type === 'resize' && typeof message.size === 'object' && message.size !== null) {
      state.size = { width: Number(message.size.width) || 0, height: Number(message.size.height) || 0 };
      state.pixelRatio = Number(message.pixelRatio) || state.pixelRatio;
      emit('resize', { ...state.size, pixelRatio: state.pixelRatio });
    }
  });
  scope.addEventListener('error', (/** @type {any} */ event) => report(event.error ?? event.message, event.lineno, event.colno, event.filename));
  scope.addEventListener('unhandledrejection', (/** @type {any} */ event) => report(event.reason));
  scope.addEventListener('load', () => post({ type: 'ready' }));
}

/** @param {unknown} value @returns {string} du JSON qui ne peut pas refermer la balise `<script>` qui le porte */
function inlineJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/**
 * Le document complet d'une couche Code, et la ligne (à partir de 1) où commence le JavaScript de l'auteur : une erreur du module est rapportée par
 * le navigateur à sa ligne dans le **document**, que l'hôte ramène à la ligne du code de l'auteur.
 * @param {{
 *   html: string, css: string, js: string,
 *   params: readonly import('./code-params.js').ParamDefinition[], values: import('./code-params.js').ParamValues,
 *   size: CodeSize, pixelRatio: number, assetBase: string,
 * }} input
 * @returns {{ srcdoc: string, scriptLine: number }}
 */
export function composeDocument({ html, css, js, params, values, size, pixelRatio, assetBase }) {
  const policy = contentSecurityPolicy(assetBase);
  /** @type {BridgeInit & { alertClassMs: number, maxErrors: number }} */
  const init = {
    version: BRIDGE_VERSION,
    values,
    variables: paramCssVariables(params, values),
    size,
    pixelRatio,
    assetBase,
    alertClassMs: ALERT_CLASS_MS,
    maxErrors: MAX_REPORTED_ERRORS,
  };
  const style = resolveAssetReferences(css, assetBase).replace(/<\/(style)/gi, '<\\/$1');
  const script = resolveAssetReferences(js, assetBase).replace(/<\/(script)/gi, '<\\/$1');
  const before = [
    '<!doctype html>',
    '<html lang="fr"><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${policy.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`,
    '<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent}</style>',
    `<script>(${bridge.toString()})(${inlineJson(init)});</script>`,
    `<style>${style}</style>`,
    '</head><body>',
    resolveAssetReferences(html, assetBase),
  ].join('\n');
  return {
    srcdoc: `${before}\n<script type="module">${script}</script>\n</body></html>`,
    scriptLine: before.split('\n').length + 1,
  };
}
