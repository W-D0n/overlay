// @ts-check
/**
 * La fenêtre « Rendu OBS » : la vraie page de rendu s'y charge comme page du Studio (elle ne compte pas parmi les sources
 * OBS), montre l'antenne en direct, se décharge à la fermeture et retient son état dans les réglages du serveur.
 */
import { openStudio, settingsSaved } from '../studio.js';

export const name = 'rendu OBS';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack }, { component: 'dotgrid', options: {} });
  await stack.api('/studio-settings', { preferences: { 'view.obs': null } });
  const paletteRun = async (/** @type {string} */ query) => {
    await page.press('Control+k');
    await page.fill('#palette-input', query);
    await page.press('Enter');
    await page.sleep(250);
  };
  const live = async () => (await stack.api('/live-status')).renderPages;

  const before = await live();
  check('fermée au départ : aucune page chargée', await page.evaluate("document.getElementById('obs-pane').hidden && !document.getElementById('obs-frame').getAttribute('src')"));

  await page.click('#view-obs');
  check('le bouton ouvre la fenêtre', await page.evaluate("!document.getElementById('obs-pane').hidden && document.getElementById('view-obs').getAttribute('aria-pressed') === 'true'"));
  const src = await page.evaluate("document.getElementById('obs-frame').getAttribute('src')");
  check('elle charge la vraie page de rendu, comme page du Studio', /\/background\.html\?/.test(src) && src.includes('role=studio') && src.includes('transparent=1'));

  // La page se connecte, dessine l'antenne : un canvas existe dans l'iframe.
  const drawn = await page.waitFor(`(() => { const d = document.getElementById('obs-frame').contentDocument; return !!d && d.querySelectorAll('canvas').length > 0; })()`, 10_000);
  check('la page de rendu dessine l’antenne (un canvas d’effet existe dans la fenêtre)', drawn);
  await page.sleep(500);
  check('cette page ne se fait pas passer pour une source OBS : le compte des sources n’a pas bougé', (await live()) === before);
  const status = await page.evaluate("document.getElementById('obs-status').textContent");
  check('la fenêtre dit combien de sources OBS sont réellement connectées', /source/.test(status));

  // Elle suit l'antenne : on publie une scène de deux effets, la fenêtre dessine un canvas de plus (la page en garde un pour les réactions).
  const canvases = () => page.evaluate("document.getElementById('obs-frame').contentDocument?.querySelectorAll('canvas').length ?? 0");
  const one = await canvases();
  const layer = (/** @type {string} */ id, /** @type {string} */ kind) => ({ id, kind, visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: {} });
  await stack.api('/state', { scene: { version: 1, id: 'deux-effets', name: 'Deux effets', layers: [layer('rain', 'rain'), layer('bubble', 'bubble')] } });
  const followed = await page.waitFor(`(document.getElementById('obs-frame').contentDocument?.querySelectorAll('canvas').length ?? 0) >= ${one + 1}`, 8000);
  check('elle suit l’antenne en direct : un second effet publié apparaît', followed && (await canvases()) === one + 1);

  // Mémorisation sur le serveur.
  await settingsSaved(page);
  check('l’état ouvert est retenu dans les réglages du serveur', (await stack.api('/studio-settings')).preferences['view.obs'] === true);

  // Fermer : la page est déchargée.
  await page.click('#obs-close');
  check('fermer décharge la page', await page.evaluate("document.getElementById('obs-pane').hidden && document.getElementById('obs-frame').getAttribute('src') === 'about:blank'"));

  // Commande de la palette : rouvre.
  await paletteRun('rendu obs');
  check('la palette la rouvre', await page.evaluate("!document.getElementById('obs-pane').hidden"));
  await page.click('#obs-close');
  await settingsSaved(page);
  await stack.api('/studio-settings', { preferences: { 'view.obs': null } });

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
