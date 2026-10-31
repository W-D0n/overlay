// @ts-check
/**
 * layer-bindings.js — Les liaisons d'une couche : une **source** (le son, une alerte) pilote une **valeur** de la couche (opacité,
 * rotation, flou, échelle, position). Module pur, sans DOM ni import : le modèle (forme, bornes, validation), puis l'évaluation, que le
 * moteur (`scene-runtime.js`) appelle à chaque image. Voir docs/specs/liaisons-de-couche.md.
 *
 * Deux familles de source :
 *   - **continue** (`audio`, `bass`, `mid`, `treble`) : la valeur suit le niveau sonore de 0 à 1, lissé sur `durationMs` ;
 *   - **impulsion** (`event:follow`, `event:sub`, `event:raid`, `event:bits`, `event:any`) : à chaque alerte la valeur saute à `to`, puis
 *     revient à `from` en `durationMs`, en ralentissant.
 * Au repos (silence, aucune alerte), la valeur est `from` : une liaison ne change rien tant que sa source ne dit rien.
 * Une valeur liée **remplace** celle de la couche, sauf `scale`, `x` et `y`, qui s'y ajoutent (échelle 1, décalage 0 : neutres).
 *
 * @typedef {'opacity' | 'rotation' | 'blur' | 'scale' | 'x' | 'y'} BindingTarget
 * @typedef {{ source: string, target: BindingTarget, from: number, to: number, durationMs: number }} Binding
 * @typedef {{ level: number, bass: number, mid: number, treble: number }} Levels
 */

export const MAX_BINDINGS = 4;

/** @type {readonly { id: string, label: string, continuous: boolean }[]} */
export const BINDING_SOURCES = Object.freeze([
  { id: 'audio', label: 'Niveau sonore', continuous: true },
  { id: 'bass', label: 'Graves', continuous: true },
  { id: 'mid', label: 'Médiums', continuous: true },
  { id: 'treble', label: 'Aigus', continuous: true },
  { id: 'event:any', label: 'Toute alerte', continuous: false },
  { id: 'event:follow', label: 'Alerte follow', continuous: false },
  { id: 'event:sub', label: 'Alerte sub', continuous: false },
  { id: 'event:raid', label: 'Alerte raid', continuous: false },
  { id: 'event:bits', label: 'Alerte bits', continuous: false },
].map((source) => Object.freeze(source)));

/** Bornes de chaque valeur liée, et ce qu'elle vaut « au repos » à la création d'une liaison. @type {Readonly<Record<BindingTarget, { label: string, unit: string, min: number, max: number, step: number, from: number, to: number }>>} */
export const BINDING_TARGETS = Object.freeze({
  opacity: Object.freeze({ label: 'Opacité', unit: '', min: 0, max: 1, step: 0.05, from: 0, to: 1 }),
  rotation: Object.freeze({ label: 'Rotation', unit: '°', min: -180, max: 180, step: 1, from: 0, to: 15 }),
  blur: Object.freeze({ label: 'Flou', unit: 'px', min: 0, max: 12, step: 0.5, from: 0, to: 8 }),
  scale: Object.freeze({ label: 'Échelle', unit: '×', min: 0.1, max: 3, step: 0.05, from: 1, to: 1.25 }),
  x: Object.freeze({ label: 'Décalage horizontal', unit: '%', min: -100, max: 100, step: 1, from: 0, to: 10 }),
  y: Object.freeze({ label: 'Décalage vertical', unit: '%', min: -100, max: 100, step: 1, from: 0, to: -10 }),
});

const SETTLE = 1e-4;

export const DURATION_LIMITS = Object.freeze({ min: 0, max: 10_000 });

/** @param {string} source @returns {boolean} */
export function isContinuousSource(source) {
  return BINDING_SOURCES.find(({ id }) => id === source)?.continuous === true;
}

/** @param {unknown} value @returns {value is number} */
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
/** @param {number} value @param {number} low @param {number} high */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * Une liaison de départ, prête à régler : la source et la valeur choisies, les bornes de la valeur, une durée raisonnable.
 * @param {string} source
 * @param {BindingTarget} target
 * @returns {Binding}
 */
export function createBinding(source = 'audio', target = 'scale') {
  const range = BINDING_TARGETS[target];
  return { source, target, from: range.from, to: range.to, durationMs: isContinuousSource(source) ? 120 : 800 };
}

/**
 * Les défauts d'une liste de liaisons (vide = valide).
 * @param {string} where
 * @param {unknown} bindings
 * @returns {string[]}
 */
export function bindingErrors(where, bindings) {
  if (bindings === undefined) return [];
  if (!Array.isArray(bindings)) return [`${where} : liste attendue`];
  if (bindings.length > MAX_BINDINGS) return [`${where} : ${MAX_BINDINGS} liaisons au plus`];
  /** @type {string[]} */
  const errors = [];
  const targets = new Set();
  bindings.forEach((binding, index) => {
    const at = `${where}[${index}]`;
    if (typeof binding !== 'object' || binding === null) { errors.push(`${at} : objet attendu`); return; }
    const { source, target, from, to, durationMs } = /** @type {Record<string, unknown>} */ (binding);
    if (!BINDING_SOURCES.some(({ id }) => id === source)) errors.push(`${at}.source : source inconnue`);
    if (typeof target !== 'string' || !Object.hasOwn(BINDING_TARGETS, target)) errors.push(`${at}.target : valeur liée inconnue`);
    else if (targets.has(target)) errors.push(`${at}.target : « ${target} » est déjà piloté par une autre liaison`);
    else targets.add(target);
    if (!isNumber(from)) errors.push(`${at}.from : nombre attendu`);
    if (!isNumber(to)) errors.push(`${at}.to : nombre attendu`);
    if (!isNumber(durationMs)) errors.push(`${at}.durationMs : nombre attendu`);
  });
  return errors;
}

/**
 * La forme canonique : chaque valeur dans les bornes de sa cible, la durée bornée ; une liste vide disparaît (absent = aucune liaison).
 * Ce qui n'est pas une liaison valide reste tel quel : `bindingErrors` le refuse.
 * @param {unknown} bindings
 * @returns {unknown}
 */
export function canonicalBindings(bindings) {
  if (!Array.isArray(bindings)) return bindings;
  if (bindings.length === 0) return undefined;
  return bindings.map((binding) => {
    if (typeof binding !== 'object' || binding === null) return binding;
    const entry = /** @type {Record<string, unknown>} */ (binding);
    const range = typeof entry.target === 'string' && Object.hasOwn(BINDING_TARGETS, entry.target) ? BINDING_TARGETS[/** @type {BindingTarget} */ (entry.target)] : null;
    return {
      ...entry,
      ...(range !== null && isNumber(entry.from) ? { from: clamp(entry.from, range.min, range.max) } : {}),
      ...(range !== null && isNumber(entry.to) ? { to: clamp(entry.to, range.min, range.max) } : {}),
      ...(isNumber(entry.durationMs) ? { durationMs: clamp(entry.durationMs, DURATION_LIMITS.min, DURATION_LIMITS.max) } : {}),
    };
  });
}

/** Le niveau d'une source continue. @param {string} source @param {Levels | null} levels @returns {number} */
function levelOf(source, levels) {
  if (levels === null) return 0;
  const value = source === 'audio' ? levels.level : source === 'bass' ? levels.bass : source === 'mid' ? levels.mid : levels.treble;
  return isNumber(value) ? clamp(value, 0, 1) : 0;
}

/**
 * Les valeurs liées d'une couche à un instant.
 *
 * `memory` appartient à la couche : il garde le niveau lissé de chaque liaison continue d'une image à l'autre (un tableau neuf, ou de
 * longueur différente, repart de zéro).
 * @param {readonly Binding[]} bindings
 * @param {{ levels: Levels | null, pulses: ReadonlyMap<string, number>, time: number, dt: number, memory: number[] }} input
 * @returns {Partial<Record<BindingTarget, number>>}
 */
export function evaluateBindings(bindings, { levels, pulses, time, dt, memory }) {
  /** @type {Partial<Record<BindingTarget, number>>} */
  const values = {};
  bindings.forEach((binding, index) => {
    let amount;
    if (isContinuousSource(binding.source)) {
      const raw = levelOf(binding.source, levels);
      const previous = memory[index] ?? 0;
      const tau = binding.durationMs;
      const alpha = tau <= 0 ? 1 : 1 - Math.exp(-(dt * 1000) / tau);
      // Sous 1/10 000, la valeur rejoint le niveau : un lissage exponentiel n'atteint jamais sa cible, et la couche resterait à réécrire
      // à chaque image, sans différence visible, pendant des dizaines de secondes.
      amount = Math.abs(raw - previous) < SETTLE ? raw : previous + (raw - previous) * alpha;
      memory[index] = amount;
    } else {
      const started = pulses.get(binding.source);
      const age = started === undefined ? Infinity : (time - started) * 1000;
      // Une impulsion retombe en ralentissant : vive au début, douce à la fin.
      amount = age < 0 || age >= binding.durationMs || binding.durationMs <= 0 ? 0 : (1 - age / binding.durationMs) ** 2;
    }
    values[binding.target] = binding.from + (binding.to - binding.from) * amount;
  });
  return values;
}

/**
 * Les alertes que le moteur retient : la source `event:any` et celle du type de l'alerte.
 * @param {Map<string, number>} pulses
 * @param {string} type
 * @param {number} time
 */
export function recordPulse(pulses, type, time) {
  pulses.set('event:any', time);
  pulses.set(`event:${type}`, time);
}

/** Vrai si une liaison a besoin du son. @param {readonly Binding[] | undefined} bindings */
export function usesAudio(bindings) {
  return bindings?.some((binding) => isContinuousSource(binding.source)) === true;
}

// ── Édition d'une liste de liaisons (l'inspecteur du Studio) ───────────────────

/** Les valeurs liées, de la plus parlante à la moins parlante pour une première liaison. */
const TARGET_ORDER = /** @type {BindingTarget[]} */ (['scale', 'opacity', 'rotation', 'blur', 'x', 'y']);

/**
 * La liste avec une liaison de plus, sur la première valeur que rien ne pilote encore ; `null` quand la liste est pleine.
 * @param {readonly Binding[]} bindings
 * @returns {Binding[] | null}
 */
export function addBinding(bindings) {
  if (bindings.length >= MAX_BINDINGS) return null;
  const free = TARGET_ORDER.find((target) => !bindings.some((binding) => binding.target === target));
  return free === undefined ? null : [...bindings, createBinding('audio', free)];
}

/**
 * La liste sans la liaison `index`.
 * @param {readonly Binding[]} bindings
 * @param {number} index
 * @returns {Binding[]}
 */
export function removeBinding(bindings, index) {
  return bindings.filter((_binding, at) => at !== index);
}

/**
 * La liste avec un champ d'une liaison changé. Changer la valeur liée remet « de » et « à » aux valeurs de départ de la nouvelle valeur
 * (leurs bornes diffèrent) ; passer d'une source continue à une impulsion (ou l'inverse) remet la durée à celle de la nouvelle famille.
 * Une valeur déjà pilotée par une autre liaison est refusée : la liste revient inchangée.
 * @param {readonly Binding[]} bindings
 * @param {number} index
 * @param {'source' | 'target' | 'from' | 'to' | 'durationMs'} field
 * @param {string | number} value
 * @returns {Binding[]}
 */
export function changeBinding(bindings, index, field, value) {
  const current = bindings[index];
  if (current === undefined) return [...bindings];
  /** @type {Binding} */
  let next = { ...current };
  if (field === 'source' && typeof value === 'string') {
    next = { ...current, source: value };
    if (isContinuousSource(value) !== isContinuousSource(current.source)) next.durationMs = isContinuousSource(value) ? 120 : 800;
  } else if (field === 'target' && typeof value === 'string' && Object.hasOwn(BINDING_TARGETS, value)) {
    if (bindings.some((binding, at) => at !== index && binding.target === value)) return [...bindings];
    const range = BINDING_TARGETS[/** @type {BindingTarget} */ (value)];
    next = { ...current, target: /** @type {BindingTarget} */ (value), from: range.from, to: range.to };
  } else if ((field === 'from' || field === 'to' || field === 'durationMs') && typeof value === 'number' && Number.isFinite(value)) {
    next = { ...current, [field]: value };
  } else {
    return [...bindings];
  }
  return bindings.map((binding, at) => (at === index ? next : binding));
}
