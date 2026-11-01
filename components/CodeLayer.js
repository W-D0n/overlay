// @ts-check
import { STATE_SERVER_URL } from '../ports.config.js';
import { referenceScale } from '../render-reference.js';
import { normalizeKindOptions } from './kind-options.js';
import { BRIDGE_VERSION, composeDocument } from './code-document.js';
import { normalizeParamValues, paramCssVariables, parseParamSpec } from './code-params.js';

/**
 * components/CodeLayer.js — Couche de contenu « code » : du HTML, du CSS et du JavaScript que l'auteur écrit (ou importe), exécutés dans une
 * `iframe` isolée (`sandbox="allow-scripts"`, document composé par `code-document.js`). C'est ce qui rend possibles les animations CSS riches,
 * le canvas, WebGL et une bibliothèque 3D rangée dans la médiathèque.
 *
 * L'hôte et le document ne se parlent que par messages, sur un protocole versionné (`BRIDGE_VERSION`) :
 *   - hôte → document : `params` (réglages), `levels` (son), `alert` (alerte), `resize` (taille) ;
 *   - document → hôte : `ready` (page chargée), `error` (erreur du code, relayée au Studio par `reports`).
 * Seuls les messages venant de **cette** `iframe` sont lus.
 *
 * La page du document est dimensionnée dans le repère de la **source de référence** (une taille en pixels vaut pour la hauteur de référence,
 * comme pour le texte et les effets) puis mise à l'échelle de la source réelle : 96 px de CSS font 96 px de la source de référence quelle que soit
 * la résolution d'OBS. Le document est chargé à la première taille connue ; un changement de code le recharge après une courte pause (la frappe
 * ne recharge pas à chaque lettre), un changement de réglage ne le recharge pas.
 *
 * Une alerte qui arrive avant que le document soit chargé est gardée un court moment et remise à son arrivée : une scène qui s'affiche sur un
 * raid ne doit pas manquer ce raid parce que sa bibliothèque se charge.
 *
 * Une page isolée peut toujours se rediriger elle-même vers une adresse extérieure (aucune directive du navigateur ne l'interdit). L'hôte le voit de
 * deux façons, mesurées : un chargement de l'`iframe` qu'il n'a pas demandé (redirection après le chargement), ou un chargement qui n'est pas suivi du
 * message `ready` de la passerelle (redirection avant la fin du chargement : le document étranger prend la place de celui qui était attendu). Dans les
 * deux cas la page est aussitôt vidée et l'auteur en est prévenu. Voir docs/specs/couche-code.md.
 *
 * @typedef {{
 *   documentRef?: Document,
 *   view?: Window,
 *   ResizeObserverImpl?: typeof ResizeObserver,
 *   assetBase?: string,
 *   sceneHeight?: () => number,
 *   setTimer?: (callback: () => void, delayMs: number) => unknown,
 *   clearTimer?: (handle: unknown) => void,
 *   now?: () => number,
 *   reloadDelayMs?: number,
 * }} CodeLayerEnvironment
 * @typedef {{ message: string, line: number | null, column: number | null }} CodeReport
 */

/** Pause entre la dernière modification du code et le rechargement du document. */
export const RELOAD_DELAY_MS = 250;
/** Alertes gardées en attendant le document, et âge au-delà duquel elles ne sont plus remises. */
const MAX_PENDING_ALERTS = 10;
const PENDING_ALERT_MS = 10_000;
/** Erreurs du code gardées pour le Studio. */
const MAX_KEPT_REPORTS = 20;
/** Délai après le chargement de l'`iframe` pour recevoir `ready` de la passerelle ; passé ce délai, le document n'est pas celui qu'on a composé. */
export const READY_DEADLINE_MS = 1500;

/**
 * Les options complètes d'une couche Code, avec la déclaration des réglages lue et les valeurs qui en découlent.
 * @param {unknown} raw
 */
export function normalizeCodeOptions(raw) {
  const options = normalizeKindOptions('code', raw);
  const html = /** @type {string} */ (options.html);
  const css = /** @type {string} */ (options.css);
  const js = /** @type {string} */ (options.js);
  const paramSpec = /** @type {string} */ (options.paramSpec);
  const spec = parseParamSpec(paramSpec);
  return { html, css, js, paramSpec, params: spec.params, specErrors: spec.errors, values: normalizeParamValues(spec.params, options.params) };
}

/**
 * @param {unknown} rawOptions
 * @param {CodeLayerEnvironment} [environment]
 * @returns {import('../types.js').ComponentInstance}
 */
export function CodeLayer(rawOptions, environment = {}) {
  const documentRef = environment.documentRef ?? document;
  const view = environment.view ?? documentRef.defaultView ?? window;
  const ResizeObserverImpl = environment.ResizeObserverImpl ?? ResizeObserver;
  const assetBase = environment.assetBase ?? STATE_SERVER_URL;
  const setTimer = environment.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimer = environment.clearTimer ?? ((handle) => clearTimeout(/** @type {*} */ (handle)));
  const now = environment.now ?? (() => Date.now());
  const reloadDelayMs = environment.reloadDelayMs ?? RELOAD_DELAY_MS;

  let options = normalizeCodeOptions(rawOptions);

  const wrapper = documentRef.createElement('div');
  wrapper.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
  const frame = documentRef.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.setAttribute('allow', '');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
  frame.title = 'Couche de code';
  frame.style.cssText = 'position:absolute;left:0;top:0;border:0;background:transparent;pointer-events:none;transform-origin:0 0;color-scheme:normal;';
  wrapper.appendChild(frame);

  let logical = { width: 0, height: 0 };
  let scale = 1;
  let loaded = false;
  let ready = false;
  /** Chargements de l'`iframe` que l'hôte a demandés et qui n'ont pas eu lieu ; un chargement quand il n'en attend plus est une navigation de la page. */
  let expectedLoads = 0;
  let quarantined = false;
  /** @type {unknown} */
  let readyTimer = null;
  /** La ligne du document où commence le JavaScript de l'auteur (`composeDocument`). */
  let scriptLine = 1;
  let scriptLines = 0;
  let destroyed = false;
  /** @type {unknown} */
  let reloadTimer = null;
  /** @type {import('../audio-levels.js').AudioLevels | null} */
  let lastLevels = null;
  /** @type {{ event: unknown, at: number }[]} */
  let pendingAlerts = [];
  /** @type {CodeReport[]} */
  let reports = [];
  /** @type {Set<(reports: readonly CodeReport[]) => void>} */
  const subscribers = new Set();

  /** @param {Record<string, unknown>} message */
  function send(message) {
    frame.contentWindow?.postMessage({ overlayCode: BRIDGE_VERSION, ...message }, '*');
  }

  function pixelRatio() {
    return scale * (view.devicePixelRatio ?? 1);
  }

  function notify() {
    for (const subscriber of [...subscribers]) subscriber(reports);
  }

  /** Charge le document à partir des options courantes. */
  function load() {
    loaded = true;
    ready = false;
    reports = [];
    notify();
    const composed = composeDocument({
      html: options.html, css: options.css, js: options.js,
      params: options.params, values: options.values,
      size: logical, pixelRatio: pixelRatio(), assetBase,
    });
    scriptLine = composed.scriptLine;
    scriptLines = options.js.split('\n').length;
    quarantined = false;
    stopReadyWatch();
    expectedLoads += 1;
    frame.srcdoc = composed.srcdoc;
  }

  function stopReadyWatch() {
    if (readyTimer !== null) clearTimer(readyTimer);
    readyTimer = null;
  }

  /** La page a quitté son document : on la vide et on le dit. */
  function quarantine() {
    if (quarantined || destroyed) return;
    quarantined = true;
    ready = false;
    stopReadyWatch();
    expectedLoads += 1;
    frame.srcdoc = '';
    reports = [...reports, { message: 'La page a tenté de quitter son document (navigation) : elle a été arrêtée.', line: null, column: null }].slice(-MAX_KEPT_REPORTS);
    notify();
  }

  /** Un chargement : celui que l'hôte attendait (la passerelle doit alors s'annoncer vite), ou un chargement de trop (navigation de la page). */
  function onFrameLoad() {
    if (destroyed) return;
    if (expectedLoads > 0) {
      expectedLoads -= 1;
      if (!quarantined) {
        stopReadyWatch();
        readyTimer = setTimer(() => { readyTimer = null; if (!ready) quarantine(); }, READY_DEADLINE_MS);
      }
      return;
    }
    quarantine();
  }
  frame.addEventListener('load', onFrameLoad);

  /** Ajuste l'`iframe` au calque ; charge le document à la première taille connue. @returns {boolean} faux tant que le calque n'a pas de taille */
  function fit() {
    const width = wrapper.offsetWidth;
    const height = wrapper.offsetHeight;
    if (!(width > 0) || !(height > 0)) return false;
    const scene = environment.sceneHeight?.();
    scale = referenceScale(scene !== undefined && scene > 0 ? scene : height);
    const next = { width: width / scale, height: height / scale };
    const changed = next.width !== logical.width || next.height !== logical.height;
    logical = next;
    frame.style.width = `${next.width}px`;
    frame.style.height = `${next.height}px`;
    frame.style.transform = `scale(${scale})`;
    if (!loaded) load();
    else if (changed && ready) send({ type: 'resize', size: logical, pixelRatio: pixelRatio() });
    return true;
  }

  const observer = new ResizeObserverImpl(() => { fit(); });
  observer.observe(wrapper);
  fit();

  function flush() {
    send({ type: 'params', values: options.values, variables: paramCssVariables(options.params, options.values) });
    if (lastLevels !== null) send({ type: 'levels', levels: lastLevels });
    const fresh = pendingAlerts.filter(({ at }) => now() - at <= PENDING_ALERT_MS);
    pendingAlerts = [];
    for (const { event } of fresh) send({ type: 'alert', alert: event });
  }

  /**
   * La ligne, dans le JavaScript de l'auteur, d'une erreur que le navigateur a placée dans le document ; `null` si elle n'est pas dans ce code (HTML, CSS,
   * fichier de la médiathèque) ou si le navigateur n'a pas donné de ligne.
   * @param {{ line?: unknown, library?: unknown }} message
   */
  function authorLine(message) {
    if (message.library === true || typeof message.line !== 'number' || !Number.isFinite(message.line)) return null;
    const line = message.line - scriptLine + 1;
    return line >= 1 && line <= scriptLines ? line : null;
  }

  /** @param {MessageEvent} event */
  function onMessage(event) {
    if (event.source === null || event.source !== frame.contentWindow) return;
    const message = event.data;
    if (typeof message !== 'object' || message === null || message.overlayCode !== BRIDGE_VERSION) return;
    if (message.type === 'ready') {
      stopReadyWatch();
      ready = true;
      flush();
    } else if (message.type === 'error' && typeof message.message === 'string') {
      reports = [...reports, {
        message: message.message.slice(0, 500),
        line: authorLine(message),
        column: null,
      }].slice(-MAX_KEPT_REPORTS);
      notify();
    }
  }
  view.addEventListener('message', onMessage);

  /** @param {ReturnType<typeof normalizeCodeOptions>} a @param {ReturnType<typeof normalizeCodeOptions>} b */
  const sameDocument = (a, b) => a.html === b.html && a.css === b.css && a.js === b.js && a.paramSpec === b.paramSpec;

  return {
    el: wrapper,
    cost: () => null,

    /** @param {unknown} next */
    update(next) {
      const merged = normalizeCodeOptions(next);
      const documentChanged = !sameDocument(merged, options);
      const valuesChanged = JSON.stringify(merged.values) !== JSON.stringify(options.values);
      options = merged;
      if (documentChanged) {
        if (!loaded) return;
        if (reloadTimer !== null) clearTimer(reloadTimer);
        reloadTimer = setTimer(() => { reloadTimer = null; if (!destroyed) load(); }, reloadDelayMs);
      } else if (valuesChanged && ready && reloadTimer === null) {
        send({ type: 'params', values: options.values, variables: paramCssVariables(options.params, options.values) });
      }
    },

    /** @param {import('../audio-levels.js').AudioLevels} levels */
    setAudioLevel(levels) {
      lastLevels = { level: levels.level, bass: levels.bass, mid: levels.mid, treble: levels.treble };
      if (ready) send({ type: 'levels', levels: lastLevels });
    },

    /** @param {unknown} payload */
    trigger(payload) {
      const event = /** @type {{ type?: unknown, username?: unknown, amount?: unknown } | null | undefined} */ (payload);
      const alert = { type: event?.type, username: event?.username, amount: event?.amount };
      if (ready) {
        send({ type: 'alert', alert });
        return;
      }
      pendingAlerts = [...pendingAlerts, { event: alert, at: now() }].slice(-MAX_PENDING_ALERTS);
    },

    /** Les erreurs que le code a remontées depuis son dernier chargement : le Studio les montre sous le champ. */
    reports: {
      current: () => reports,
      /** @param {(reports: readonly CodeReport[]) => void} listener @returns {() => void} */
      subscribe(listener) {
        subscribers.add(listener);
        return () => { subscribers.delete(listener); };
      },
    },

    destroy() {
      destroyed = true;
      stopReadyWatch();
      if (reloadTimer !== null) clearTimer(reloadTimer);
      observer.disconnect();
      view.removeEventListener('message', onMessage);
      frame.removeEventListener('load', onFrameLoad);
      subscribers.clear();
      // Une page retirée du document est détruite par le navigateur ; la vider d'abord arrête son code sans attendre.
      frame.srcdoc = '';
      frame.remove();
    },
  };
}
