// @ts-check
/**
 * Copier-coller d'images clés : une image clé ou toute une piste se copie, « Coller » la pose au repère de lecture sur la même valeur de la couche sélectionnée
 * (la même ou une autre) ; les raccourcis Ctrl+C et Ctrl+V font de même sur une image clé ; une couche qui n'a pas la valeur copiée refuse, avec la raison.
 */
import { layerRow, openStudio } from '../studio.js';

export const name = 'copier-coller d’images clés';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });

  const seek = async (/** @type {number} */ ms) => {
    await page.evaluate(`(() => { const slider = document.getElementById('timeline-scrub'); slider.value = ${ms}; slider.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await page.sleep(150);
  };
  const keyTimes = (/** @type {string} */ target) => page.evaluate(`[...document.querySelectorAll('.tl-track[data-target="${target}"] .tl-key')].map((k) => k.getAttribute('aria-label').match(/à ([0-9,]+) s/)[1])`);
  const values = (/** @type {string} */ target) => page.evaluate(`[...document.querySelectorAll('.tl-track[data-target="${target}"] .tl-key')].map((k) => Number(k.getAttribute('aria-label').match(/valeur (-?[0-9,.]+)/)[1].replace(',', '.')))`);
  const status = () => page.evaluate("({ text: document.getElementById('server-status').textContent, error: document.getElementById('server-status').classList.contains('error') })");
  const pasteState = () => page.evaluate("({ disabled: document.getElementById('timeline-paste').disabled, title: document.getElementById('timeline-paste').title })");
  const addLayer = async (/** @type {string} */ kind, /** @type {string} */ title, /** @type {number} */ count) => {
    await page.click('#layers-add');
    await page.click(`#gallery-grid [data-kind="${kind}"]`);
    await page.waitFor(`[...document.querySelectorAll('#layers-list .layer-title')].filter((t) => t.textContent === ${JSON.stringify(title)}).length === ${count}`, 8000);
    await page.sleep(300);
  };

  await addLayer('text', 'Texte', 1);
  await page.click('#timeline-toggle');

  // Une animation à copier : l'opacité de 0 (0 s) à 1 (1 s).
  await page.selectOption('#timeline-target', 'opacity');
  await seek(0);
  await page.click('#timeline-add-key');
  await page.fill('#timeline-key-value', 0);
  await seek(1000);
  await page.click('#timeline-add-key');
  await page.fill('#timeline-key-value', 1);
  check('deux images clés posées (0 s et 1 s)', (await keyTimes('opacity')).join() === '0,00,1,00');
  check('« Coller » est grisé tant que rien n’est copié', (await pasteState()).disabled === true);

  // Toute la piste.
  await page.click('.tl-track[data-target="opacity"] .tl-copy');
  const afterCopy = await pasteState();
  check('copier la piste dégrise « Coller » et dit ce qu’il collera', afterCopy.disabled === false && afterCopy.title.includes('2 images clés') && afterCopy.title.includes('opacité') ? true : afterCopy);
  check('la copie est annoncée', (await status()).text === '2 images clés copiées');
  await seek(2000);
  await page.click('#timeline-paste');
  check('coller au repère de 2 s pose les deux images à 2 s et 3 s, avec leurs valeurs', (await keyTimes('opacity')).join() === '0,00,1,00,2,00,3,00' && (await values('opacity')).join() === '0,1,0,1' ? true : [await keyTimes('opacity'), await values('opacity')]);
  check('la première image collée est choisie : son détail s’affiche à 2000 ms', (await page.evaluate("document.getElementById('timeline-key-time').value")) === '2000' && (await page.evaluate("document.getElementById('timeline-detail').hidden")) === false);

  // Annuler défait le collage en une fois.
  await page.click('#layers-undo');
  await page.sleep(200);
  check('annuler retire les deux images collées d’un coup', (await keyTimes('opacity')).join() === '0,00,1,00');
  await page.click('#layers-redo');
  await page.sleep(200);

  // Une seule image clé, collée sur un instant déjà occupé : elle le remplace.
  await page.click('.tl-track[data-target="opacity"] .tl-key[data-index="1"]');
  await page.click('#timeline-key-copy');
  check('copier une image clé : une seule', (await status()).text === '1 image clé copiée' && (await pasteState()).title.includes('1 image clé') ? true : [await status(), await pasteState()]);
  await seek(2000);
  await page.click('#timeline-paste');
  check('coller sur une image déjà posée la remplace : toujours quatre images, celle de 2 s vaut 1', (await keyTimes('opacity')).join() === '0,00,1,00,2,00,3,00' && (await values('opacity')).join() === '0,1,1,1' ? true : [await keyTimes('opacity'), await values('opacity')]);

  // Les raccourcis, sur une image clé.
  // Sans donner le focus à la main : un clic sur l'image clé le lui donne, comme à la souris. La copie précédente valait 1 ; celle-ci vaut 0 : Ctrl+V ne peut pas coller l'ancienne.
  await page.click('.tl-track[data-target="opacity"] .tl-key[data-index="0"]');
  await page.press('Control+c');
  await seek(500);
  await page.press('Control+v');
  await page.sleep(200);
  const shortcut = await keyTimes('opacity');
  check('Ctrl+C puis Ctrl+V sur une image clé copient et collent à 0,5 s', shortcut.includes('0,50') ? true : shortcut);
  check("et c'est bien la valeur de l'image copiée (0), non la copie précédente (1)", (await values('opacity'))[shortcut.indexOf('0,50')] === 0 ? true : await values('opacity'));

  // Une autre couche : la copie la suit.
  await addLayer('text', 'Texte', 2);
  check('la nouvelle couche n’a aucune piste', (await keyTimes('opacity')).length === 0);
  check('« Coller » reste dégrisé : la copie survit au changement de couche', (await pasteState()).disabled === false);
  await seek(1500);
  await page.click('#timeline-paste');
  check('coller sur l’autre couche crée sa piste d’opacité à 1,5 s', (await keyTimes('opacity')).join() === '1,50' ? true : await keyTimes('opacity'));

  // Une valeur que la couche n'a pas : refusé, avec la raison.
  await addLayer('code', 'Code', 1);
  await page.selectOption('#timeline-target', 'param:taille');
  await seek(0);
  await page.click('#timeline-add-key');
  await page.click('.tl-track[data-target="param:taille"] .tl-copy');
  const textRow = await page.evaluate("[...document.querySelectorAll('#layers-list .layer-row')].findIndex((row) => row.querySelector('.layer-title')?.textContent === 'Texte')");
  await page.click(layerRow(textRow));
  await page.sleep(300);
  await page.click('#timeline-paste');
  const refused = await status();
  check('coller un réglage de code sur un texte est refusé, en disant pourquoi', refused.error && refused.text.includes('n’a pas la valeur') && refused.text.includes('rien n’est collé') ? true : refused);
  check('et aucune piste n’a été créée sur le texte', (await page.evaluate("document.querySelectorAll('.tl-track[data-target^=\"param:\"]').length")) === 0);

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
