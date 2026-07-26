// @ts-check
/**
 * audio-levels.js — Spectre audio → niveaux exploitables par un effet de fond.
 *
 * Logique pure : aucun accès au DOM, à `AudioContext` ni au temps. L'état précédent est fourni par
 * l'appelant, ce qui rend le lissage testable image par image.
 * Voir docs/specs/background-audio-reactivity.md.
 *
 * @typedef {Object} AudioLevels
 * @property {number} level  - Niveau global, dans [0, 1]
 * @property {number} bass   - Bande grave, dans [0, 1]
 * @property {number} mid    - Bande medium, dans [0, 1]
 * @property {number} treble - Bande aiguë, dans [0, 1]
 */

/** Bornes de bandes en Hz — validées au prototype (docs/prototypes/2026-07-25-audio-reactivity.md). */
const BANDS = {
  bass: { from: 20, to: 250 },
  mid: { from: 250, to: 2000 },
  treble: { from: 2000, to: 8000 },
};

/**
 * Le fond suit une voix qui monte, mais ne retombe pas dans chaque trou entre deux syllabes :
 * montée quasi immédiate, descente lente.
 */
const ATTACK = 0.5;
const RELEASE = 0.08;

/** @type {AudioLevels} */
export const SILENT_LEVELS = Object.freeze({ level: 0, bass: 0, mid: 0, treble: 0 });

/**
 * Maximum des bins couverts par une bande, normalisé dans [0, 1].
 *
 * Le maximum et non la moyenne : une voix ou une basse occupe quelques bins sur les dizaines que
 * couvre une bande, et la moyenne la ramenait à moins de 10 % — les effets ne bougeaient alors que
 * de quelques pourcents (mesuré le 2026-07-26). Le lissage attaque/retour absorbe la nervosité
 * propre au maximum.
 * @param {Uint8Array} spectrum
 * @param {number} hzPerBin
 * @param {{ from: number, to: number }} band
 * @returns {number}
 */
function bandPeak(spectrum, hzPerBin, band) {
  const start = Math.min(Math.floor(band.from / hzPerBin), spectrum.length);
  const end = Math.min(Math.ceil(band.to / hzPerBin), spectrum.length);
  if (end <= start) return 0;

  let peak = 0;
  for (let index = start; index < end; index += 1) {
    if (spectrum[index] > peak) peak = spectrum[index];
  }
  return peak / 255;
}

/**
 * Lissage asymétrique : la valeur monte vite et redescend lentement.
 * @param {number} previous
 * @param {number} target
 * @returns {number}
 */
function smooth(previous, target) {
  const factor = target > previous ? ATTACK : RELEASE;
  const next = previous + (target - previous) * factor;
  // Sans ce plancher, la descente exponentielle laisse une trace infinitésimale qui n'atteint
  // jamais zéro : un effet resterait perpétuellement « un peu réactif » dans le silence.
  return next < 0.001 ? 0 : next;
}

/**
 * @param {{ spectrum: Uint8Array, sampleRate: number, previous: AudioLevels }} input
 * @returns {AudioLevels}
 */
export function computeLevels({ spectrum, sampleRate, previous }) {
  const hzPerBin = spectrum.length > 0 ? sampleRate / (spectrum.length * 2) : 0;

  /** @type {AudioLevels} */
  const next = { level: 0, bass: 0, mid: 0, treble: 0 };
  for (const name of ['bass', 'mid', 'treble']) {
    const target = hzPerBin > 0 ? bandPeak(spectrum, hzPerBin, BANDS[name]) : 0;
    next[name] = smooth(previous[name], target);
  }

  // `level` est la bande la plus chargée, pas la moyenne de 20 à 8000 Hz : une voix ou une basse
  // occupe une part étroite du spectre, et la moyenne la diluait à quelques pourcents — les effets
  // pilotés par `level` ne bougeaient alors presque pas (mesuré le 2026-07-26).
  next.level = Math.max(next.bass, next.mid, next.treble);
  return next;
}

/**
 * Seuils du détecteur de pic — un pic est une montée franche ET un niveau déjà significatif.
 * Sans le second, le silence produirait des pics sur le moindre souffle.
 */
const PEAK_RISE = 0.12;
const PEAK_FLOOR = 0.35;

/**
 * Détecte un pic entre deux frames d'une même bande. Pur : l'appelant garde la valeur précédente.
 * Utilisé pour les réactions ponctuelles (éclatement d'une bulle, goutte d'eau).
 * @param {number} previous
 * @param {number} current
 * @returns {boolean}
 */
export function isAudioPeak(previous, current) {
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return false;
  return current >= PEAK_FLOOR && current - previous >= PEAK_RISE;
}
