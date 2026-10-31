// @ts-check
/**
 * Le rendu étendu d'une couche (6d) : fusion, rotation, flou, rognage se règlent dans l'inspecteur, se voient dans l'aperçu, se
 * défont, se publient à l'antenne et se retirent par « Réinitialiser ». Les valeurs proposées sont celles que le banc a mesurées dans OBS.
 */
import { layerRow, openStudio } from '../studio.js';

export const name = 'rendu étendu';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  const air = async () => (await stack.api('/state')).scene;
  // Le calque de la première couche d'effet de l'aperçu : c'est lui qui porte le rendu.
  const style = () => page.evaluate(`(() => {
    const calque = [...document.getElementById('bg-layer').querySelectorAll('canvas')].find((c) => c.parentElement.id !== 'bg-layer').parentElement;
    const computed = getComputedStyle(calque);
    return { blend: computed.mixBlendMode, transform: calque.style.transform, clip: calque.style.clipPath, filter: calque.style.filter, computedFilter: computed.filter };
  })()`);
  const inspector = () => page.evaluate(`({
    blends: [...document.querySelectorAll('#inspector-blend option')].map((o) => o.value),
    blend: document.getElementById('inspector-blend').value,
    rotation: document.getElementById('inspector-rotation').value,
    blur: document.getElementById('inspector-blur').value,
    top: document.getElementById('inspector-crop-top').value,
    left: document.getElementById('inspector-crop-left').value,
    undo: document.getElementById('layers-undo').title,
  })`);

  await page.click(layerRow(1));
  let ui = await inspector();
  check('l’inspecteur propose les modes de fusion mesurés, « Normal » d’abord et choisi', ui.blends.join() === 'normal,multiply,screen,overlay' && ui.blend === 'normal');
  check('une couche neuve n’a ni rotation, ni flou, ni rognage', ui.rotation === '0' && ui.blur === '0' && ui.top === '0' && ui.left === '0');
  let s = await style();
  check('sans réglage, le calque ne porte aucun style de rendu', s.blend === 'normal' && s.transform === '' && s.clip === '' && s.filter === '');

  await page.selectOption('#inspector-blend', 'screen');
  check('la fusion choisie s’applique au calque de l’aperçu', (await style()).blend === 'screen');

  await page.fill('#inspector-rotation', 12);
  s = await style();
  check('rotation 12° : le calque est tourné de 12°', s.transform === 'rotate(12deg)');
  check('un seul annuler défait la rotation (frappes coalescées)', (await inspector()).undo.includes('Rotation'));

  await page.fill('#inspector-blur', 4);
  s = await style();
  check('flou 4 px : le filtre est posé et le navigateur le calcule', s.filter.includes('4px') && /blur\(/.test(s.computedFilter));

  await page.fill('#inspector-crop-top', 10);
  await page.press('Tab');
  await page.fill('#inspector-crop-left', 25);
  await page.press('Tab');
  s = await style();
  check('rognage haut 10 % et gauche 25 % : inset(10% 0% 0% 25%), sans que le second côté défasse le premier', s.clip === 'inset(10% 0% 0% 25%)');

  await page.fill('#inspector-rotation', 999);
  await page.press('Tab');
  ui = await inspector();
  check('une rotation hors bornes est ramenée à 180°', ui.rotation === '180');
  await page.fill('#inspector-crop-top', 95);
  await page.press('Tab');
  check('un rognage hors bornes est ramené à 90 %', (await inspector()).top === '90');
  await page.fill('#inspector-crop-top', 10);
  await page.press('Tab');
  await page.fill('#inspector-rotation', 12);
  await page.press('Tab');

  await page.click('#publish-send');
  await page.waitFor("document.getElementById('publish-bar').dataset.state === 'idle' || document.getElementById('publish-bar').dataset.state === 'clean'", 8000);
  await page.sleep(500);
  const aired = (await air()).layers.find((/** @type {*} */ l) => l.kind === 'dotgrid');
  check('publié : le rendu étendu est dans la scène de l’antenne, sans champ superflu', aired?.blend === 'screen' && aired.rotation === 12 && aired.blur === 4 && aired.crop?.top === 0.1 && aired.crop?.left === 0.25);

  await page.click('#inspector-reset');
  s = await style();
  ui = await inspector();
  check('« Réinitialiser » retire tout le rendu étendu', s.blend === 'normal' && s.transform === '' && s.clip === '' && s.filter === '' && ui.blend === 'normal' && ui.rotation === '0' && ui.blur === '0' && ui.top === '0');
  await page.click('#layers-undo');
  check('annuler la réinitialisation rend le rendu', (await style()).transform === 'rotate(12deg)' && (await inspector()).blend === 'screen');

  // La vignette d'une scène est une photo prise par `paintStage` : elle doit montrer le rognage, pas l'ignorer.
  await page.click('#inspector-reset');
  await page.fill('#inspector-crop-left', 50);
  await page.press('Tab');
  await page.fill('#preset-name', 'Rognée');
  await page.click('#preset-save');
  const halves = `(() => {
    const row = [...document.querySelectorAll('#preset-list .preset-row')].find((r) => r.textContent.includes('Rognée'));
    const img = row?.querySelector('.preset-thumb-still');
    if (!img || !img.getAttribute('src') || !img.naturalWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(img, 0, 0);
    const half = canvas.width / 2;
    const ink = (x, w) => { const d = context.getImageData(x, 0, w, canvas.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n += 1; return n; };
    return { left: ink(0, Math.floor(half) - 2), right: ink(Math.ceil(half) + 2, Math.floor(half) - 2) };
  })()`;
  await page.waitFor(`${halves} !== null`, 20_000);
  const ink = await page.evaluate(halves);
  check('la vignette de la scène rognée à 50 % à gauche est vide à gauche et peinte à droite', ink !== null && ink.left === 0 && ink.right > 0);

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
