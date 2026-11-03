// @ts-check
import { EASES, RESTART_SOURCES, easeValue, restartsOn } from './layer-timeline.js';

/**
 * layer-animation.js — L'animation d'une couche : une **entrée**, une **boucle** et une **sortie** choisies parmi des préréglages, jouées par l'**horloge propre de la couche**
 * (elle démarre quand la couche est montée et repart à une alerte choisie). Module pur, sans DOM : le modèle (forme, bornes, validation, forme canonique), l'évaluation à un instant
 * et la composition avec les valeurs de base d'une couche. Le moteur (`scene-runtime.js`) tient l'horloge et applique ; l'éditeur du Studio règle. Voir docs/specs/animations-de-couche.md.
 *
 * Une animation s'applique **par-dessus** les valeurs de base de la couche (réglage manuel, timeline, liaisons) : opacité et échelle se multiplient, décalages, rotation et flou s'ajoutent,
 * la révélation par masque s'ajoute au rognage.
 *
 * @typedef {'fade' | 'slide-bottom' | 'slide-top' | 'slide-right' | 'slide-left' | 'zoom' | 'bounce' | 'blur' | 'spin' | 'wipe-right' | 'wipe-left' | 'wipe-down' | 'wipe-up' | 'glitch'} PresetId
 * @typedef {'float' | 'pulse' | 'sway' | 'blink' | 'shake'} LoopId
 * @typedef {'linear' | 'easeIn' | 'easeOut' | 'easeInOut'} AnimationEase
 * @typedef {{ preset: PresetId, durationMs: number, delayMs?: number, ease?: AnimationEase }} Enter
 * @typedef {{ preset: LoopId, periodMs: number, amount?: number }} Loop
 * @typedef {{ preset: PresetId, durationMs: number, afterMs?: number, onLeave?: boolean, ease?: AnimationEase }} Exit
 * @typedef {{ enter?: Enter, loop?: Loop, exit?: Exit, restartOn?: string[] }} Animation
 * @typedef {{ top: number, right: number, bottom: number, left: number }} Reveal part de la couche masquée par côté (0 = tout visible, 1 = tout masqué)
 * @typedef {{ opacity: number, x: number, y: number, scale: number, rotation: number, blur: number, reveal: Reveal }} Pose l'écart au repos d'une couche à un instant
 * @typedef {{ id: PresetId, label: string, ease: AnimationEase, pose: (p: number) => Pose }} Preset
 * @typedef {{ id: LoopId, label: string, pose: (phase: number, amount: number) => Pose }} LoopPreset
 */

export const DURATION_LIMITS = Object.freeze({ min: 50, max: 60_000 });
export const DELAY_LIMITS = Object.freeze({ min: 0, max: 60_000 });
export const PERIOD_LIMITS = Object.freeze({ min: 200, max: 60_000 });
export const AFTER_LIMITS = Object.freeze({ min: 0, max: 3_600_000 });
export const AMOUNT_LIMITS = Object.freeze({ min: 0.1, max: 2 });
export const DEFAULT_AMOUNT = 1;

/** Les courbes d'une entrée ou d'une sortie : celles de la timeline, sans le palier (qui laisserait la couche invisible). */
export const ANIMATION_EASES = Object.freeze(EASES.filter(({ id }) => id !== 'hold'));

/** @returns {Pose} */
function rest() {
  return { opacity: 1, x: 0, y: 0, scale: 1, rotation: 0, blur: 0, reveal: { top: 0, right: 0, bottom: 0, left: 0 } };
}

/** @param {Partial<Omit<Pose, 'reveal'>> & { reveal?: Partial<Reveal> }} change @returns {Pose} */
function pose(change) {
  const neutral = rest();
  return { ...neutral, ...change, reveal: { ...neutral.reveal, ...change.reveal } };
}

/** Dépassement de fin de course (la « petite surprise » d'un rebond). @param {number} p */
function overshoot(p) {
  const c1 = 1.70158;
  return 1 + (c1 + 1) * (p - 1) ** 3 + c1 * (p - 1) ** 2;
}

/**
 * Les préréglages d'entrée et de sortie : `pose(p)` donne l'écart au repos pour une présence `p` de 0 (couche invisible) à 1 (au repos).
 * La sortie rejoue le même préréglage à l'envers. `ease` : la courbe de départ.
 */
export const PRESETS = Object.freeze(/** @type {Preset[]} */ ([
  { id: 'fade', label: 'Fondu', ease: 'easeInOut', pose: (p) => pose({ opacity: p }) },
  { id: 'slide-bottom', label: 'Glisse depuis le bas', ease: 'easeOut', pose: (p) => pose({ opacity: p, y: (1 - p) * 12 }) },
  { id: 'slide-top', label: 'Glisse depuis le haut', ease: 'easeOut', pose: (p) => pose({ opacity: p, y: (p - 1) * 12 }) },
  { id: 'slide-right', label: 'Glisse depuis la droite', ease: 'easeOut', pose: (p) => pose({ opacity: p, x: (1 - p) * 12 }) },
  { id: 'slide-left', label: 'Glisse depuis la gauche', ease: 'easeOut', pose: (p) => pose({ opacity: p, x: (p - 1) * 12 }) },
  { id: 'zoom', label: 'Zoom', ease: 'easeOut', pose: (p) => pose({ opacity: p, scale: 0.6 + 0.4 * p }) },
  { id: 'bounce', label: 'Rebond', ease: 'linear', pose: (p) => pose({ opacity: Math.min(1, p * 4), scale: Math.max(0, overshoot(p)) }) },
  { id: 'blur', label: 'Flou', ease: 'easeOut', pose: (p) => pose({ opacity: p, blur: (1 - p) * 12 }) },
  { id: 'spin', label: 'Rotation', ease: 'easeOut', pose: (p) => pose({ opacity: p, rotation: (p - 1) * 90, scale: 0.5 + 0.5 * p }) },
  { id: 'wipe-right', label: 'Révélation vers la droite', ease: 'easeInOut', pose: (p) => pose({ reveal: { right: 1 - p } }) },
  { id: 'wipe-left', label: 'Révélation vers la gauche', ease: 'easeInOut', pose: (p) => pose({ reveal: { left: 1 - p } }) },
  { id: 'wipe-down', label: 'Révélation vers le bas', ease: 'easeInOut', pose: (p) => pose({ reveal: { bottom: 1 - p } }) },
  { id: 'wipe-up', label: 'Révélation vers le haut', ease: 'easeInOut', pose: (p) => pose({ reveal: { top: 1 - p } }) },
  {
    id: 'glitch',
    label: 'Glitch',
    ease: 'linear',
    // Un tremblement et un clignotement qui se calment à l'arrivée ; une fonction de `p` seule, donc rejouable à l'identique.
    pose: (p) => pose({ opacity: p <= 0 ? 0 : p >= 1 ? 1 : (Math.sin(p * 83) > -0.2 ? 1 : 0.15) * Math.min(1, p * 6), x: p >= 1 ? 0 : Math.sin(p * 97) * (1 - p) * 4 }),
  },
]).map((preset) => Object.freeze(preset)));

/**
 * Les boucles : `pose(phase, amount)` avec `phase` en tours (0, 1, 2… un tour = une période).
 */
export const LOOPS = Object.freeze(/** @type {LoopPreset[]} */ ([
  { id: 'float', label: 'Flottement', pose: (phase, amount) => pose({ y: Math.sin(phase * 2 * Math.PI) * 1.5 * amount }) },
  { id: 'pulse', label: 'Pulsation', pose: (phase, amount) => pose({ scale: 1 + Math.sin(phase * 2 * Math.PI) * 0.04 * amount }) },
  { id: 'sway', label: 'Balancement', pose: (phase, amount) => pose({ rotation: Math.sin(phase * 2 * Math.PI) * 3 * amount }) },
  { id: 'blink', label: 'Clignotement', pose: (phase, amount) => pose({ opacity: Math.max(0, 1 - 0.65 * amount * (0.5 - 0.5 * Math.cos(phase * 2 * Math.PI))) }) },
  { id: 'shake', label: 'Tremblement', pose: (phase, amount) => pose({ x: (0.8 * Math.sin(phase * 14 * Math.PI) + 0.4 * Math.sin(phase * 26 * Math.PI)) * 0.6 * amount }) },
]).map((loop) => Object.freeze(loop)));

/** @param {unknown} value @returns {value is number} */
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
/** @param {number} value @param {number} low @param {number} high */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** @param {unknown} id @returns {Preset | undefined} */
const presetOf = (id) => PRESETS.find((preset) => preset.id === id);
/** @param {unknown} id @returns {LoopPreset | undefined} */
const loopOf = (id) => LOOPS.find((loop) => loop.id === id);

/**
 * @param {string} where @param {unknown} value @param {string} key @param {{ min: number, max: number }} limits
 * @param {string[]} errors
 */
function checkNumber(where, value, key, limits, errors) {
  if (!isNumber(value)) errors.push(`${where}.${key} : nombre attendu`);
  else if (value < limits.min || value > limits.max) errors.push(`${where}.${key} : entre ${limits.min} et ${limits.max} attendu`);
}

/**
 * Les défauts de l'animation d'une couche (vide = valide).
 * @param {string} where
 * @param {unknown} animation
 * @returns {string[]}
 */
export function animationErrors(where, animation) {
  if (animation === undefined) return [];
  if (!isObject(animation)) return [`${where} : objet attendu`];
  /** @type {string[]} */
  const errors = [];
  const { enter, loop, exit, restartOn } = animation;
  if (enter !== undefined) {
    if (!isObject(enter)) errors.push(`${where}.enter : objet attendu`);
    else {
      if (presetOf(enter.preset) === undefined) errors.push(`${where}.enter.preset : préréglage inconnu`);
      checkNumber(`${where}.enter`, enter.durationMs, 'durationMs', DURATION_LIMITS, errors);
      if (enter.delayMs !== undefined) checkNumber(`${where}.enter`, enter.delayMs, 'delayMs', DELAY_LIMITS, errors);
      if (enter.ease !== undefined && !ANIMATION_EASES.some(({ id }) => id === enter.ease)) errors.push(`${where}.enter.ease : courbe inconnue`);
    }
  }
  if (loop !== undefined) {
    if (!isObject(loop)) errors.push(`${where}.loop : objet attendu`);
    else {
      if (loopOf(loop.preset) === undefined) errors.push(`${where}.loop.preset : boucle inconnue`);
      checkNumber(`${where}.loop`, loop.periodMs, 'periodMs', PERIOD_LIMITS, errors);
      if (loop.amount !== undefined) checkNumber(`${where}.loop`, loop.amount, 'amount', AMOUNT_LIMITS, errors);
    }
  }
  if (exit !== undefined) {
    if (!isObject(exit)) errors.push(`${where}.exit : objet attendu`);
    else {
      if (presetOf(exit.preset) === undefined) errors.push(`${where}.exit.preset : préréglage inconnu`);
      checkNumber(`${where}.exit`, exit.durationMs, 'durationMs', DURATION_LIMITS, errors);
      if (exit.afterMs !== undefined) checkNumber(`${where}.exit`, exit.afterMs, 'afterMs', AFTER_LIMITS, errors);
      if (exit.onLeave !== undefined && typeof exit.onLeave !== 'boolean') errors.push(`${where}.exit.onLeave : booléen attendu`);
      if (exit.ease !== undefined && !ANIMATION_EASES.some(({ id }) => id === exit.ease)) errors.push(`${where}.exit.ease : courbe inconnue`);
      if (exit.afterMs === undefined && exit.onLeave !== true) errors.push(`${where}.exit : un instant (afterMs) ou le départ de la scène (onLeave) est attendu`);
    }
  }
  if (restartOn !== undefined) {
    if (!Array.isArray(restartOn)) errors.push(`${where}.restartOn : liste attendue`);
    else if (restartOn.some((id) => !RESTART_SOURCES.some((source) => source.id === id))) errors.push(`${where}.restartOn : alerte inconnue`);
    else if (new Set(restartOn).size !== restartOn.length) errors.push(`${where}.restartOn : une alerte ne figure qu'une fois`);
  }
  return errors;
}

/**
 * Un champ numérique de la forme canonique : arrondi et borné, retiré quand il vaut sa valeur par défaut ; absent reste absent, et un champ qui n'est pas un nombre reste tel quel (`animationErrors` le refuse).
 * @param {string} key @param {unknown} value @param {{ min: number, max: number }} limits @param {number | null} neutral @param {number} [precision] décimales gardées
 * @returns {Record<string, unknown>}
 */
function numberField(key, value, limits, neutral, precision = 0) {
  if (value === undefined) return {};
  if (!isNumber(value)) return { [key]: value };
  const scale = 10 ** precision;
  const bounded = Math.round(clamp(value, limits.min, limits.max) * scale) / scale;
  return bounded === neutral ? {} : { [key]: bounded };
}

/**
 * La forme canonique : durées et amplitudes dans leurs bornes, alertes de relance dans l'ordre des sources sans doublon, une valeur par défaut non écrite (amplitude 1, sortie
 * « au départ » à faux, courbe propre au préréglage), les alertes de relance retirées quand il n'y a rien à relancer, et rien du tout quand l'animation est vide.
 * Ce qui n'est pas une animation valide reste tel quel : `animationErrors` le refuse.
 * @param {unknown} animation
 * @returns {unknown}
 */
export function canonicalAnimation(animation) {
  if (!isObject(animation)) return animation;
  const { enter, loop, exit, restartOn, ...others } = animation;
  /** @type {Record<string, unknown>} */
  const result = { ...others };

  if (isObject(enter)) {
    const { durationMs, delayMs, ease, ...entry } = enter;
    result.enter = {
      ...entry,
      ...numberField('durationMs', durationMs, DURATION_LIMITS, null),
      ...numberField('delayMs', delayMs, DELAY_LIMITS, 0),
      ...(ease === undefined || ease === presetOf(entry.preset)?.ease ? {} : { ease }),
    };
  } else if (enter !== undefined) result.enter = enter;

  if (isObject(loop)) {
    const { periodMs, amount, ...entry } = loop;
    result.loop = {
      ...entry,
      ...numberField('periodMs', periodMs, PERIOD_LIMITS, null),
      ...numberField('amount', amount, AMOUNT_LIMITS, DEFAULT_AMOUNT, 2),
    };
  } else if (loop !== undefined) result.loop = loop;

  if (isObject(exit)) {
    const { durationMs, afterMs, onLeave, ease, ...entry } = exit;
    result.exit = {
      ...entry,
      ...numberField('durationMs', durationMs, DURATION_LIMITS, null),
      ...(isNumber(afterMs) ? { afterMs: clamp(Math.round(afterMs), AFTER_LIMITS.min, AFTER_LIMITS.max) } : afterMs === undefined ? {} : { afterMs }),
      ...(onLeave === false || onLeave === undefined ? {} : { onLeave }),
      ...(ease === undefined || ease === presetOf(entry.preset)?.ease ? {} : { ease }),
    };
  } else if (exit !== undefined) result.exit = exit;

  const known = Array.isArray(restartOn) && restartOn.every((id) => RESTART_SOURCES.some((source) => source.id === id));
  const ordered = known ? RESTART_SOURCES.map(({ id }) => id).filter((id) => /** @type {unknown[]} */ (restartOn).includes(id)) : [];
  const hasPhase = result.enter !== undefined || result.loop !== undefined || result.exit !== undefined;
  if (restartOn !== undefined && !(known && (ordered.length === 0 || !hasPhase))) result.restartOn = known ? ordered : restartOn;

  return Object.keys(result).length === 0 ? undefined : result;
}

/** @param {Pose} a @param {Pose} b @returns {Pose} */
function combine(a, b) {
  return {
    opacity: a.opacity * b.opacity,
    x: a.x + b.x,
    y: a.y + b.y,
    scale: a.scale * b.scale,
    rotation: a.rotation + b.rotation,
    blur: a.blur + b.blur,
    reveal: {
      top: Math.max(a.reveal.top, b.reveal.top),
      right: Math.max(a.reveal.right, b.reveal.right),
      bottom: Math.max(a.reveal.bottom, b.reveal.bottom),
      left: Math.max(a.reveal.left, b.reveal.left),
    },
  };
}

/** @param {Pose} from @param {number} weight 0 : au repos, 1 : tel quel @returns {Pose} */
function blendToRest(from, weight) {
  return {
    opacity: 1 + (from.opacity - 1) * weight,
    x: from.x * weight,
    y: from.y * weight,
    scale: 1 + (from.scale - 1) * weight,
    rotation: from.rotation * weight,
    blur: from.blur * weight,
    reveal: { top: from.reveal.top * weight, right: from.reveal.right * weight, bottom: from.reveal.bottom * weight, left: from.reveal.left * weight },
  };
}

/** @param {number} elapsedMs @param {number} startMs @param {number} durationMs @param {AnimationEase} ease @returns {number} avancement de 0 à 1, courbe appliquée */
function progress(elapsedMs, startMs, durationMs, ease) {
  return easeValue(ease, clamp((elapsedMs - startMs) / durationMs, 0, 1));
}

/**
 * L'instant, sur l'horloge de la couche, où la sortie démarre : à date fixe (`afterMs`), au départ de la scène (`onLeave`, une fois la scène partie), le premier des deux.
 * @param {Exit} exit @param {number | null} leftAtMs l'instant où la scène a été remplacée, `null` tant qu'elle est en place
 * @returns {number | null}
 */
function exitStart(exit, leftAtMs) {
  const starts = [exit.afterMs, exit.onLeave === true ? (leftAtMs ?? undefined) : undefined].filter((start) => start !== undefined);
  return starts.length === 0 ? null : Math.min(...starts);
}

/**
 * L'état de l'animation d'une couche à un instant de son horloge.
 * @param {Animation | undefined} animation
 * @param {number} elapsedMs le temps écoulé depuis le démarrage (ou la relance) de l'horloge de la couche
 * @param {number | null} [leftAtMs] l'instant où la scène a été remplacée (sortie « au départ »), `null` tant qu'elle est en place
 * @returns {{ pose: Pose, gone: boolean }} `gone` : la sortie est finie, la couche est invisible jusqu'à la relance
 */
export function evaluateAnimation(animation, elapsedMs, leftAtMs = null) {
  if (animation === undefined) return { pose: rest(), gone: false };
  const { enter, loop, exit } = animation;
  const entering = enter === undefined ? undefined : presetOf(enter.preset);
  const leaving = exit === undefined ? undefined : presetOf(exit.preset);

  const delay = enter?.delayMs ?? 0;
  const enterEnd = enter === undefined ? 0 : delay + enter.durationMs;
  const leaveAt = exit === undefined ? null : exitStart(exit, leftAtMs);

  // Présence : 0 invisible, 1 au repos. Une sortie qui démarre pendant l'entrée part de la présence atteinte.
  const arrival = enter === undefined || entering === undefined ? 1 : progress(Math.min(elapsedMs, leaveAt ?? Infinity), delay, enter.durationMs, enter.ease ?? entering.ease);
  const leavingNow = exit !== undefined && leaving !== undefined && leaveAt !== null && elapsedMs >= leaveAt;
  const departure = leavingNow ? progress(elapsedMs, leaveAt, exit.durationMs, exit.ease ?? leaving.ease) : 0;
  const presence = arrival * (1 - departure);

  const gone = leavingNow && departure >= 1;
  const base = leavingNow ? leaving.pose(presence) : entering === undefined ? rest() : entering.pose(presence);

  const spinner = loop === undefined ? undefined : loopOf(loop.preset);
  if (loop === undefined || spinner === undefined || elapsedMs < enterEnd) return { pose: base, gone };
  const looping = spinner.pose((elapsedMs - enterEnd) / loop.periodMs, loop.amount ?? DEFAULT_AMOUNT);
  return { pose: combine(base, blendToRest(looping, 1 - departure)), gone };
}

/**
 * Les valeurs d'une couche, de base puis animée : ce que le moteur écrit dans le style de son calque.
 * @param {{ opacity: number, rotation?: number, blur?: number }} layer
 * @param {Partial<Record<'opacity' | 'rotation' | 'blur' | 'scale' | 'x' | 'y', number>>} bound les valeurs de la timeline et des liaisons
 * @param {Pose} animated
 * @returns {{ opacity: number, rotation: number, blur: number, scale: number, x: number, y: number, reveal: Reveal }}
 */
export function applyPose(layer, bound, animated) {
  return {
    opacity: (bound.opacity ?? layer.opacity) * animated.opacity,
    rotation: (bound.rotation ?? layer.rotation ?? 0) + animated.rotation,
    blur: Math.max(0, (bound.blur ?? layer.blur ?? 0) + animated.blur),
    scale: (bound.scale ?? 1) * animated.scale,
    x: (bound.x ?? 0) + animated.x,
    y: (bound.y ?? 0) + animated.y,
    reveal: animated.reveal,
  };
}

/**
 * Vrai si cette alerte relance l'horloge de la couche : `event:any` les relance toutes, `event:<type>` celles de ce type.
 * @param {Animation | undefined} animation @param {string} type
 * @returns {boolean}
 */
export function restartsAnimationOn(animation, type) {
  return animation !== undefined && restartsOn(/** @type {*} */ (animation), type);
}

/**
 * Le temps que la scène sortante doit rester en place pour que cette couche joue sa sortie « au départ de la scène » (0 : elle n'en a pas).
 * @param {Animation | undefined} animation
 * @returns {number}
 */
export function leaveDelayMs(animation) {
  const exit = animation?.exit;
  return exit?.onLeave === true ? exit.durationMs : 0;
}

// ── Édition ─────────────────────────────────────────────────────────────────

/** Les réglages d'une phase qu'on vient d'activer : une durée utilisable tout de suite. */
const PHASE_DEFAULTS = Object.freeze({
  enter: Object.freeze({ durationMs: 600 }),
  loop: Object.freeze({ periodMs: 3000 }),
  exit: Object.freeze({ durationMs: 600, onLeave: true }),
});

/** Les champs numériques facultatifs de chaque phase : vide dans l'interface = retirés du document. */
const OPTIONAL_FIELDS = Object.freeze({ enter: ['delayMs', 'ease'], loop: ['amount'], exit: ['afterMs', 'ease'] });

/**
 * Choisit le préréglage d'une phase, ou la retire (`null`). Les réglages déjà faits (durée, retard…) sont gardés quand on change de préréglage ; une phase neuve part de valeurs utilisables
 * (la sortie, du départ de la scène). Le résultat est canonique : sans phase, il n'y a plus d'animation (`undefined`).
 * @param {Animation | undefined} animation
 * @param {'enter' | 'loop' | 'exit'} phase
 * @param {string | null} preset
 * @returns {Animation | undefined}
 */
export function setPhase(animation, phase, preset) {
  const { [phase]: current, ...others } = animation ?? {};
  if (preset === null) return /** @type {Animation | undefined} */ (canonicalAnimation(others));
  const next = { ...(current === undefined ? PHASE_DEFAULTS[phase] : current), preset };
  return /** @type {Animation | undefined} */ (canonicalAnimation({ ...others, [phase]: next }));
}

/**
 * Règle un champ d'une phase. Une valeur absente (`null`) retire un champ facultatif (retard, amplitude, instant de sortie) ; la sortie garde toujours un déclencheur (un instant ou le départ de la
 * scène) : un réglage qui l'en priverait est ignoré. Les bornes sont celles de la forme canonique.
 * @param {Animation | undefined} animation
 * @param {'enter' | 'loop' | 'exit'} phase
 * @param {string} field
 * @param {number | boolean | string | null} value
 * @returns {Animation | undefined}
 */
export function changePhase(animation, phase, field, value) {
  const current = animation?.[phase];
  if (animation === undefined || current === undefined) return animation;
  const { [field]: _removed, ...rest } = /** @type {Record<string, unknown>} */ (current);
  if (value === null && !/** @type {readonly string[]} */ (OPTIONAL_FIELDS[phase]).includes(field)) return animation;
  const next = value === null ? rest : { ...rest, [field]: value };
  if (phase === 'exit' && next.afterMs === undefined && next.onLeave !== true) return animation;
  return /** @type {Animation | undefined} */ (canonicalAnimation({ ...animation, [phase]: next }));
}

/**
 * Coche ou décoche une alerte de relance.
 * @param {Animation | undefined} animation
 * @param {string} source
 * @returns {Animation | undefined}
 */
export function toggleRestart(animation, source) {
  if (animation === undefined) return animation;
  const list = animation.restartOn ?? [];
  const next = list.includes(source) ? list.filter((id) => id !== source) : [...list, source];
  return /** @type {Animation | undefined} */ (canonicalAnimation({ ...animation, restartOn: next }));
}
