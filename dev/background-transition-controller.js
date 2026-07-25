// @ts-check
/**
 * dev/background-transition-controller.js — Section « Arrivée de ce preset » du tuner.
 *
 * Trois contrôles reliés à la transition du preset en cours d'édition. Modifier un contrôle
 * n'anime rien : la valeur sert à la prochaine arrivée du preset, et n'est persistée qu'avec lui.
 * Voir docs/specs/background-preset-transitions.md.
 *
 * @param {{
 *   typeSelect: HTMLSelectElement,
 *   durationInput: HTMLInputElement,
 *   directionSelect: HTMLSelectElement,
 *   directionRow: HTMLElement,
 *   onChange: (patch: Record<string, unknown>) => { transition: import('../background-transition.js').BackgroundTransition },
 * }} input
 */
export function createTransitionController(input) {
  /** Le sens n'a de sens que pour un balayage — le masquer évite un réglage sans effet visible. */
  function reflectTypeVisibility(type) {
    input.directionRow.hidden = type !== 'wipe';
  }

  function render(transition) {
    input.typeSelect.value = transition.type;
    input.durationInput.value = String(transition.durationMs);
    input.directionSelect.value = transition.direction;
    reflectTypeVisibility(transition.type);
  }

  input.typeSelect.onchange = () => render(input.onChange({ type: input.typeSelect.value }).transition);
  input.directionSelect.onchange = () => {
    render(input.onChange({ direction: input.directionSelect.value }).transition);
  };
  input.durationInput.onchange = () => {
    // Champ libre : une valeur hors bornes est ramenée par la session, puis réaffichée corrigée
    // plutôt que laissée telle quelle à l'écran.
    render(input.onChange({ durationMs: Number(input.durationInput.value) }).transition);
  };

  return { render };
}
