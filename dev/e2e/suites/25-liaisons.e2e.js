// @ts-check
/**
 * Les liaisons d'une couche : une alerte (envoyée au serveur, revenue par le canal d'événements comme à l'antenne) fait paraître un
 * titre, qui retombe ; le réglage se défait, se publie et se retrouve après rechargement.
 */
import { layerRow, openStudio } from '../studio.js';

export const name = 'liaisons de couche';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });

  const calqueOpacity = () => page.evaluate(`(() => {
    const canvas = [...document.getElementById('bg-layer').querySelectorAll('canvas')].filter((c) => c.parentElement.id !== 'bg-layer').at(-1);
    return Number(getComputedStyle(canvas.parentElement).opacity);
  })()`);
  const rows = () => page.evaluate("[...document.querySelectorAll('#bindings-list .binding-row')].map((row) => ({ source: row.querySelector('[data-field=source]').value, target: row.querySelector('[data-field=target]').value, from: row.querySelector('[data-field=from]').value, to: row.querySelector('[data-field=to]').value, duration: row.querySelector('[data-field=durationMs]').value }))");
  const pick = (/** @type {number} */ index, /** @type {string} */ field, /** @type {string} */ value) => page.evaluate(`(() => { const select = document.querySelectorAll('#bindings-list .binding-row')[${index}].querySelector('[data-field=${field}]'); select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);

  await page.click('#layers-add');
  await page.click('#gallery-grid [data-kind="text"]');
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Texte')", 8000);
  await page.sleep(500);
  check('un texte posé est visible (opacité 1), sans liaison', (await calqueOpacity()) === 1 && (await rows()).length === 0);

  // Une liaison : « à chaque raid, le titre paraît puis retombe ».
  await page.click('#bindings-add');
  let list = await rows();
  check('« Ajouter une liaison » crée une ligne de départ : le son pilote l’échelle', list.length === 1 && list[0].source === 'audio' && list[0].target === 'scale' && list[0].from === '1' && list[0].to === '1.25');
  await pick(0, 'source', 'event:raid');
  await pick(0, 'target', 'opacity');
  list = await rows();
  check('changer la valeur pilotée remet de et à aux valeurs de départ de l’opacité ; la source alerte a une retombée de 800 ms', list[0].source === 'event:raid' && list[0].target === 'opacity' && list[0].from === '0' && list[0].to === '1' && list[0].duration === '800');
  await page.sleep(400);
  check('au repos, la valeur liée est « de » : le titre est invisible', (await calqueOpacity()) === 0);

  // Le raid : on échantillonne l'opacité pendant la retombée.
  await page.evaluate(`window.__samples = []; (function sample() { const canvas = [...document.getElementById('bg-layer').querySelectorAll('canvas')].filter((c) => c.parentElement.id !== 'bg-layer').at(-1); window.__samples.push([performance.now(), Number(getComputedStyle(canvas.parentElement).opacity)]); window.__sampler = requestAnimationFrame(sample); })()`);
  await page.click('[data-event="raid"]');
  await page.sleep(1400);
  const samples = await page.evaluate('window.__samples');
  const peak = Math.max(...samples.map((/** @type {number[]} */ [, value]) => value));
  const last = samples.at(-1)[1];
  check('le raid fait paraître le titre (opacité proche de 1)', peak >= 0.9 ? true : peak);
  check('puis il retombe à l’invisible avant la fin de la durée', last === 0 ? true : [last, samples.slice(-5)]);
  const mid = samples.filter((/** @type {number[]} */ [, value]) => value > 0.05 && value < 0.9).length;
  check('la retombée est progressive : des valeurs intermédiaires sont passées à l’écran', mid >= 3 ? true : mid);

  await page.evaluate('cancelAnimationFrame(window.__sampler); window.__samples = []');
  await page.evaluate(`(function sample() { const canvas = [...document.getElementById('bg-layer').querySelectorAll('canvas')].filter((c) => c.parentElement.id !== 'bg-layer').at(-1); window.__samples.push(Number(getComputedStyle(canvas.parentElement).opacity)); window.__sampler = requestAnimationFrame(sample); })()`);
  await page.click('[data-event="follow"]');
  await page.sleep(500);
  const other = await page.evaluate('window.__samples');
  check('une alerte d’un autre type ne déclenche rien', Math.max(...other) === 0 ? true : [Math.max(...other), other.length]);
  await page.evaluate('cancelAnimationFrame(window.__sampler)');

  // Annuler, rétablir, publier.
  // Ajouter, choisir la source, choisir la valeur : trois pas d'historique.
  for (let step = 0; step < 3; step += 1) await page.click('#layers-undo');
  check('annuler retire la liaison : le titre redevient visible', (await rows()).length === 0 && (await calqueOpacity()) === 1 ? true : [(await rows()).length, await calqueOpacity()]);
  for (let step = 0; step < 3; step += 1) await page.click('#layers-redo');
  check('rétablir la remet', (await rows()).length === 1 && (await calqueOpacity()) === 0);

  await page.fill('#bindings-list [data-field=durationMs]', 1500);
  await page.press('Tab');
  await page.click('#bindings-add');
  list = await rows();
  check('une deuxième liaison prend la valeur libre suivante, et l’opacité n’est plus proposée deux fois', list.length === 2 && list[1].target === 'scale' && (await page.evaluate("[...document.querySelectorAll('#bindings-list .binding-row')[1].querySelectorAll('[data-field=target] option')].find((o) => o.value === 'opacity').disabled")) === true);

  await page.click('#publish-send');
  await page.waitFor("document.getElementById('publish-bar').dataset.state === 'live'", 8000);
  const aired = (await stack.api('/state')).scene.layers.find((/** @type {*} */ layer) => layer.kind === 'text');
  check('publié : les liaisons sont dans la scène de l’antenne, avec leurs valeurs', aired?.bindings?.length === 2 && aired.bindings[0].source === 'event:raid' && aired.bindings[0].durationMs === 1500 && aired.bindings[1].target === 'scale');

  await page.goto(`http://localhost:${stack.staticPort}/dev/studio.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Texte')", 10_000);
  await page.click('#layers-list .layer-row:nth-child(2)');
  await page.waitFor("document.querySelectorAll('#bindings-list .binding-row').length === 2", 8000);
  check('après rechargement, la couche retrouve ses deux liaisons', (await rows()).length === 2);

  // Plusieurs couches : la section se tait.
  await page.click(layerRow(2), { modifiers: ['Control'] });
  const hint = await page.evaluate("document.getElementById('bindings-hint').textContent");
  check('avec plusieurs couches sélectionnées, rien n’est proposé et la raison est dite', (await page.evaluate("document.querySelectorAll('#bindings-list .binding-row').length")) === 0 && hint.includes('une seule couche') && (await page.evaluate("document.getElementById('bindings-add').disabled")) === true);

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
