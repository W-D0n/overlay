// @ts-check
/**
 * dev/layer-cost-controller.js — Montre dans la pile de couches ce que chaque effet coûte à dessiner, et le total de la scène
 * (`layer-cost.js`). Mesure relative, prise dans le Studio : elle dit quelle couche pèse, pas ce que fera OBS.
 *
 * Le contrôleur ne reconstruit rien : il pose une pastille dans chaque ligne existante à intervalle régulier (et juste après
 * un changement de la scène), sans bruit quand l'onglet est caché.
 */
import { costLevel, formatCost, sumCosts } from '../layer-cost.js';

const NOTE = 'Mesure relative prise dans le Studio : elle classe les couches entre elles, OBS peut donner d’autres valeurs.';

/**
 * @param {{
 *   list: HTMLElement,
 *   total: HTMLElement,
 *   preview: { layerCosts(): Record<string, number | null> },
 *   editor: import('./scene-editor.js').SceneEditor,
 *   documentRef?: Document,
 *   windowRef?: Window,
 *   intervalMs?: number,
 * }} input
 */
export function createLayerCostController(input) {
  const documentRef = input.documentRef ?? document;
  const windowRef = input.windowRef ?? window;

  function render() {
    if (documentRef.hidden) return;
    const costs = input.preview.layerCosts();
    /** @type {(number | null)[]} */
    const measured = [];
    for (const row of input.list.querySelectorAll('.layer-row')) {
      const id = /** @type {HTMLElement} */ (row).dataset.id ?? '';
      const text = row.querySelector('.layer-text');
      if (text === null) continue;
      let badge = text.querySelector('.layer-cost');
      const cost = costs[id];
      const hidden = row.classList.contains('is-hidden');
      if (hidden || cost === null || cost === undefined) {
        // Masquée : rien n'est dessiné. Sans mesure (couche d'identité, effet pas encore dessiné) : rien à dire.
        if (hidden) {
          if (badge === null) {
            badge = documentRef.createElement('span');
            badge.className = 'layer-cost';
            text.appendChild(badge);
          }
          /** @type {HTMLElement} */ (badge).dataset.level = 'none';
          badge.textContent = 'masquée : aucun coût';
          /** @type {HTMLElement} */ (badge).title = 'Une couche masquée n’est pas dessinée.';
        } else badge?.remove();
        continue;
      }
      if (badge === null) {
        badge = documentRef.createElement('span');
        badge.className = 'layer-cost';
        text.appendChild(badge);
      }
      measured.push(cost);
      /** @type {HTMLElement} */ (badge).dataset.level = costLevel(cost);
      badge.textContent = formatCost(cost);
      /** @type {HTMLElement} */ (badge).title = `Coût de dessin moyen d’une image. ${NOTE}`;
    }
    const sum = sumCosts(measured);
    if (sum.measured === 0) {
      input.total.textContent = '';
      input.total.dataset.level = 'none';
      input.total.title = '';
      return;
    }
    input.total.dataset.level = sum.level;
    input.total.textContent = `Coût ${formatCost(sum.total)} / image`;
    input.total.title = `${Math.round(sum.share * 100)} % du budget d’une image à 60 i/s. ${NOTE}`;
  }

  const timer = windowRef.setInterval(render, input.intervalMs ?? 500);
  // Une ligne vient d'être redessinée par la pile : la pastille revient sans attendre le prochain tour.
  const stop = input.editor.subscribe(() => { windowRef.setTimeout(render, 0); });
  render();

  return {
    render,
    destroy() {
      windowRef.clearInterval(timer);
      stop();
    },
  };
}
