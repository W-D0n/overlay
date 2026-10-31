// @ts-check
/**
 * Le parcours au clavier de bout en bout : avec Tab seulement, chaque contrôle visible et actif du Studio reçoit le focus, dans
 * l'ordre du document, sans piège ; Maj+Tab revient en arrière ; aucun `tabindex` positif ne casse l'ordre.
 */
import { openStudio } from '../studio.js';

export const name = 'parcours clavier';

/** Les contrôles que le clavier doit atteindre : visibles, actifs, hors fenêtre fermée, hors `tabindex="-1"`. */
const TABBABLE = `(() => {
  const selector = 'a[href], button, input, select, textarea, summary, [tabindex]';
  const visible = (el) => {
    if (!el.getClientRects().length) return false;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    for (let node = el; node; node = node.parentElement) {
      if (node.hasAttribute('inert') || node.hidden) return false;
      if (node.tagName === 'DIALOG' && !node.open) return false;
      // Le contenu d'un <details> fermé garde des rectangles mais n'est pas atteignable : seul son <summary> l'est.
      if (node.tagName === 'DETAILS' && !node.open && !(node.firstElementChild && node.firstElementChild.contains(el))) return false;
    }
    return true;
  };
  return [...document.querySelectorAll(selector)].filter((el) => {
    if (el.disabled || (el.tagName === 'INPUT' && el.type === 'hidden')) return false;
    if (el.tabIndex < 0) return false;
    if (el.tagName === 'INPUT' && el.type === 'radio' && !el.checked && document.querySelector('input[type=radio][name="' + el.name + '"]:checked')) return false;
    return visible(el);
  });
})()`;

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  const describe = `((el) => el === document.body ? 'body' : (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') + '[' + (el.getAttribute('aria-label') || el.textContent.trim().slice(0, 24) || el.type || '') + ']'))`;

  const positive = await page.evaluate("[...document.querySelectorAll('[tabindex]')].filter((el) => Number(el.getAttribute('tabindex')) > 0).map((el) => el.id || el.tagName)");
  check('aucun tabindex positif : l’ordre du clavier est celui du document', positive.length === 0 ? true : positive);

  for (const pass of ['sections repliées', 'toutes les sections ouvertes']) {
    if (pass !== 'sections repliées') await page.evaluate("document.querySelectorAll('details').forEach((d) => { d.open = true; })");
    const expected = await page.evaluate(`${TABBABLE}.map((el) => { el.dataset.e2eTabbable = '1'; return ${describe}(el); })`);
    check(`${pass} : la page propose assez de contrôles pour que le parcours ait un sens`, expected.length >= 40);

    await page.evaluate('document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0)');
    /** @type {string[]} */
    const visited = [];
    /** @type {boolean[]} */
    const inOrder = [];
    let previous = null;
    let looped = false;
    for (let step = 0; step < expected.length + 12; step += 1) {
      await page.press('Tab');
      const now = await page.evaluate(`(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return { at: 'body' };
        const rect = el.getBoundingClientRect();
        return { at: ${describe}(el), id: el.id, tabbable: el.dataset.e2eTabbable === '1', visible: rect.width > 0 && rect.height > 0 };
      })()`);
      if (now.at === 'body') { looped = true; break; }
      if (visited.includes(now.at) && visited[0] === now.at) { looped = true; break; }
      visited.push(now.at);
      if (previous !== null) {
        inOrder.push(await page.evaluate(`(() => {
          const a = document.querySelector('[data-e2e-prev]'); const b = document.activeElement;
          return !a || a === b || !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        })()`));
      }
      await page.evaluate(`(() => { document.querySelectorAll('[data-e2e-prev]').forEach((e) => e.removeAttribute('data-e2e-prev')); document.activeElement.setAttribute('data-e2e-prev', '1'); })()`);
      previous = now.at;
    }

    const missing = expected.filter((/** @type {string} */ label) => !visited.includes(label));
    check(`${pass} : Tab atteint chaque contrôle visible et actif`, missing.length === 0 ? true : missing.slice(0, 20));
    check(`${pass} : le parcours se termine : le focus sort de la page ou revient au départ, sans piège`, looped);
    const outOfOrder = inOrder.filter((ok) => !ok).length;
    check(`${pass} : le focus avance dans l’ordre du document`, outOfOrder === 0 ? true : `${outOfOrder} retour(s) en arrière`);

  }

  // Maj+Tab : de n'importe quel contrôle, on revient au précédent.
  await page.focus('#layers-add');
  const here = await page.evaluate("document.activeElement.id");
  await page.press('Tab');
  const forward = await page.evaluate('document.activeElement.id');
  await page.press('Shift+Tab');
  const back = await page.evaluate('document.activeElement.id');
  check('Maj+Tab revient au contrôle d’où l’on vient', here === back && forward !== here);

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
