// @ts-check
/**
 * Le parcours de base du Studio : essayer un preset, régler, publier, abandonner, enregistrer — avec les presets et les
 * brouillons rangés sur le vrai serveur d'état.
 */
import { layerOf, openStudio, panelState, presetLoad } from '../studio.js';

export const name = 'flux du Studio';

const PILE = { version: 1, id: 'x', name: 'Pile', layers: [layerOf('rain', { id: 'fond' }), layerOf('bubble', { id: 'bulles', opacity: 0.5, placement: { x: 0, y: 0, width: 0.5, height: 0.5 } }), layerOf('branding', { id: 'marque' })] };

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await stack.api('/save-preset', { name: 'Alpha', component: 'rain', options: { speed: 2 }, transition: { type: 'wipe', durationMs: 400, direction: 'up', easing: 'linear' } });
  await stack.api('/save-preset', { scene: PILE });
  await openStudio({ page, stack });

  const air = async () => (await stack.api('/state')).scene;
  const kinds = (/** @type {*} */ scene) => scene.layers.map((/** @type {*} */ layer) => layer.kind).join();
  const snap = async () => ({
    ...(await panelState(page)),
    presets: await page.evaluate("[...document.querySelectorAll('#preset-list .preset-load')].map((b) => b.textContent)"),
    speeds: await page.evaluate("[...document.querySelectorAll('#fields input[type=number]')].map((i) => i.value)"),
  });

  let s = await snap();
  check('la liste montre Alpha et la scène à plusieurs couches « Pile — Rain + Bubble »', s.presets.includes('Alpha — Rain') && s.presets.includes('Pile — Rain + Bubble'));
  check('au départ : en antenne, effet dotgrid, 2 canvas (l’effet et les réactions)', s.bar === 'live' && s.effect === 'dotgrid' && s.canvases === 2);

  await page.click(await presetLoad(page, 'Alpha'));
  await page.sleep(900);
  s = await snap();
  check('essayer Alpha : brouillon, effet rain, bouton « Mettre à jour »', s.bar === 'draft' && s.effect === 'rain' && s.save === 'Mettre à jour');
  check('le formulaire montre la vitesse du preset (2)', s.speeds.includes('2'));
  check('l’antenne n’a pas bougé pendant l’essai', kinds(await air()) === 'dotgrid,branding');

  await page.evaluate("(() => { const el = document.querySelectorAll('#fields input[type=range]')[1]; el.value = '3'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await page.sleep(1400);
  const draft = (await stack.api('/drafts')).drafts?.alpha;
  check('le réglage est rangé comme brouillon de scène sur le serveur', draft !== undefined && draft.scene.layers.some((/** @type {*} */ l) => l.kind === 'rain' && l.options.speed === 3));

  await page.click('#publish-send');
  await page.sleep(700);
  s = await snap();
  const aired = await air();
  check('publier : en antenne, côté page comme côté serveur', s.bar === 'live' && aired.layers[0].kind === 'rain' && aired.layers[0].options.speed === 3);
  check('la transition d’arrivée du preset voyage avec la publication (balayage 400 ms)', aired.transition?.type === 'wipe' && aired.transition?.durationMs === 400);

  await page.selectOption('#effect-select', 'bubble');
  await page.sleep(400);
  s = await snap();
  check('changer l’effet ouvre un brouillon, la couche passe en bubble', s.bar === 'draft' && s.effect === 'bubble');

  await page.evaluate("(() => { const box = document.getElementById('branding-show-on-preset'); box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await page.sleep(300);
  check('décocher le branding le retire du brouillon, pas encore de l’antenne', kinds(await air()) === 'rain,branding');
  await page.click('#publish-send');
  await page.sleep(700);
  check('publié : l’antenne est bubble sans branding', kinds(await air()) === 'bubble');

  await page.click(await presetLoad(page, 'Pile'));
  await page.sleep(1200);
  s = await snap();
  check('ouvrir Pile : 3 canvas, effet ciblé rain, brouillon, branding coché', s.canvases === 3 && s.effect === 'rain' && s.bar === 'draft' && s.branding === true);
  const thumb = await page.evaluate(`(async () => {
    const row = [...document.querySelectorAll('#preset-list .preset-row')].find((r) => r.textContent.includes('Pile'));
    const img = row?.querySelector('.preset-thumb-still');
    if (!img || !img.src) return { ready: false };
    await img.decode().catch(() => {});
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let ink = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > 8) ink += 1;
    return { ready: true, ink: ink / (data.length / 4) };
  })()`);
  check('la vignette de la scène à plusieurs couches contient réellement de l’image', thumb.ready === true && thumb.ink > 0.002);

  await page.click('#publish-discard');
  await page.sleep(500);
  s = await snap();
  check('abandonner : retour à l’antenne (bubble), plus de brouillon', s.bar === 'live' && s.effect === 'bubble');

  await page.click(await presetLoad(page, 'Alpha'));
  await page.sleep(600);
  await page.evaluate("(() => { const el = document.querySelectorAll('#fields input[type=range]')[1]; el.value = '1.5'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await page.sleep(250);
  await page.click('#preset-save');
  await page.sleep(1100);
  const state = await stack.api('/state');
  const alpha = state.scenes.find((/** @type {*} */ scene) => scene.id === 'alpha');
  check('« Mettre à jour » enregistre la scène sur le preset existant et retire son brouillon', alpha !== undefined && alpha.layers[0].options.speed === 1.5 && (await stack.api('/drafts')).drafts?.alpha === undefined);
  check('un seul preset Alpha (pas de doublon)', state.scenes.filter((/** @type {*} */ scene) => scene.name === 'Alpha').length === 1);

  await page.click('#history-open');
  await page.sleep(700);
  const history = await page.evaluate("[...document.querySelectorAll('#history-list li')].length");
  check('l’historique liste les scènes remplacées', history >= 2);

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
