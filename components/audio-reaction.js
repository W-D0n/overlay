// @ts-check
import { isAudioPeak } from '../audio-levels.js';

/**
 * components/audio-reaction.js — État audio partagé par les effets réactifs.
 *
 * Le même bloc se répétait dans chaque effet : lire `audioIntensity`, borner les niveaux, remettre
 * à zéro quand le preset repasse en non réactif, détecter un pic. Extrait ici après la troisième
 * occurrence (règle de trois).
 *
 * Un effet garde la main sur **ce que** le son modifie chez lui ; ce module ne fournit que la
 * matière première.
 * Voir docs/specs/background-audio-reactivity.md.
 */

/** @param {unknown} value */
function clamp01(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * @param {Record<string, unknown>} [options]
 * @returns {{
 *   readOptions: (options: Record<string, unknown>) => void,
 *   apply: (levels: unknown) => void,
 *   level: () => number,
 *   bass: () => number,
 *   treble: () => number,
 *   intensity: () => number,
 *   boost: (band: 'level' | 'bass' | 'treble', amount: number) => number,
 *   consumePeak: () => boolean,
 * }}
 */
export function createAudioReaction(options = {}) {
  let intensity = Math.max(0, typeof options.audioIntensity === 'number' ? options.audioIntensity : 1);
  let level = 0;
  let bass = 0;
  let treble = 0;
  let previousLevel = 0;
  let peaked = false;

  function reset() {
    level = 0;
    bass = 0;
    treble = 0;
    previousLevel = 0;
    peaked = false;
  }

  return {
    /** À appeler depuis `update()` de l'effet. */
    readOptions(next) {
      if (typeof next.audioIntensity === 'number' && next.audioIntensity >= 0) {
        intensity = next.audioIntensity;
      }
      // Le preset repasse en non réactif : plus aucun niveau ne viendra, on efface le dernier reçu
      // pour que l'effet retrouve son animation normale au lieu de figer sur un pic.
      if (next.audioReactive !== undefined && next.audioReactive !== 'Oui') reset();
    },

    apply(levels) {
      const source = /** @type {Record<string, unknown>} */ (levels ?? {});
      level = clamp01(source.level);
      bass = clamp01(source.bass);
      treble = clamp01(source.treble);
      if (isAudioPeak(previousLevel, level)) peaked = true;
      previousLevel = level;
    },

    level: () => level,
    bass: () => bass,
    treble: () => treble,
    intensity: () => intensity,

    /**
     * Multiplicateur à appliquer à un paramètre existant : vaut 1 au silence, donc un effet non
     * sollicité rend exactement comme un preset non réactif.
     */
    boost(band, amount) {
      const value = band === 'bass' ? bass : band === 'treble' ? treble : level;
      return 1 + value * intensity * amount;
    },

    /** Vrai une seule fois par pic — pour les réactions ponctuelles (une goutte, une forme). */
    consumePeak() {
      if (!peaked) return false;
      peaked = false;
      return true;
    },
  };
}
