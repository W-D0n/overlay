// @ts-check
/**
 * La couche de contenu « texte » : on l'ajoute par la galerie, on règle son texte, on la place, on la publie, on la retrouve après
 * rechargement. L'aperçu est contrôlé en pixels (le texte est réellement peint, il rétrécit pour tenir dans sa zone).
 */
import { layerRows, openStudio } from '../studio.js';

export const name = 'couche texte';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  const air = async () => (await stack.api('/state')).scene;

  /** Les canvas de couche de l'aperçu, du dessous au dessus, avec leur boîte d'encre (pixels non transparents). */
  const inks = () => page.evaluate(`[...document.getElementById('bg-layer').querySelectorAll('canvas')]
    .filter((c) => c.parentElement.id !== 'bg-layer')
    .map((c) => {
      const context = c.getContext('2d');
      const { data, width, height } = context.getImageData(0, 0, c.width, c.height);
      let left = width, right = -1, top = height, bottom = -1, count = 0;
      for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
        if (data[(y * width + x) * 4 + 3] > 40) { count += 1; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
      }
      return { count, left, right, top, bottom, width, height };
    })`);

  await page.click('#layers-add');
  const card = await page.evaluate("[...document.querySelectorAll('#gallery-grid .gallery-card')].map((c) => c.dataset.kind + ':' + c.querySelector('.gallery-label').textContent)");
  check('la galerie propose le texte après les effets et avant le branding', card.indexOf('text:Texte') > card.indexOf('water-ripple:WaterRipple') && card.indexOf('text:Texte') < card.indexOf('branding:Branding'));
  await page.click('#gallery-grid [data-kind="text"]');
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Texte')", 8000);
  await page.sleep(500);

  let layers = await inks();
  const text = layers.at(-1);
  check('la couche texte est peinte dans l’aperçu', text !== undefined && text.count > 50);
  check('le titre par défaut tient dans la toile, centré', text.left > 0 && text.right < text.width && Math.abs((text.left + text.right) / 2 - text.width / 2) < text.width * 0.03);

  const typeOptions = await page.evaluate("[...document.querySelectorAll('#effect-select option')].map((o) => o.value)");
  check('le sélecteur de type d’une couche texte ne propose que des contenus', typeOptions.join() === '__none__,text');
  check('les réglages du texte sont un formulaire généré', (await page.evaluate("document.querySelectorAll('#fields textarea').length")) >= 1);

  await page.fill('#fields textarea', 'Bonsoir tout le monde');
  await page.sleep(600);
  layers = await inks();
  check('changer le texte le repeint (le contenu est autre)', layers.at(-1).count > text.count);

  // Une zone étroite : le texte rétrécit pour y tenir au lieu de déborder.
  await page.fill('#inspector-width', 20);
  await page.sleep(600);
  layers = await inks();
  const narrow = layers.at(-1);
  check('placé dans 20 % de la largeur, le texte se met en page dans sa zone sans toucher ses bords', narrow.count > 50 && narrow.left > 0 && narrow.right < narrow.width - 1);
  const stageWidth = await page.evaluate("document.getElementById('bg-layer').getBoundingClientRect().width");
  const inkBox = await page.evaluate(`(() => {
    const canvas = [...document.getElementById('bg-layer').querySelectorAll('canvas')].filter((c) => c.parentElement.id !== 'bg-layer').at(-1);
    return canvas.parentElement.getBoundingClientRect().width;
  })()`);
  check('la zone de la couche fait bien 20 % de la toile', Math.abs(inkBox - stageWidth * 0.2) <= 3);

  const rows = await layerRows(page);
  const textRow = rows.find((/** @type {*} */ row) => row.title === 'Texte');
  check('la vignette de la couche texte montre du texte', textRow !== undefined && await page.waitFor("[...document.querySelectorAll('#layers-list .layer-row')].some((r) => r.querySelector('.layer-title').textContent === 'Texte' && r.querySelector('.preset-thumb')?.dataset.state === 'ready')", 15_000));

  await page.click('#publish-send');
  await page.waitFor("document.getElementById('publish-bar').dataset.state === 'live'", 8000);
  const aired = (await air()).layers.find((/** @type {*} */ layer) => layer.kind === 'text');
  check('publié : la couche texte est à l’antenne avec ses options et son placement', aired !== undefined && aired.options.text?.[0] === 'Bonsoir tout le monde' && Math.abs(aired.placement.width - 0.2) < 0.001);

  await page.goto(`http://localhost:${stack.staticPort}/dev/studio.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Texte')", 10_000);
  await page.sleep(500);
  layers = await inks();
  check('après rechargement, le texte publié est de retour et peint', layers.at(-1) !== undefined && layers.at(-1).count > 50);

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
