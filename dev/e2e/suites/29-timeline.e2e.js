// @ts-check
/**
 * La timeline à images clés : on pose des images clés sur un texte (opacité de 0 à 1), on se place dans le temps (l'aperçu montre cette image),
 * on glisse et on règle les clés, on lit, on publie — et la vraie page de rendu d'OBS joue l'animation depuis l'arrivée de la scène.
 */
import { openStudio } from '../studio.js';

export const name = 'timeline à images clés';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });

  const opacity = () => page.evaluate(`(() => {
    const canvas = [...document.getElementById('bg-layer').querySelectorAll('canvas')].filter((c) => c.parentElement.id !== 'bg-layer').at(-1);
    return Number(getComputedStyle(canvas.parentElement).opacity);
  })()`);
  // `fill` clique d'abord au centre du champ : sur un curseur, cela le déplace. On pose donc la valeur et l'événement, comme le ferait un glissement.
  const seek = async (/** @type {number} */ ms) => {
    await page.evaluate(`(() => { const slider = document.getElementById('timeline-scrub'); slider.value = ${ms}; slider.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await page.sleep(120);
  };
  const keys = (/** @type {string} */ target) => page.evaluate(`[...document.querySelectorAll('.tl-track[data-target="${target}"] .tl-key')].map((k) => k.getAttribute('aria-label'))`);
  const detail = () => page.evaluate(`(() => { const d = document.getElementById('timeline-detail'); return d.hidden ? null : { time: document.getElementById('timeline-key-time').value, value: document.getElementById('timeline-key-value').value, ease: document.getElementById('timeline-key-ease').value }; })()`);

  await page.click('#layers-add');
  await page.click('#gallery-grid [data-kind="text"]');
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Texte')", 8000);
  await page.sleep(400);

  check('la timeline est repliée au départ, sa lecture visible', (await page.evaluate("document.getElementById('timeline-panel').dataset.open")) === 'false' && (await page.evaluate("document.getElementById('timeline-readout').textContent")).startsWith('0,00 s'));
  await page.click('#timeline-toggle');
  check('la déplier montre les images clés', (await page.evaluate("document.getElementById('timeline-panel').dataset.open")) === 'true' && (await page.evaluate("document.getElementById('timeline-toggle').getAttribute('aria-expanded')")) === 'true');
  check('le panneau nomme la couche animée', (await page.evaluate("document.getElementById('timeline-title').textContent")).includes('Animation de'));

  // Deux images clés : l'opacité de 0 (à 0 s) à 1 (à 1 s).
  await page.selectOption('#timeline-target', 'opacity');
  await seek(0);
  await page.click('#timeline-add-key');
  check('poser une première image clé ne change rien : elle prend la valeur de la couche (1)', (await detail())?.value === '1' && (await opacity()) === 1);
  await page.fill('#timeline-key-value', 0);
  await page.sleep(150);
  check('la régler à 0 cache le texte à cet instant', (await opacity()) === 0);
  await seek(1000);
  await page.click('#timeline-add-key');
  await page.fill('#timeline-key-value', 1);
  await page.sleep(150);
  check('deux clés sur la piste « opacité »', (await keys('opacity')).length === 2);
  check('chaque clé se décrit pour un lecteur d’écran', (await keys('opacity'))[1] === 'Image clé opacité à 1,00 s, valeur 1');

  await seek(500);
  check('se placer à 0,5 s montre l’image de cet instant (mi-chemin, courbe symétrique)', Math.abs((await opacity()) - 0.5) < 0.02);
  check('la lecture dit où l’on est', (await page.evaluate("document.getElementById('timeline-readout').textContent")) === '0,50 s / 4,00 s');
  check('se placer met la lecture en pause', (await page.evaluate("document.getElementById('timeline-play').getAttribute('aria-pressed')")) === 'false');
  await seek(0);
  check('à 0 s, le texte est invisible', (await opacity()) === 0);
  await seek(4000);
  check('après la dernière clé, la valeur reste celle de la dernière clé', (await opacity()) === 1);

  // Glisser la deuxième clé à 2 s, à la souris.
  const geometry = await page.evaluate(`(() => {
    const lane = document.querySelector('.tl-lane[data-target="opacity"]').getBoundingClientRect();
    const key = document.querySelectorAll('.tl-track[data-target="opacity"] .tl-key')[1].getBoundingClientRect();
    return { left: lane.left, width: lane.width, y: key.top + key.height / 2, x: key.left + key.width / 2 };
  })()`);
  await page.mouseDown(geometry.x, geometry.y);
  await page.mouseMove(geometry.left + geometry.width * 0.25, geometry.y);
  await page.mouseMove(geometry.left + geometry.width * 0.5, geometry.y);
  await page.mouseUp(geometry.left + geometry.width * 0.5, geometry.y);
  await page.sleep(200);
  const dragged = await detail();
  check('glisser la clé à mi-largeur la place à 2 s (durée de 4 s)', dragged !== null && Math.abs(Number(dragged.time) - 2000) <= 60 ? true : dragged);
  const readout = await page.evaluate("document.getElementById('timeline-readout').textContent");
  check('pendant le glisser, l’aperçu se place sur l’instant de la clé (la lecture le dit)', Math.abs(Number(readout.split(' ')[0].replace(',', '.')) * 1000 - Number(dragged?.time)) < 20 ? true : [readout, dragged]);
  check('un glisser entier est un seul pas d’historique', (await page.evaluate("document.getElementById('layers-undo').title")).includes('Animation'));
  // Un clic dans le vide d'une piste place le repère à cet instant.
  const laneBox = await page.evaluate(`(() => { const r = document.querySelector('.tl-lane[data-target="opacity"]').getBoundingClientRect(); return { width: r.width, height: r.height }; })()`);
  await page.click('.tl-lane[data-target="opacity"]', { position: { x: laneBox.width * 0.25, y: laneBox.height / 2 } });
  await page.sleep(150);
  check('cliquer dans le vide d’une piste place le repère (25 % de 4 s = 1 s)', (await page.evaluate("document.getElementById('timeline-readout').textContent")).startsWith('1,00 s'));
  await seek(1000);
  check('l’aperçu suit : à 1 s, le texte est à mi-chemin du nouveau tracé', Math.abs((await opacity()) - 0.5) < 0.1);

  // Réglages précis : l'instant exact, la courbe.
  await page.fill('#timeline-key-time', 2000);
  await page.sleep(150);
  check('l’instant se règle à la milliseconde', (await detail())?.time === '2000');
  await page.focus('.tl-track[data-target="opacity"] .tl-key:nth-child(1)');
  await page.evaluate("document.querySelector('.tl-track[data-target=\"opacity\"] .tl-key:nth-child(1)').click()");
  await page.selectOption('#timeline-key-ease', 'hold');
  await seek(1500);
  check('une courbe « palier » garde la valeur de la clé jusqu’à la suivante', (await opacity()) === 0);
  await page.selectOption('#timeline-key-ease', 'linear');

  // Clavier : les flèches déplacent la clé choisie.
  await page.focus('.tl-track[data-target="opacity"] .tl-key:nth-child(2)');
  await page.press('ArrowRight');
  await page.sleep(100);
  check('→ déplace la clé de 10 ms', (await detail())?.time === '2010');
  await page.press('Shift+ArrowLeft');
  await page.sleep(100);
  check('Maj+← la déplace de 100 ms', (await detail())?.time === '1910');

  // Une deuxième piste.
  await page.selectOption('#timeline-target', 'rotation');
  await seek(0);
  await page.click('#timeline-add-key');
  check('une autre valeur a sa propre piste', (await page.evaluate("document.querySelectorAll('.tl-track').length")) === 2);
  await page.click('#timeline-key-remove');
  await page.sleep(100);
  check('supprimer sa seule clé retire la piste', (await page.evaluate("document.querySelectorAll('.tl-track').length")) === 1);

  // Durée et boucle.
  await page.fill('#timeline-duration', 2);
  await page.sleep(150);
  check('la durée de la scène se règle (la lecture la suit)', (await page.evaluate("document.getElementById('timeline-readout').textContent")).endsWith('/ 2,00 s'));
  await page.click('#timeline-loop');
  await page.sleep(100);

  // Lecture.
  // « Revenir au début » relance la lecture, comme à l'arrivée de la scène.
  await page.click('#timeline-restart');
  await page.sleep(500);
  const first = await page.evaluate("document.getElementById('timeline-scrub').value");
  await page.sleep(400);
  const second = await page.evaluate("document.getElementById('timeline-scrub').value");
  const label = await page.evaluate("document.getElementById('timeline-play').getAttribute('aria-label')");
  check('la lecture avance (le repère de lecture bouge) et le dit', Number(second) !== Number(first) && label === 'Pause' ? true : [first, second, label]);
  await page.click('#timeline-play');
  const paused = await page.evaluate("document.getElementById('timeline-scrub').value");
  await page.sleep(400);
  check('« Pause » arrête le repère', (await page.evaluate("document.getElementById('timeline-scrub').value")) === paused);

  // Annuler, publier.
  await page.click('#publish-send');
  await page.waitFor("document.getElementById('publish-bar').dataset.state === 'live'", 8000);
  const aired = (await stack.api('/state')).scene;
  const text = aired.layers.find((/** @type {*} */ layer) => layer.kind === 'text');
  check('publié : la scène porte sa timeline, la couche ses pistes', aired.timeline?.durationMs === 2000 && aired.timeline?.loop === 'loop' && text?.timeline?.length === 1 && text.timeline[0].target === 'opacity' && text.timeline[0].keys.length === 2);

  // La vraie page de rendu d'OBS joue l'animation depuis l'arrivée de la scène.
  await page.goto(`http://localhost:${stack.staticPort}/background.html`);
  await page.waitFor("document.querySelectorAll('canvas').length > 0", 15_000);
  const samples = await page.evaluate(`new Promise((resolve) => {
    const out = [];
    const started = performance.now();
    (function sample() {
      const canvases = [...document.querySelectorAll('canvas')].filter((c) => getComputedStyle(c.parentElement).position === 'absolute' && c.parentElement.style.opacity !== '');
      if (canvases.length > 0) out.push(Number(getComputedStyle(canvases.at(-1).parentElement).opacity));
      if (performance.now() - started < 4200) requestAnimationFrame(sample); else resolve(out);
    })();
  })`);
  const low = Math.min(...samples);
  const high = Math.max(...samples);
  check('la page de rendu d’OBS anime le texte : il passe du transparent à l’opaque', samples.length > 20 && low < 0.1 && high > 0.9 ? true : [samples.length, low, high]);

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
