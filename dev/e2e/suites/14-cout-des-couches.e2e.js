// @ts-check
/**
 * Le coût de dessin par couche : une pastille mesurée sur chaque effet, aucune sur la couche d'identité, « masquée : aucun
 * coût » pour une couche masquée, et un total de la scène qui suit l'ajout et le retrait d'effets.
 */
import { layerRow, openStudio } from '../studio.js';

export const name = 'coût des couches';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  const paletteRun = async (/** @type {string} */ query) => {
    await page.press('Control+k');
    await page.fill('#palette-input', query);
    await page.press('Enter');
    await page.sleep(250);
  };
  const badges = () => page.evaluate("[...document.querySelectorAll('#layers-list .layer-row')].map((r) => ({ id: r.dataset.id, text: r.querySelector('.layer-cost')?.textContent ?? null, level: r.querySelector('.layer-cost')?.dataset.level ?? null }))");
  const total = () => page.evaluate("({ text: document.getElementById('layers-cost').textContent, level: document.getElementById('layers-cost').dataset.level })");
  const isMs = (/** @type {string | null} */ text) => text !== null && /\d.*ms$/.test(text);

  const measured = await page.waitFor("[...document.querySelectorAll('#layers-list .layer-row .layer-cost')].some((b) => /ms$/.test(b.textContent))", 8000);
  check('une pastille mesurée apparaît sur l’effet', measured);
  let rows = await badges();
  check('la couche d’identité (branding) n’a pas de pastille : elle n’a pas de mesure', rows.find((r) => r.id === 'branding')?.text === null);
  check('l’effet affiche un temps en ms avec un niveau', rows.filter((r) => isMs(r.text)).length === 1 && ['ok', 'warn', 'high'].includes(rows.find((r) => isMs(r.text))?.level));
  let sum = await total();
  check('le total de la scène est affiché, en ms par image', /^Coût .* ms \/ image$/.test(sum.text));

  // Ajouter un effet : un second effet mesuré ; le total est la somme des pastilles affichées.
  await paletteRun('ajouter bubble');
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-row .layer-cost')].filter((b) => /ms$/.test(b.textContent)).length >= 2", 8000);
  rows = await badges();
  check('un second effet a sa propre pastille', rows.filter((r) => isMs(r.text)).length === 2);
  const consistent = await page.waitFor(`(() => {
    const ms = (t) => (t.startsWith('<') ? 0.05 : Number(t.replace(/[^0-9,]/g, '').replace(',', '.')));
    const parts = [...document.querySelectorAll('#layers-list .layer-cost')].filter((b) => /ms$/.test(b.textContent) && b.dataset.level !== 'none').map((b) => ms(b.textContent));
    const shown = ms(document.getElementById('layers-cost').textContent.replace(/^Coût /, '').replace(' / image', ''));
    return parts.length === 2 && Math.abs(shown - parts.reduce((a, b) => a + b, 0)) <= 0.35;
  })()`, 5000);
  check('le total affiché est la somme des deux pastilles (à l’arrondi près)', consistent);

  // Masquer l'effet sélectionné : plus rien n'est dessiné pour lui.
  await paletteRun('afficher ou masquer');
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-row .layer-cost')].some((b) => b.dataset.level === 'none')", 5000);
  rows = await badges();
  check('une couche masquée le dit : aucun coût', rows.some((r) => r.text === 'masquée : aucun coût'));
  check('et le nombre d’effets mesurés diminue', rows.filter((r) => isMs(r.text)).length === 1);

  // Tout retirer : plus rien n'est mesuré, le total s'efface.
  await paletteRun('tout sélectionner');
  await paletteRun('supprimer');
  const cleared = await page.waitFor("document.getElementById('layers-cost').textContent === '' && document.getElementById('layers-cost').dataset.level === 'none'", 5000);
  check('quand plus aucun effet n’est dessiné, le total s’efface', cleared);

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
