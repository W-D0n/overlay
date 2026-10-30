// @ts-check
/**
 * La barre de vue : zoom, aimantation, grille, règles, zones de sécurité.
 */
import { addLayer, layerRow, openStudio } from '../studio.js';

export const name = 'barre de vue';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  const frame = () => page.evaluate("(() => { const r = document.getElementById('bg-layer').getBoundingClientRect(); return { x: r.x, y: r.y, scale: r.width / 1920 }; })()");
  const at = async (/** @type {number} */ sx, /** @type {number} */ sy) => { const f = await frame(); return { x: f.x + sx * f.scale, y: f.y + sy * f.scale }; };
  const shown = (/** @type {string} */ selector) => page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el !== null && !el.hidden && el.getBoundingClientRect().width > 0; })()`);
  const label = () => page.evaluate("document.getElementById('view-zoom-label').textContent");
  const inspectorX = async () => page.evaluate("+document.getElementById('inspector-x').value");

  check('au départ : vue ajustée, grille, règles et sécurité masquées, aimantation active', await (async () => {
    const aids = await page.evaluate("({ grid: document.getElementById('view-grid').getAttribute('aria-pressed'), rulers: document.getElementById('view-rulers').getAttribute('aria-pressed'), safe: document.getElementById('view-safe').getAttribute('aria-pressed'), snap: document.getElementById('view-snap').getAttribute('aria-pressed') })");
    return aids.grid === 'false' && aids.rulers === 'false' && aids.safe === 'false' && aids.snap === 'true' && String(await label()).startsWith('Ajusté');
  })());
  check('ni grille, ni règle, ni zone de sécurité à l’écran', !(await shown('.va-grid')) && !(await shown('.va-ruler-x')) && !(await shown('.va-safe-title')));

  const fit = await frame();
  await page.click('#view-zoom-in');
  const zoomedIn = await frame();
  check('« + » passe au palier de zoom suivant', zoomedIn.scale > fit.scale * 1.1);
  check('l’étiquette n’est plus « Ajusté » mais le pourcentage', !String(await label()).startsWith('Ajusté') && String(await label()).endsWith('%'));
  await page.click('#view-zoom-out');
  await page.click('#view-zoom-out');
  check('« − » dézoome', (await frame()).scale < zoomedIn.scale);
  await page.click('#view-zoom-100');
  const hundred = await frame();
  check('« 100 % » : un pixel de la source par pixel d’écran', Math.abs(hundred.scale - 1) < 1e-6);
  await page.click('#view-zoom-label');
  check('cliquer l’étiquette ajuste de nouveau la vue', Math.abs((await frame()).scale - fit.scale) < 1e-6 && String(await label()).startsWith('Ajusté'));

  await page.click('#view-grid');
  const gridBox = await page.evaluate("(() => { const g = document.querySelector('.va-grid').getBoundingClientRect(); const f = document.getElementById('bg-layer').getBoundingClientRect(); return { dw: Math.abs(g.width - f.width), dx: Math.abs(g.x - f.x), cell: parseFloat(getComputedStyle(document.querySelector('.va-grid')).backgroundSize), scale: f.width / 1920 }; })()");
  check('la grille recouvre exactement la toile, par mailles de 120 px de la source', (await shown('.va-grid')) && gridBox.dw < 1 && gridBox.dx < 1 && Math.abs(gridBox.cell - 120 * gridBox.scale) < 0.5);

  await page.click('#view-rulers');
  check('les règles apparaissent sur les bords haut et gauche', (await shown('.va-ruler-x')) && (await shown('.va-ruler-y')));
  const ink = await page.evaluate(`(() => { const c = document.querySelector('.va-ruler-x'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let painted = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) painted += 1; return painted; })()`);
  check('la règle porte réellement des graduations tracées', ink > 50);

  await page.click('#view-safe');
  const safe = await page.evaluate("(() => { const s = document.querySelector('.va-safe-title').getBoundingClientRect(); const f = document.getElementById('bg-layer').getBoundingClientRect(); return { left: (s.x - f.x) / f.width, top: (s.y - f.y) / f.height, width: s.width / f.width }; })()");
  check('la zone de sécurité « titres » est un retrait de 5 % de chaque côté', (await shown('.va-safe-title')) && Math.abs(safe.left - 0.05) < 0.005 && Math.abs(safe.top - 0.05) < 0.005 && Math.abs(safe.width - 0.9) < 0.005);

  // Aimantation à la marge de sécurité : une couche approchée à 5 px de la marge (96 px) colle dessus.
  await page.click(layerRow(1));
  await addLayer(page, 'bubble');
  await page.selectOption('#inspector-preset', 'pip-br');
  await page.click('#inspector-unit-pixel');
  const f = await frame();
  const start = await at(1920 * 0.72 + 100, 1080 * 0.7 + 100);
  // La couche couvre x = 1382..1862 ; son bord gauche cible la marge gauche (96) : on la tire vers la gauche de (1382 - 96 - 4).
  await page.mouseDown(start.x, start.y);
  for (let step = 1; step <= 6; step += 1) await page.mouseMove(start.x - ((1382 - 96 - 4) * f.scale * step) / 6, start.y);
  await page.mouseUp(start.x - (1382 - 96 - 4) * f.scale, start.y);
  await page.sleep(100);
  check('avec les zones de sécurité, le bord gauche colle à la marge de 96 px', (await inspectorX()) === 96);

  // Aimantation désactivée : plus de collage.
  await page.click('#view-snap');
  await page.click('#view-safe');
  const second = await at(96 + 100, 1080 * 0.7 + 100);
  await page.mouseDown(second.x, second.y);
  for (let step = 1; step <= 6; step += 1) await page.mouseMove(second.x - (92 * f.scale * step) / 6, second.y);
  await page.mouseUp(second.x - 92 * f.scale, second.y);
  await page.sleep(100);
  const free = await inspectorX();
  check('aimantation coupée : le bord s’arrête là où le pointeur l’a mené (≈ 4 px), sans coller à 0', Math.abs(free - 4) <= 3);

  // Les préférences vivent sur le serveur : elles survivent même à la perte du stockage du navigateur.
  await page.sleep(900);
  await page.evaluate('localStorage.clear()');
  await page.goto(`http://localhost:${stack.staticPort}/dev/studio.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.sleep(500);
  const prefs = await page.evaluate("({ grid: document.getElementById('view-grid').getAttribute('aria-pressed'), rulers: document.getElementById('view-rulers').getAttribute('aria-pressed'), snap: document.getElementById('view-snap').getAttribute('aria-pressed') })");
  check('grille et règles restent actives, aimantation coupée, le stockage du navigateur ayant été vidé : les préférences sont sur le serveur', prefs.grid === 'true' && prefs.rulers === 'true' && prefs.snap === 'false');
  const onServer = await stack.api('/studio-settings');
  check('le serveur détient ces préférences', onServer.preferences['view.grid'] === true && onServer.preferences['view.snap'] === false);
  await stack.api('/studio-settings', { preferences: { 'view.grid': null, 'view.rulers': null, 'view.snap': null, 'view.safe': null } });

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
