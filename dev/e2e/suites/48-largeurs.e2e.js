// @ts-check
/**
 * Le Studio à plusieurs largeurs de fenêtre : aucun panneau ne déborde sur le côté (ni barre de défilement horizontale, ni libellé coupé), du grand écran à la fenêtre étroite.
 * Les colonnes suivent la fenêtre (docs : aucune largeur de panneau figée) ; ce qui ne tient pas passe à la ligne au lieu de déborder.
 */
import { addLayer, openStudio } from '../studio.js';

export const name = 'largeurs de la fenêtre';

const WIDTHS = [1920, 1700, 1440, 1280, 1100, 900];

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  await addLayer(page, 'bubble');
  await page.click('#layers-list .layer-row:nth-child(2)');

  /** Ce qui déborde : la page, puis tout élément visible dont le contenu dépasse la boîte sans être rogné à dessein (overflow: hidden). */
  const overflow = () => page.evaluate(`(() => {
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || el.clientWidth === 0) continue;
      // The canvas overlay draws its handles beyond the box they hold, by design.
      if (getComputedStyle(el).overflowX === 'hidden' || el instanceof SVGElement || el.closest('#canvas-overlay') !== null) continue;
      if (el.scrollWidth > el.clientWidth + 1) offenders.push((el.id ? '#' + el.id : '') + '.' + String(el.className).split(' ').join('.') + ' ' + el.scrollWidth + '>' + el.clientWidth);
    }
    return { page: document.documentElement.scrollWidth - window.innerWidth, offenders: offenders.slice(0, 6) };
  })()`);

  for (const width of WIDTHS) {
    await page.setViewport(width, 1000);
    const found = await overflow();
    check(`à ${width} px, la page ne défile pas sur le côté`, found.page <= 0 ? true : found.page);
    check(`à ${width} px, aucun panneau ne déborde`, found.offenders.length === 0 ? true : found.offenders);
  }

  // The hidden attribute always hides: a `display` written for an element must never bring it back (the mask rows showed under « Aucun » that way).
  const shownDespiteHidden = () => page.evaluate("[...document.querySelectorAll('[hidden]')].filter((el) => getComputedStyle(el).display !== 'none').map((el) => (el.id ? '#' + el.id : '') + '.' + String(el.className).split(' ').join('.'))");
  check('every element marked hidden is really hidden, with a layer selected', (await shownDespiteHidden()).length === 0 ? true : await shownDespiteHidden());
  await page.click('#canvas-overlay', { position: { x: 5, y: 5 } });
  check('and with nothing selected', (await shownDespiteHidden()).length === 0 ? true : await shownDespiteHidden());
  await page.click('#layers-list .layer-row:nth-child(2)');

  // A layer row keeps its eye and its lock on its own line, next to the title: five cells in a grid of five columns.
  await page.setViewport(1700, 1200);
  const row = await page.evaluate("(() => { const r = document.querySelector('#layers-list .layer-row'); const t = r.querySelector('.layer-title').getBoundingClientRect(); const g = r.querySelector('.layer-toggles').getBoundingClientRect(); return { sameLine: g.top < t.bottom && g.bottom > t.top, toggleWidth: Math.round(g.width) }; })()");
  check('the eye and the lock of a layer row sit beside its title, not under it', row.sameLine === true && row.toggleWidth > 40);

  await page.setViewport(1700, 1200);
  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
