// @ts-check
/**
 * L'animation d'une couche : on choisit une entrée et une sortie dans l'inspecteur, on lit l'effet sur le calque réel de l'aperçu (opacité et affichage image par image),
 * une vraie alerte (par le serveur) rejoue la couche qui l'a choisie, puis le réglage s'annule, se publie et se retrouve après rechargement.
 */
import { layerRow, openStudio } from '../studio.js';

export const name = 'animation de couche';

const CALQUE = "([...document.getElementById('bg-layer').querySelectorAll('canvas')].filter((c) => c.parentElement.id !== 'bg-layer').at(-1).parentElement)";
const PHASE = (/** @type {string} */ phase, /** @type {string} */ field) => `#animation-body [data-phase="${phase}"] [data-field="${field}"]`;

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });

  const look = () => page.evaluate(`(() => { const style = getComputedStyle(${CALQUE}); return { opacity: Number(style.opacity), display: style.display }; })()`);
  const startRecording = () => page.evaluate(`window.__s = []; (function sample() { window.__s.push(Number(getComputedStyle(${CALQUE}).opacity)); window.__r = requestAnimationFrame(sample); })()`);
  const stopRecording = async () => {
    await page.evaluate('cancelAnimationFrame(window.__r)');
    return /** @type {number[]} */ (await page.evaluate('window.__s'));
  };
  const between = (/** @type {number[]} */ values) => values.filter((value) => value > 0.05 && value < 0.95).length;
  const pick = (/** @type {string} */ selector, /** @type {string} */ value) => page.selectOption(selector, value);
  const isGone = () => page.waitFor(`getComputedStyle(${CALQUE}).display === 'none'`, 9000);
  const isBack = () => page.waitFor(`getComputedStyle(${CALQUE}).display !== 'none'`, 5000);

  await page.click('#layers-add');
  await page.click('#gallery-grid [data-kind="text"]');
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Texte')", 8000);
  await page.sleep(500);

  // Au départ : rien n'est animé, aucun réglage n'est proposé.
  check('une couche neuve n’a aucune animation : trois « Aucune », aucun réglage visible', await page.evaluate(`['enter', 'loop', 'exit'].every((phase) => document.querySelector('#animation-body [data-phase="' + phase + '"] [data-field=preset]').value === '' && document.querySelector('#animation-body [data-phase="' + phase + '"] .animation-fields').hidden)`));
  check('le texte est visible et opaque', (await look()).opacity === 1);

  // Une entrée : le fondu arrive progressivement, au repos à la fin.
  await startRecording();
  await pick(PHASE('enter', 'preset'), 'fade');
  await page.sleep(1300);
  let samples = await stopRecording();
  const short = between(samples);
  check('choisir un fondu rejoue l’entrée : la couche repart de l’invisible', Math.min(...samples) <= 0.05 ? true : Math.min(...samples));
  check('l’entrée est progressive (des valeurs intermédiaires à l’écran) et finit au repos', short >= 5 && samples.at(-1) === 1 ? true : [short, samples.at(-1)]);
  check('la durée de départ (600 ms) est proposée', (await page.evaluate(`document.querySelector(${JSON.stringify(PHASE('enter', 'durationMs'))}).value`)) === '600');

  // Une durée plus longue : plus d'images intermédiaires.
  await startRecording();
  await page.fill(PHASE('enter', 'durationMs'), 2000);
  await page.press('Tab');
  await page.sleep(2600);
  samples = await stopRecording();
  check('une durée de 2 s allonge l’entrée : plus de deux fois plus d’images intermédiaires', between(samples) > short * 2 ? true : [between(samples), short]);

  // Une sortie à date fixe : la couche s'efface puis sort de l'affichage.
  await pick(PHASE('exit', 'preset'), 'fade');
  check('la sortie démarre sur « quand la scène part » et propose un instant facultatif', await page.evaluate(`document.querySelector(${JSON.stringify(PHASE('exit', 'onLeave'))}).checked === true && document.querySelector(${JSON.stringify(PHASE('exit', 'afterMs'))}).value === ''`));
  await page.fill(PHASE('exit', 'afterMs'), 1500);
  await page.press('Tab');
  await isGone();
  const gone = await look();
  check('à l’instant voulu la couche s’efface puis sort de l’affichage (display: none)', gone.display === 'none');

  // Une alerte choisie la rejoue.
  await page.click(`#animation-body input[data-source="event:raid"]`);
  await isGone();
  await page.click('[data-event="follow"]');
  await page.sleep(600);
  check('une alerte non choisie (follow) ne la fait pas revenir', (await look()).display === 'none');
  await page.click('[data-event="raid"]');
  await isBack();
  check('un raid, choisi, la fait revenir', (await look()).display !== 'none');
  check('et elle repart de l’invisible', (await look()).opacity < 0.9);

  // Annuler : la dernière alerte cochée disparaît.
  await page.click('#layers-undo');
  await page.sleep(200);
  check('annuler décoche l’alerte de relance', await page.evaluate("[...document.querySelectorAll('#animation-body input[data-source]')].every((box) => !box.checked)"));

  // Rejouer à la main.
  await isGone();
  await page.click('#animation-replay');
  await isBack();
  check('« Rejouer » ramène la couche sortie', (await look()).display !== 'none');

  // Publier et retrouver.
  await page.click('#publish-send');
  await page.waitFor("document.getElementById('publish-bar').dataset.state === 'live'", 8000);
  const aired = (await stack.api('/state')).scene.layers.find((/** @type {*} */ layer) => layer.kind === 'text');
  const { enter, exit, ...others } = aired?.animation ?? {};
  check('publié : l’animation est dans la scène de l’antenne, sans liste de relance (elle a été annulée)', enter?.preset === 'fade' && enter.durationMs === 2000 && Object.keys(enter).length === 2 && exit?.preset === 'fade' && exit.durationMs === 600 && exit.afterMs === 1500 && exit.onLeave === true && Object.keys(exit).length === 4 && Object.keys(others).length === 0 ? true : aired?.animation);

  await page.goto(`http://localhost:${stack.staticPort}/studio/index.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Texte')", 10_000);
  await page.click('#layers-list .layer-row:nth-child(2)');
  await page.waitFor(`document.querySelector(${JSON.stringify(PHASE('enter', 'preset'))}).value === 'fade'`, 8000);
  check('après rechargement, l’entrée, sa durée et la sortie sont retrouvées', await page.evaluate(`document.querySelector(${JSON.stringify(PHASE('enter', 'durationMs'))}).value === '2000' && document.querySelector(${JSON.stringify(PHASE('exit', 'preset'))}).value === 'fade' && document.querySelector(${JSON.stringify(PHASE('exit', 'afterMs'))}).value === '1500'`));

  // Retirer les phases rend la couche à elle-même.
  await pick(PHASE('exit', 'preset'), '');
  await pick(PHASE('enter', 'preset'), '');
  check('retirer l’entrée et la sortie masque leurs réglages', await page.evaluate("[...document.querySelectorAll('#animation-body .animation-fields')].every((fields) => fields.hidden)"));
  await page.sleep(300);
  const rest = await look();
  check('et la couche est de nouveau visible, opaque', rest.display !== 'none' && rest.opacity === 1 ? true : rest);

  // Le texte qui se dévoile : on lit l'encre réellement dessinée dans le canvas du texte, pendant que la machine à écrire joue.
  const INK = `(() => { const canvas = ${CALQUE}.querySelector('canvas'); const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; let total = 0; for (let i = 3; i < data.length; i += 16) total += data[i] / 255; return total; })()`;
  const ink = () => page.evaluate(INK);
  /** L'encre toutes les 60 ms pendant `ms` millisecondes. */
  const recordInk = async (/** @type {number} */ ms) => {
    await page.evaluate(`window.__ink = []; window.__tick = setInterval(() => { window.__ink.push(${INK}); }, 60)`);
    await page.sleep(ms);
    await page.evaluate('clearInterval(window.__tick)');
    return /** @type {number[]} */ (await page.evaluate('window.__ink'));
  };
  const baseline = await ink();
  check('le texte posé dessine de l’encre', baseline > 200 ? true : baseline);
  await pick(PHASE('enter', 'preset'), 'type');
  const inked = await recordInk(2400);
  check('la durée de départ d’un préréglage de texte est plus longue (1,5 s)', (await page.evaluate(`document.querySelector(${JSON.stringify(PHASE('enter', 'durationMs'))}).value`)) === '1500');
  check('la machine à écrire part d’un texte presque vide', inked[0] < baseline * 0.3 ? true : [inked[0], baseline]);
  check('l’encre ne fait que croître, lettre après lettre', inked.every((value, at) => at === 0 || value >= inked[at - 1] - baseline * 0.02) ? true : inked);
  check('des états intermédiaires passent à l’écran', inked.filter((value) => value > baseline * 0.1 && value < baseline * 0.9).length >= 4 ? true : inked);
  check('et le texte finit entier, identique à celui qui n’est pas animé', Math.abs(inked.at(-1) - baseline) <= baseline * 0.02 ? true : [inked.at(-1), baseline]);
  await pick(PHASE('enter', 'preset'), '');
  await page.sleep(300);
  check('retirer l’animation rend le texte entier', Math.abs((await ink()) - baseline) <= baseline * 0.02);

  // Un préréglage de texte ne se propose pas à une couche qui n’en dessine pas.
  await page.click('#layers-add');
  await page.click('#gallery-grid [data-kind="shape"]');
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].length >= 3", 8000);
  await page.sleep(300);

  // Le tracé du contour : l'encre d'une forme pleine vient d'abord d'un contour qui se trace, puis du remplissage qui apparaît en fondu.
  const shapeBaseline = await ink();
  check('la forme posée dessine de l’encre', shapeBaseline > 200 ? true : shapeBaseline);
  check('le tracé du contour est proposé sur une forme, pas sur un texte', await page.evaluate(`(() => {
    const options = [...document.querySelectorAll(${JSON.stringify(PHASE('enter', 'preset'))} + ' option')];
    const draw = options.find((option) => option.value === 'draw');
    return !draw.disabled;
  })()`));
  await pick(PHASE('enter', 'preset'), 'draw');
  const traced = await recordInk(2400);
  check('le tracé part d’une forme presque vide', traced[0] < shapeBaseline * 0.3 ? true : [traced[0], shapeBaseline]);
  check('l’encre ne fait que croître : le contour se trace, le remplissage apparaît', traced.every((value, at) => at === 0 || value >= traced[at - 1] - shapeBaseline * 0.02) ? true : traced);
  check('des états intermédiaires passent à l’écran', traced.filter((value) => value > shapeBaseline * 0.05 && value < shapeBaseline * 0.9).length >= 4 ? true : traced);
  check('et la forme finit entière, identique à celle qui n’est pas animée', Math.abs(traced.at(-1) - shapeBaseline) <= shapeBaseline * 0.02 ? true : [traced.at(-1), shapeBaseline]);
  await pick(PHASE('enter', 'preset'), '');
  await page.sleep(300);
  check('sur une forme, les préréglages de texte sont grisés et ceux de calque restent permis', await page.evaluate(`(() => {
    const options = [...document.querySelectorAll(${JSON.stringify(PHASE('enter', 'preset'))} + ' option')];
    const byValue = (value) => options.find((option) => option.value === value);
    return byValue('type').disabled && byValue('letters').disabled && byValue('words').disabled && !byValue('draw').disabled && !byValue('fade').disabled && !byValue('zoom').disabled;
  })()`));
  const textRow = await page.evaluate("[...document.querySelectorAll('#layers-list .layer-row')].findIndex((row) => row.querySelector('.layer-title')?.textContent === 'Texte')");
  await page.click(layerRow(textRow));
  await page.sleep(300);
  check('sur le texte, ils sont permis et le tracé du contour est grisé', await page.evaluate(`(() => {
    const options = [...document.querySelectorAll(${JSON.stringify(PHASE('enter', 'preset'))} + ' option')];
    return options.filter((option) => ['type', 'letters', 'words'].includes(option.value)).every((option) => !option.disabled) && options.find((option) => option.value === 'draw').disabled;
  })()`));

  // Plusieurs couches : le panneau se tait.
  const otherRow = await page.evaluate("[...document.querySelectorAll('#layers-list .layer-row')].findIndex((row) => row.querySelector('.layer-title')?.textContent !== 'Texte')");
  await page.click(layerRow(otherRow), { modifiers: ['Control'] });
  const hint = await page.evaluate("document.getElementById('animation-hint').textContent");
  check('avec plusieurs couches sélectionnées, rien n’est proposé et la raison est dite', (await page.evaluate("document.getElementById('animation-body').hidden")) === true && hint.includes('une seule couche'));

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
