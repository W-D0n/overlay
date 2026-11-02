// @ts-check
import { BINDING_SOURCES, BINDING_TARGETS, isTargetId, targetRange } from './layer-bindings.js';

/**
 * layer-timeline.js — La timeline à images clés d'une scène : des **pistes** par couche (une par valeur : opacité, rotation, flou, échelle, position),
 * chacune une suite d'**images clés** `{ t, v, ease }`, et la durée et le mode de lecture de la scène. Module pur, sans DOM : le modèle (forme,
 * bornes, validation, forme canonique), l'évaluation à un instant et l'édition d'une piste. Le moteur (`scene-runtime.js`) évalue et applique ;
 * l'éditeur du Studio (`dev/timeline-controller.js`) édite. Voir docs/specs/timeline.md.
 *
 * Les valeurs pilotées et leurs bornes sont celles des liaisons (`layer-bindings.js`, y compris les réglages numériques d'une couche Code) : une même valeur se règle par la timeline (dans le temps,
 * à date fixe) ou par une liaison (par le son, une alerte) ; **la liaison l'emporte** quand les deux visent la même valeur.
 *
 * @typedef {import('./layer-bindings.js').BindingTarget} TimelineTarget
 * @typedef {'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold'} Ease
 * @typedef {{ t: number, v: number, ease: Ease }} Keyframe
 * @typedef {{ target: TimelineTarget, keys: Keyframe[] }} Track
 * @typedef {{ durationMs: number, loop: 'once' | 'loop', restartOn?: string[] }} SceneTimeline
 */

export const MAX_TRACKS = 6;
export const MAX_KEYS = 24;
export const TIME_LIMITS = Object.freeze({ min: 0, max: 60_000 });
export const DURATION_BOUNDS = Object.freeze({ min: 500, max: 60_000 });
/** Les alertes qui peuvent relancer la lecture : les sources de type impulsion des liaisons (`event:any`, `event:raid`…). */
export const RESTART_SOURCES = Object.freeze(BINDING_SOURCES.filter(({ continuous }) => !continuous).map(({ id, label }) => Object.freeze({ id, label })));
export const DEFAULT_TIMELINE = Object.freeze({ durationMs: 4000, loop: /** @type {'once'} */ ('once') });

/** @type {readonly { id: Ease, label: string }[]} */
export const EASES = /** @type {readonly { id: Ease, label: string }[]} */ (Object.freeze([
  { id: 'linear', label: 'Linéaire' },
  { id: 'easeIn', label: 'Départ lent' },
  { id: 'easeOut', label: 'Arrivée lente' },
  { id: 'easeInOut', label: 'Départ et arrivée lents' },
  { id: 'hold', label: 'Palier (saute à la clé suivante)' },
].map((ease) => Object.freeze(ease))));

/** @param {unknown} value @returns {value is number} */
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
/** @param {number} value @param {number} low @param {number} high */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
/** @param {unknown} target @returns {target is TimelineTarget} */
const isTarget = isTargetId;

/**
 * Les défauts de la timeline d'une scène (vide = valide).
 * @param {string} where
 * @param {unknown} timeline
 * @returns {string[]}
 */
export function sceneTimelineErrors(where, timeline) {
  if (timeline === undefined) return [];
  if (typeof timeline !== 'object' || timeline === null || Array.isArray(timeline)) return [`${where} : objet attendu`];
  const { durationMs, loop, restartOn } = /** @type {Record<string, unknown>} */ (timeline);
  /** @type {string[]} */
  const errors = [];
  if (!isNumber(durationMs)) errors.push(`${where}.durationMs : nombre attendu`);
  if (loop !== 'once' && loop !== 'loop') errors.push(`${where}.loop : « once » ou « loop » attendu`);
  if (restartOn !== undefined) {
    if (!Array.isArray(restartOn)) errors.push(`${where}.restartOn : liste attendue`);
    else if (restartOn.some((id) => !RESTART_SOURCES.some((source) => source.id === id))) errors.push(`${where}.restartOn : alerte inconnue`);
    else if (new Set(restartOn).size !== restartOn.length) errors.push(`${where}.restartOn : une alerte ne figure qu'une fois`);
  }
  return errors;
}

/**
 * Les défauts des pistes d'une couche (vide = valide).
 * @param {string} where
 * @param {unknown} tracks
 * @returns {string[]}
 */
export function trackErrors(where, tracks) {
  if (tracks === undefined) return [];
  if (!Array.isArray(tracks)) return [`${where} : liste attendue`];
  if (tracks.length > MAX_TRACKS) return [`${where} : ${MAX_TRACKS} pistes au plus`];
  /** @type {string[]} */
  const errors = [];
  const seen = new Set();
  tracks.forEach((track, index) => {
    const at = `${where}[${index}]`;
    if (typeof track !== 'object' || track === null) { errors.push(`${at} : objet attendu`); return; }
    const { target, keys } = /** @type {Record<string, unknown>} */ (track);
    if (!isTarget(target)) errors.push(`${at}.target : valeur animée inconnue`);
    else if (seen.has(target)) errors.push(`${at}.target : « ${target} » a déjà une piste`);
    else seen.add(target);
    if (!Array.isArray(keys)) { errors.push(`${at}.keys : liste attendue`); return; }
    if (keys.length > MAX_KEYS) { errors.push(`${at}.keys : ${MAX_KEYS} images clés au plus`); return; }
    let previous = -Infinity;
    keys.forEach((key, position) => {
      const where = `${at}.keys[${position}]`;
      if (typeof key !== 'object' || key === null) { errors.push(`${where} : objet attendu`); return; }
      const { t, v, ease } = /** @type {Record<string, unknown>} */ (key);
      if (!isNumber(t)) errors.push(`${where}.t : nombre attendu`);
      else if (t <= previous) errors.push(`${where}.t : les images clés se suivent dans le temps, sans doublon`);
      else previous = t;
      if (!isNumber(v)) errors.push(`${where}.v : nombre attendu`);
      if (!EASES.some(({ id }) => id === ease)) errors.push(`${where}.ease : courbe inconnue`);
    });
  });
  return errors;
}

/**
 * La forme canonique de la timeline d'une scène : durée bornée, alertes de relance dans l'ordre des sources et sans doublon (une liste vide disparaît :
 * absent = la timeline ne repart qu'à l'arrivée de la scène). Une liste qui n'en est pas une reste telle quelle : `sceneTimelineErrors` la refuse.
 * @param {unknown} timeline
 * @returns {unknown}
 */
export function canonicalSceneTimeline(timeline) {
  if (typeof timeline !== 'object' || timeline === null || Array.isArray(timeline)) return timeline;
  const { restartOn, ...entry } = /** @type {Record<string, unknown>} */ (timeline);
  const known = Array.isArray(restartOn) && restartOn.every((id) => RESTART_SOURCES.some((source) => source.id === id));
  const ordered = known ? RESTART_SOURCES.map(({ id }) => id).filter((id) => /** @type {unknown[]} */ (restartOn).includes(id)) : [];
  return {
    ...entry,
    ...(isNumber(entry.durationMs) ? { durationMs: clamp(Math.round(entry.durationMs), DURATION_BOUNDS.min, DURATION_BOUNDS.max) } : {}),
    ...(restartOn === undefined || (known && ordered.length === 0) ? {} : { restartOn: known ? ordered : restartOn }),
  };
}

/**
 * Vrai si cette alerte relance la lecture de la timeline : `event:any` les relance toutes, `event:<type>` celles de ce type.
 * @param {SceneTimeline} timeline
 * @param {string} type le type de l'alerte (`raid`, `follow`…)
 * @returns {boolean}
 */
export function restartsOn(timeline, type) {
  const list = timeline.restartOn;
  return Array.isArray(list) && (list.includes('event:any') || list.includes(`event:${type}`));
}

/**
 * La forme canonique des pistes d'une couche : chaque temps dans les bornes (arrondi à la milliseconde), chaque valeur dans les bornes de sa cible,
 * les clés triées par temps ; une piste sans clé disparaît, comme une liste vide. Ce qui n'est pas une piste valide reste tel quel (`trackErrors`).
 * @param {unknown} tracks
 * @param {import('./layer-bindings.js').TargetOwner | null} [owner] la couche, pour les bornes d'un réglage
 * @returns {unknown}
 */
export function canonicalTracks(tracks, owner = null) {
  if (!Array.isArray(tracks)) return tracks;
  const kept = tracks.filter((track) => !(typeof track === 'object' && track !== null && Array.isArray(/** @type {*} */ (track).keys) && /** @type {*} */ (track).keys.length === 0));
  if (kept.length === 0) return undefined;
  return kept.map((track) => {
    if (typeof track !== 'object' || track === null || !Array.isArray(track.keys)) return track;
    const range = isTarget(/** @type {*} */ (track).target) ? targetRange(/** @type {*} */ (track).target, owner) : null;
    const keys = track.keys.map((/** @type {*} */ key) => {
      if (typeof key !== 'object' || key === null) return key;
      return {
        ...key,
        ...(isNumber(key.t) ? { t: clamp(Math.round(key.t), TIME_LIMITS.min, TIME_LIMITS.max) } : {}),
        ...(range !== null && isNumber(key.v) ? { v: clamp(key.v, range.min, range.max) } : {}),
      };
    });
    const sorted = keys.every((/** @type {*} */ key) => isNumber(key?.t)) ? [...keys].sort((a, b) => a.t - b.t) : keys;
    return { ...track, keys: sorted };
  });
}

/** Les bornes d'une des six valeurs communes ; `null` pour un réglage, dont les bornes viennent de la couche. @param {TimelineTarget} target @returns {{ min: number, max: number } | null} */
function commonRange(target) {
  return Object.hasOwn(BINDING_TARGETS, target) ? BINDING_TARGETS[/** @type {keyof typeof BINDING_TARGETS} */ (target)] : null;
}

/** @param {number} value @param {{ min: number, max: number } | null} range @returns {number} */
function bounded(value, range) {
  return range === null ? value : clamp(value, range.min, range.max);
}

/** @param {Ease} ease @param {number} x 0..1 @returns {number} */
export function easeValue(ease, x) {
  switch (ease) {
    case 'easeIn': return x * x;
    case 'easeOut': return 1 - (1 - x) * (1 - x);
    case 'easeInOut': return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2;
    case 'hold': return 0;
    default: return x;
  }
}

/**
 * La valeur d'une piste à un instant : la première clé avant elle, la dernière après, entre deux clés l'interpolation selon la courbe de la clé de départ.
 * @param {readonly Keyframe[]} keys triées par temps
 * @param {number} time en millisecondes
 * @returns {number | null} `null` pour une piste sans clé
 */
export function sampleKeys(keys, time) {
  if (keys.length === 0) return null;
  if (time <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (time >= last.t) return last.v;
  let at = 0;
  while (keys[at + 1].t <= time) at += 1;
  const from = keys[at];
  const to = keys[at + 1];
  const x = (time - from.t) / (to.t - from.t);
  return from.v + (to.v - from.v) * easeValue(from.ease, x);
}

/**
 * L'instant de lecture à partir du temps écoulé depuis le départ : en boucle, il revient au début ; sinon il s'arrête à la fin.
 * @param {number} elapsedMs
 * @param {SceneTimeline} timeline
 * @returns {number}
 */
export function playbackTime(elapsedMs, timeline) {
  const elapsed = Math.max(0, elapsedMs);
  return timeline.loop === 'loop' ? elapsed % timeline.durationMs : Math.min(elapsed, timeline.durationMs);
}

/**
 * Les valeurs animées d'une couche à un instant.
 * @param {readonly Track[]} tracks
 * @param {number} time
 * @returns {Partial<Record<TimelineTarget, number>>}
 */
export function evaluateTimeline(tracks, time) {
  /** @type {Partial<Record<TimelineTarget, number>>} */
  const values = {};
  for (const track of tracks) {
    const value = sampleKeys(track.keys, time);
    if (value !== null) values[track.target] = value;
  }
  return values;
}

/**
 * La timeline effective d'une scène : la sienne, ou celle par défaut dont la durée couvre au moins la dernière image clé.
 * @param {SceneTimeline | undefined} timeline
 * @param {readonly { timeline?: readonly Track[] }[]} layers
 * @returns {SceneTimeline}
 */
export function effectiveTimeline(timeline, layers) {
  if (timeline !== undefined) return timeline;
  const last = Math.max(0, ...layers.flatMap((layer) => (layer.timeline ?? []).flatMap((track) => track.keys.map((key) => key.t))));
  return { durationMs: clamp(Math.max(last, DEFAULT_TIMELINE.durationMs), DURATION_BOUNDS.min, DURATION_BOUNDS.max), loop: DEFAULT_TIMELINE.loop };
}

/** Vrai si une couche a une piste avec au moins une clé. @param {readonly Track[] | undefined} tracks */
export function hasKeys(tracks) {
  return tracks?.some((track) => track.keys.length > 0) === true;
}

// ── Édition d'une piste (l'éditeur du Studio) ────────────────────────────────

/**
 * Les pistes avec une image clé de plus (ou la clé de ce temps remplacée) ; la piste est créée au besoin. `null` si la limite de clés ou de pistes serait dépassée.
 * @param {readonly Track[]} tracks
 * @param {TimelineTarget} target
 * @param {number} t
 * @param {number} v
 * @param {Ease} [ease]
 * @param {{ min: number, max: number } | null} [range] les bornes de la valeur (celles des six valeurs communes par défaut ; `null` : sans borne)
 * @returns {Track[] | null}
 */
export function setKey(tracks, target, t, v, ease = 'easeInOut', range = commonRange(target)) {
  const time = clamp(Math.round(t), TIME_LIMITS.min, TIME_LIMITS.max);
  const key = { t: time, v: bounded(v, range), ease };
  const existing = tracks.find((track) => track.target === target);
  if (existing === undefined) {
    return tracks.length >= MAX_TRACKS ? null : [...tracks, { target, keys: [key] }];
  }
  const replaced = existing.keys.some((candidate) => candidate.t === time);
  if (!replaced && existing.keys.length >= MAX_KEYS) return null;
  const keys = (replaced ? existing.keys.map((candidate) => (candidate.t === time ? { ...key, ease: candidate.ease } : candidate)) : [...existing.keys, key]).sort((a, b) => a.t - b.t);
  return tracks.map((track) => (track === existing ? { ...track, keys } : track));
}

/**
 * Les pistes sans la clé `index` de la piste `target` ; une piste vidée disparaît.
 * @param {readonly Track[]} tracks
 * @param {TimelineTarget} target
 * @param {number} index
 * @returns {Track[]}
 */
export function removeKey(tracks, target, index) {
  return tracks
    .map((track) => (track.target === target ? { ...track, keys: track.keys.filter((_key, at) => at !== index) } : track))
    .filter((track) => track.keys.length > 0);
}

/**
 * Les pistes avec une clé modifiée. Changer le temps refuse de se superposer à une autre clé (la liste revient inchangée) et reste trié ; la valeur est
 * bornée. Rend l'index que la clé occupe après le changement, et `refused` quand le changement est impossible (superposition, clé absente).
 * @param {readonly Track[]} tracks
 * @param {TimelineTarget} target
 * @param {number} index
 * @param {{ t?: number, v?: number, ease?: Ease }} change
 * @param {{ min: number, max: number } | null} [range] les bornes de la valeur (celles des six valeurs communes par défaut ; `null` : sans borne)
 * @returns {{ tracks: Track[], index: number, refused: boolean }}
 */
export function changeKey(tracks, target, index, change, range = commonRange(target)) {
  const track = tracks.find((candidate) => candidate.target === target);
  const key = track?.keys[index];
  if (track === undefined || key === undefined) return { tracks: [...tracks], index, refused: true };
  const next = {
    t: change.t === undefined ? key.t : clamp(Math.round(change.t), TIME_LIMITS.min, TIME_LIMITS.max),
    v: change.v === undefined ? key.v : bounded(change.v, range),
    ease: change.ease ?? key.ease,
  };
  if (track.keys.some((other, at) => at !== index && other.t === next.t)) return { tracks: [...tracks], index, refused: true };
  const keys = track.keys.map((other, at) => (at === index ? next : other)).sort((a, b) => a.t - b.t);
  return { tracks: tracks.map((candidate) => (candidate === track ? { ...candidate, keys } : candidate)), index: keys.findIndex((other) => other === next), refused: false };
}

/**
 * La piste retirée.
 * @param {readonly Track[]} tracks
 * @param {TimelineTarget} target
 * @returns {Track[]}
 */
export function removeTrack(tracks, target) {
  return tracks.filter((track) => track.target !== target);
}
