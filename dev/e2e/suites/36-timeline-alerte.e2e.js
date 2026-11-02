// @ts-check
/**
 * La timeline relancée par une alerte : on choisit dans le panneau les alertes qui rejouent l'animation de la scène, puis de vraies alertes arrivent
 * par le serveur (`POST /event`). Une alerte choisie ramène la lecture au début et la remet en marche (même arrêtée à sa fin) ; une autre n'y touche pas.
 */
import { openStudio } from '../studio.js';

export const name = 'timeline relancée par une alerte';

const BOX = (/** @type {string} */ source) => `#timeline-restart-on input[data-source="${source}"]`;

/** @param {*} ctx */
export async function run({ page, stack, check }) {
  await openStudio({ page, stack });
  const readout = () => page.evaluate("document.getElementById('timeline-readout').textContent");
  const playing = () => page.evaluate("document.getElementById('timeline-play').getAttribute('aria-pressed') === 'true'");
  const seekToEnd = async () => {
    await page.evaluate("(() => { const slider = document.getElementById('timeline-scrub'); slider.value = 4000; slider.dispatchEvent(new Event('input', { bubbles: true })); })()");
    await page.sleep(150);
  };
  /** Le temps lu dans l'affichage « 1,25 s / 4,00 s », en secondes. */
  const elapsed = async () => Number(String(await readout()).split(' / ')[0].replace(' s', '').replace(',', '.'));

  await page.click('#layers-add');
  await page.click('#gallery-grid [data-kind="text"]');
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Texte')", 8000);
  await page.sleep(400);
  await page.click('#timeline-toggle');

  // Une animation à rejouer : l'opacité de 0 (0 s) à 1 (1 s).
  await page.selectOption('#timeline-target', 'opacity');
  await seekToEnd();
  await page.evaluate("(() => { const slider = document.getElementById('timeline-scrub'); slider.value = 0; slider.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await page.sleep(120);
  await page.click('#timeline-add-key');
  await page.fill('#timeline-key-value', 0);
  await page.evaluate("(() => { const slider = document.getElementById('timeline-scrub'); slider.value = 1000; slider.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await page.sleep(120);
  await page.click('#timeline-add-key');
  await page.fill('#timeline-key-value', 1);

  const labels = await page.evaluate("[...document.querySelectorAll('#timeline-restart-on label')].map((l) => l.textContent)");
  check('le panneau propose les alertes qui peuvent relancer l’animation, dans l’ordre des sources', labels.join() === 'Toute alerte,Alerte follow,Alerte sub,Alerte raid,Alerte bits' ? true : labels);
  check('aucune n’est cochée au départ', await page.evaluate("[...document.querySelectorAll('#timeline-restart-on input')].every((box) => !box.checked)"));

  // Sans choix : une alerte ne relance rien.
  await seekToEnd();
  await stack.api('/event', { type: 'raid', username: 'Léna', amount: 42 });
  await page.sleep(500);
  check('sans alerte choisie, un raid ne relance pas l’animation (toujours à la fin, en pause)', (await elapsed()) === 4 && !(await playing()));

  // Un raid choisi.
  await page.click(BOX('event:raid'));
  check('la case se coche', await page.evaluate(`document.querySelector(${JSON.stringify(BOX('event:raid'))}).checked`));
  await seekToEnd();
  await stack.api('/event', { type: 'follow', username: 'Paul' });
  await page.sleep(500);
  check('un follow, non choisi, ne relance rien', (await elapsed()) === 4 && !(await playing()));
  await stack.api('/event', { type: 'raid', username: 'Léna', amount: 42 });
  const restarted = await page.waitFor("document.getElementById('timeline-play').getAttribute('aria-pressed') === 'true' && !document.getElementById('timeline-readout').textContent.startsWith('4,00')", 6000);
  check('un raid, choisi, ramène la lecture près du début et la remet en marche', restarted && (await elapsed()) < 3.5 ? true : await readout());

  // Toute alerte.
  await page.click(BOX('event:raid'));
  await page.click(BOX('event:any'));
  await seekToEnd();
  await stack.api('/event', { type: 'bits', username: 'Zoé', amount: 100 });
  check('« Toute alerte » relance sur n’importe quelle alerte (ici des bits)', await page.waitFor("document.getElementById('timeline-play').getAttribute('aria-pressed') === 'true' && !document.getElementById('timeline-readout').textContent.startsWith('4,00')", 6000));

  // Plus aucune : l'animation ne repart plus, et la scène n'en garde pas trace.
  await page.click(BOX('event:any'));
  check('décocher la dernière alerte retire la liste de la scène', await page.evaluate("[...document.querySelectorAll('#timeline-restart-on input')].every((box) => !box.checked)"));
  await seekToEnd();
  await stack.api('/event', { type: 'raid', username: 'Léna', amount: 42 });
  await page.sleep(500);
  check('sans alerte cochée, plus rien ne relance', (await elapsed()) === 4 && !(await playing()));

  // Annuler redonne un choix précédent : la liste fait partie de la scène et de son historique (les réglages de scène rapprochés ne font qu'une entrée).
  await page.click('#layers-undo');
  await page.sleep(200);
  check('annuler ramène une alerte choisie (la liste est dans l’historique d’édition)', await page.evaluate("[...document.querySelectorAll('#timeline-restart-on input')].some((box) => box.checked)"));
  await seekToEnd();
  await stack.api('/event', { type: 'raid', username: 'Léna', amount: 42 });
  check('et le choix rétabli relance de nouveau l’animation', await page.waitFor("document.getElementById('timeline-play').getAttribute('aria-pressed') === 'true' && !document.getElementById('timeline-readout').textContent.startsWith('4,00')", 6000));
}
