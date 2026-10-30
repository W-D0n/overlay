// @ts-check
/**
 * La manipulation directe sur l'aperçu : sélection, déplacement, poignées, aimantation, rectangle, clavier, vue.
 */
import { addLayer, layerRow, layerRows, openStudio, panelState } from '../studio.js';

export const name = 'toile interactive';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });

  /** L'échelle et l'origine de la toile à l'écran : le cadre d'aperçu fait 1920 px de source. */
  const frame = () => page.evaluate("(() => { const r = document.getElementById('bg-layer').getBoundingClientRect(); return { x: r.x, y: r.y, scale: r.width / 1920 }; })()");
  /** Un point de la source (pixels de référence) en coordonnées d'écran. */
  const at = async (/** @type {number} */ sx, /** @type {number} */ sy) => { const f = await frame(); return { x: f.x + sx * f.scale, y: f.y + sy * f.scale }; };
  /** Les valeurs du champ d'inspecteur, en pixels de la source. */
  const inspector = async () => {
    const values = await page.evaluate("({ x: +document.getElementById('inspector-x').value, y: +document.getElementById('inspector-y').value, w: +document.getElementById('inspector-width').value, h: +document.getElementById('inspector-height').value })");
    return values;
  };
  const selectedTitles = async () => (await layerRows(page)).filter((/** @type {*} */ row) => row.selected).map((/** @type {*} */ row) => row.title).join();
  const handleCount = () => page.evaluate("[...document.querySelectorAll('#canvas-overlay .co-handle')].filter((h) => !h.hidden && h.getBoundingClientRect().width > 0).length");
  const guideCount = () => page.evaluate("document.querySelectorAll('#canvas-overlay .co-guide').length");
  /** Un geste complet à la souris : appui, trajet en plusieurs pas, relâchement. */
  async function dragBy(/** @type {{ x: number, y: number }} */ from, /** @type {number} */ dx, /** @type {number} */ dy, /** @type {string[]} */ modifiers = []) {
    await page.mouseDown(from.x, from.y, { modifiers });
    for (let step = 1; step <= 6; step += 1) await page.mouseMove(from.x + (dx * step) / 6, from.y + (dy * step) / 6, { modifiers });
    await page.mouseUp(from.x + dx, from.y + dy, { modifiers });
    await page.sleep(100);
  }

  // Unités en pixels pour lire les valeurs sans conversion.
  await page.click(layerRow(1));
  await page.click('#inspector-unit-pixel');

  // Un effet seul, plein cadre : un clic dessus le sélectionne ; le branding plein cadre ne vole pas le clic.
  const inside = await at(600, 400);
  const overlayBox = await page.boxOf('#canvas-overlay');
  await page.click('#canvas-overlay', { position: { x: inside.x - overlayBox.x, y: inside.y - overlayBox.y } });
  check('un clic sur l’aperçu sélectionne l’effet, pas le branding plein cadre qui est au-dessus', (await selectedTitles()) === 'DotGrid');

  // Une couche en coin haut gauche (960 × 540), sélectionnée.
  await addLayer(page, 'bubble');
  await page.selectOption('#inspector-preset', 'corner-tl');
  check('une couche ajoutée en coin a bien son rectangle (0, 0, 960 × 540)', JSON.stringify(await inspector()) === JSON.stringify({ x: 0, y: 0, w: 960, h: 540 }));
  check('sélectionnée et libre : huit poignées visibles', (await handleCount()) === 8);

  // Déplacer : glisser depuis l'intérieur de la couche.
  let start = await at(480, 270);
  const f0 = await frame();
  await dragBy(start, 200 * f0.scale, 100 * f0.scale);
  let box = await inspector();
  check('glisser la couche la déplace de (200, 100) px de la source', Math.abs(box.x - 200) <= 3 && Math.abs(box.y - 100) <= 3 && box.w === 960 && box.h === 540);
  check('un seul annuler défait tout le déplacement (geste regroupé)', await (async () => { await page.click('#layers-undo'); const b = await inspector(); await page.click('#layers-redo'); return b.x === 0 && b.y === 0; })());

  // Aimantation : approcher le bord gauche à 5 px de la toile fait coller à 0, avec un repère pendant le geste.
  start = await at(200 + 480, 100 + 270);
  const f1 = await frame();
  await page.mouseDown(start.x, start.y);
  await page.mouseMove(start.x - 100 * f1.scale, start.y);
  await page.mouseMove(start.x - 195 * f1.scale, start.y);
  const during = await guideCount();
  await page.mouseUp(start.x - 195 * f1.scale, start.y);
  box = await inspector();
  check('le bord gauche, à 5 px de la toile, colle à 0', box.x === 0);
  check('un repère d’aimantation était tracé pendant le glissement', during >= 1);
  check('le repère disparaît au relâchement', (await guideCount()) === 0);

  // Ctrl tenu : pas d'aimantation.
  start = await at(480, 370);
  await dragBy(start, 195 * f1.scale, 0, ['Control']);
  box = await inspector();
  check('Ctrl tenu : aucune aimantation, la position reste celle du pointeur (≈ 195)', Math.abs(box.x - 195) <= 3);
  await page.fill('#inspector-x', 0);
  await page.fill('#inspector-y', 0);

  // Redimensionner : poignée sud-est.
  const se = await page.evaluate("(() => { const r = document.querySelector('#canvas-overlay .co-handle[data-handle=se]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
  await dragBy(se, 100 * f1.scale, 50 * f1.scale);
  box = await inspector();
  check('la poignée sud-est agrandit de (100, 50) px et ne touche pas à l’angle opposé', Math.abs(box.w - 1060) <= 3 && Math.abs(box.h - 590) <= 3 && box.x === 0 && box.y === 0);

  // Proportions liées avec Maj.
  await page.selectOption('#inspector-preset', 'corner-tl');
  const east = await page.evaluate("(() => { const r = document.querySelector('#canvas-overlay .co-handle[data-handle=e]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
  await dragBy(east, 100 * f1.scale, 0, ['Shift']);
  box = await inspector();
  check('Maj sur une poignée de bord : les proportions (16:9) sont conservées', Math.abs(box.w / box.h - 960 / 540) < 0.01 && box.w > 1000);

  // Échap annule un geste en cours.
  await page.selectOption('#inspector-preset', 'corner-tl');
  start = await at(480, 270);
  await page.mouseDown(start.x, start.y);
  await page.mouseMove(start.x + 150 * f1.scale, start.y + 80 * f1.scale);
  await page.press('Escape');
  await page.mouseUp(start.x + 150 * f1.scale, start.y + 80 * f1.scale);
  box = await inspector();
  check('Échap pendant un glissement l’annule : la couche est revenue à sa place', box.x === 0 && box.y === 0);

  // Couche verrouillée : sélectionnable, intouchable.
  await page.click(`${layerRow(1)} .layer-lock`);
  await page.sleep(100);
  check('une couche verrouillée n’a plus de poignées', (await handleCount()) === 0);
  start = await at(480, 270);
  await dragBy(start, 300 * f1.scale, 0);
  box = await inspector();
  check('glisser une couche verrouillée ne la déplace pas', box.x === 0);
  await page.click(`${layerRow(1)} .layer-lock`);

  // Sélection au rectangle : un vide est nécessaire, on réduit l'effet de fond.
  await page.click(layerRow(2));
  await page.selectOption('#inspector-preset', 'center');
  await page.click('#canvas-overlay', { position: { x: 5, y: 5 } });
  const emptyPoint = await at(1700, 950);
  await dragBy(emptyPoint, -700 * f1.scale, -850 * f1.scale);
  check('le rectangle de sélection sélectionne les couches qu’il touche', (await selectedTitles()) === 'DotGrid');
  await page.click('#canvas-overlay', { position: { x: 5, y: 5 } });
  await page.sleep(100);
  check('cliquer dans le vide désélectionne', (await selectedTitles()) === '');

  // Clavier : flèches.
  await page.click(layerRow(1));
  await page.focus('#canvas-overlay');
  const before = await inspector();
  await page.press('ArrowRight');
  await page.press('ArrowRight');
  await page.press('ArrowRight');
  let after = await inspector();
  check('trois flèches droite déplacent de 3 px', after.x === before.x + 3);
  await page.press('Shift+ArrowDown');
  after = await inspector();
  check('Maj+flèche bas déplace de 10 px', after.y === before.y + 10);
  await page.click('#layers-undo');
  const reverted = await inspector();
  check('les quatre déplacements au clavier, rapprochés, forment une seule entrée : un annuler les défait tous', reverted.x === before.x && reverted.y === before.y);

  // Alt+clic : la couche en dessous.
  await page.click('#canvas-overlay', { position: { x: 5, y: 5 } });
  const overlap = await at(600, 400);
  await page.click('#canvas-overlay', { position: { x: overlap.x - (await page.boxOf('#canvas-overlay')).x, y: overlap.y - (await page.boxOf('#canvas-overlay')).y } });
  const first = await selectedTitles();
  await page.click('#canvas-overlay', { position: { x: overlap.x - (await page.boxOf('#canvas-overlay')).x, y: overlap.y - (await page.boxOf('#canvas-overlay')).y }, modifiers: ['Alt'] });
  const second = await selectedTitles();
  check('Alt+clic sélectionne la couche située sous celle déjà sélectionnée', first !== '' && second !== '' && first !== second);

  // Vue : zoom à la molette et déplacement à l'Espace.
  await page.click('#canvas-overlay', { position: { x: 5, y: 5 } });
  const fitFrame = await frame();
  const pointer = await at(960, 540);
  await page.wheel(pointer.x, pointer.y, -120, { modifiers: ['Control'] });
  await page.sleep(100);
  const zoomed = await frame();
  const stillUnder = await page.evaluate(`(() => { const r = document.getElementById('bg-layer').getBoundingClientRect(); const scale = r.width / 1920; return { x: (${pointer.x} - r.x) / scale, y: (${pointer.y} - r.y) / scale }; })()`);
  check('Ctrl + molette agrandit la vue', zoomed.scale > fitFrame.scale * 1.05);
  check('le point sous le pointeur reste sous le pointeur pendant le zoom', Math.abs(stillUnder.x - 960) < 3 && Math.abs(stillUnder.y - 540) < 3);
  await page.focus('#canvas-overlay');
  await page.keyDown(' ');
  const grip = await at(400, 300);
  await dragBy(grip, 120, 60);
  await page.keyUp(' ');
  const panned = await frame();
  check('Espace + glisser déplace la vue sans toucher aux couches', Math.abs(panned.x - zoomed.x - 120) < 3 && Math.abs(panned.y - zoomed.y - 60) < 3);
  await page.press('0');
  const refit = await frame();
  check('la touche 0 ajuste de nouveau la vue', Math.abs(refit.scale - fitFrame.scale) < 1e-6);

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
