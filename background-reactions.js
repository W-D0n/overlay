// @ts-check
/**
 * background-reactions.js — Routage d'un événement de réaction (2026-07-24).
 *
 * Réaction native si l'effet monté l'expose (DotGrid), sinon overlay partagé. Partagé par
 * background.html (URL OBS) et l'aperçu du tuner pour un comportement identique.
 * Voir docs/specs/background-reactive-events.md.
 *
 * @param {{
 *   mount: { react: (event: unknown) => boolean },
 *   overlay: { trigger: (event: unknown) => void },
 * }} deps
 */
export function createReactionCoordinator(deps) {
  return {
    /** @param {unknown} event */
    handle(event) {
      if (!deps.mount.react(event)) deps.overlay.trigger(event);
    },
  };
}
