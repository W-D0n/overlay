// @ts-check
/**
 * La courbe personnalisée d'une image clé : on choisit « Courbe personnalisée », on la règle (préréglage, nombres, poignées à la souris et au clavier),
 * et l'aperçu la suit — la valeur lue sur le calque réel est celle de la courbe, rebond compris. Puis annuler, publier, retrouver.
 */
import { cubicBezier } from '../../../cubic-bezier.js';
import { openStudio } from '../studio.js';

export const name = 'courbe personnalisée';

const CALQUE = "([...document.getElementById('bg-layer').querySelectorAll('canvas')].filter((c) => c.parentElement.id !== 'bg-layer').at(-1).parentElement)";
const POINT = (/** @type {string} */ name) => `#timeline-curve input[data-point="${name}"]`;

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });

  const seek = async (/** @type {number} */ ms) => {
    await page.evaluate(`(() => { const slider = document.getElementById('timeline-scrub'); slider.value = ${ms}; slider.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await page.sleep(150);
  };
  /** L'échelle de la couche à cet instant, lue sur son calque. */
  const scaleAt = async (/** @type {number} */ ms) => {
    await seek(ms);
    return page.evaluate(`(() => { const match = ${CALQUE}.style.transform.match(/scale\\(([-0-9.]+)\\)/); return match === null ? 1 : Number(match[1]); })()`);
  };
  const numbers = () => page.evaluate(`['x1', 'y1', 'x2', 'y2'].map((name) => Number(document.querySelector('#timeline-curve input[data-point="' + name + '"]').value))`);
  const controlsHidden = () => page.evaluate("document.querySelector('#timeline-curve .tl-curve-controls').hidden");
  const expected = (/** @type {number[]} */ bezier, /** @type {number} */ ms) => 1 + cubicBezier(/** @type {*} */ (bezier), ms / 1000);
  const near = (/** @type {number} */ got, /** @type {number} */ want) => Math.abs(got - want) < 0.01;

  await page.click('#layers-add');
  await page.click('#gallery-grid [data-kind="text"]');
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Texte')", 8000);
  await page.sleep(400);
  await page.click('#timeline-toggle');

  // Une échelle de 1 (0 s) à 2 (1 s).
  await page.selectOption('#timeline-target', 'scale');
  await seek(0);
  await page.click('#timeline-add-key');
  await page.fill('#timeline-key-value', 1);
  await seek(1000);
  await page.click('#timeline-add-key');
  await page.fill('#timeline-key-value', 2);
  await page.click('.tl-track[data-target="scale"] .tl-key[data-index="0"]');

  check('le détail d\'une image clé montre le dessin de sa courbe', await page.evaluate("document.querySelectorAll('#timeline-curve svg polyline').length === 1 && document.querySelector('#timeline-curve svg polyline').getAttribute('points').split(' ').length >= 40"));
  check('pour une courbe ordinaire, ni nombres ni poignées', (await controlsHidden()) === true && (await page.evaluate("[...document.querySelectorAll('#timeline-curve .tl-curve-handle')].every((h) => h.style.display === 'none')")));
  check('la liste des courbes propose « Courbe personnalisée »', await page.evaluate("[...document.querySelectorAll('#timeline-key-ease option')].some((o) => o.value === 'bezier' && o.textContent === 'Courbe personnalisée')"));

  // Choisir la courbe personnalisée : la courbe de départ, les nombres et les poignées apparaissent.
  await page.selectOption('#timeline-key-ease', 'bezier');
  check('choisir « personnalisée » montre les quatre nombres de la courbe de départ', (await controlsHidden()) === false && (await numbers()).join() === '0.25,0.1,0.25,1');
  check('et deux poignées', await page.evaluate("[...document.querySelectorAll('#timeline-curve .tl-curve-handle')].filter((h) => h.style.display !== 'none').length === 2"));
  check('l\'aperçu suit la courbe de départ à mi-parcours', near(await scaleAt(500), expected([0.25, 0.1, 0.25, 1], 500)) ? true : await scaleAt(500));

  // Un préréglage : le rebond dépasse la valeur d'arrivée.
  await page.selectOption('#timeline-curve .tl-curve-controls select', 'overshoot');
  check('un préréglage remplit les nombres', (await numbers()).join() === '0.34,1.56,0.64,1');
  check('et remet la liste des préréglages au repos', (await page.evaluate("document.querySelector('#timeline-curve .tl-curve-controls select').value")) === '');
  const samples = [];
  for (const ms of [300, 500, 700, 850]) samples.push(await scaleAt(ms));
  check('l\'aperçu suit la courbe du rebond', samples.every((value, at) => near(value, expected([0.34, 1.56, 0.64, 1], [300, 500, 700, 850][at]))) ? true : samples);
  check('le rebond dépasse 2, la valeur de l\'image clé suivante', Math.max(...samples) > 2.03 ? true : samples);
  check('et se pose à 2 à l\'arrivée', near(await scaleAt(1000), 2));

  // Un nombre saisi.
  await page.fill(POINT('y2'), 0.5);
  check('saisir y2 règle la courbe : 0,34, 1,56, 0,64, 0,5', (await numbers()).join() === '0.34,1.56,0.64,0.5');
  check('et l\'aperçu la suit', near(await scaleAt(700), expected([0.34, 1.56, 0.64, 0.5], 700)) ? true : await scaleAt(700));
  await page.fill(POINT('x1'), 5);
  // Le champ qu'on tape n'est jamais réécrit : la valeur ramenée à la borne s'y lit une fois qu'on le quitte.
  await page.press('Tab');
  check('un nombre hors bornes est ramené à la borne (x1 : 0 à 1)', (await numbers())[0] === 1 ? true : await numbers());

  // La poignée, à la souris.
  const handle = await page.evaluate("(() => { const r = document.querySelector('#timeline-curve .tl-curve-handle[data-handle=\"0\"]').getBoundingClientRect(); const s = document.querySelector('#timeline-curve svg').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: s.left, top: s.top, width: s.width, height: s.height }; })()");
  // Le dessin fait 160 × 200 : l'abscisse 0,5 est à 20 + 0,5 × 120 = 80 ; l'ordonnée 1 est à 20 + (1,75 - 1) / 2,5 × 160 = 68.
  await page.mouseDown(handle.x, handle.y);
  await page.mouseMove(handle.left + handle.width * (80 / 160), handle.top + handle.height * (68 / 200));
  await page.mouseUp(handle.left + handle.width * (80 / 160), handle.top + handle.height * (68 / 200));
  const dragged = await numbers();
  check('glisser la première poignée en (0,5 ; 1) règle x1 et y1', Math.abs(dragged[0] - 0.5) < 0.03 && Math.abs(dragged[1] - 1) < 0.03 ? true : dragged);
  check('l\'aperçu suit la poignée', near(await scaleAt(300), expected(dragged, 300)) ? true : await scaleAt(300));

  // La poignée, au clavier.
  await page.focus('#timeline-curve .tl-curve-handle[data-handle="1"]');
  const before = await numbers();
  await page.press('ArrowLeft');
  await page.press('ArrowUp');
  const after = await numbers();
  check('les flèches déplacent la poignée de 0,05 : x2 en moins, y2 en plus', Math.abs(after[2] - (before[2] - 0.05)) < 0.001 && Math.abs(after[3] - (before[3] + 0.05)) < 0.001 ? true : [before, after]);
  await page.press('Shift+ArrowRight');
  check('Maj fait des pas dix fois plus fins', Math.abs((await numbers())[2] - (after[2] + 0.01)) < 0.001 ? true : await numbers());

  // Annuler défait les réglages de la courbe, publier la garde, recharger la retrouve.
  const tuned = await numbers();
  await page.click('#publish-send');
  await page.waitFor("document.getElementById('publish-bar').dataset.state === 'live'", 8000);
  const aired = (await stack.api('/state')).scene.layers.find((/** @type {*} */ layer) => layer.kind === 'text');
  const first = aired?.timeline?.find((/** @type {*} */ track) => track.target === 'scale')?.keys[0];
  check('publié : l\'image clé porte sa courbe, arrondie', first?.ease === 'bezier' && Array.isArray(first.bezier) && first.bezier.every((/** @type {number} */ value, /** @type {number} */ at) => Math.abs(value - tuned[at]) < 0.0015) ? true : first);

  await page.goto(`http://localhost:${stack.staticPort}/dev/studio.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Texte')", 10_000);
  await page.click('#layers-list .layer-row:nth-child(2)');
  await page.click('#timeline-toggle');
  await page.waitFor("document.querySelectorAll('.tl-track[data-target=\"scale\"] .tl-key').length === 2", 8000);
  await page.click('.tl-track[data-target="scale"] .tl-key[data-index="0"]');
  check('après rechargement, la courbe est retrouvée', (await numbers()).every((value, at) => Math.abs(value - tuned[at]) < 0.0015) ? true : [await numbers(), tuned]);

  // Revenir à une courbe ordinaire retire la courbe personnalisée.
  await page.selectOption('#timeline-key-ease', 'linear');
  check('choisir une courbe ordinaire cache les nombres', (await controlsHidden()) === true);
  check('et l\'aperçu redevient linéaire', near(await scaleAt(500), 1.5) ? true : await scaleAt(500));
  await page.click('#layers-undo');
  await page.sleep(300);
  check('annuler rend la courbe personnalisée, avec ses nombres', (await controlsHidden()) === false && (await numbers()).every((value, at) => Math.abs(value - tuned[at]) < 0.0015) ? true : await numbers());

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
