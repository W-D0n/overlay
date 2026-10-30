// @ts-check
/**
 * L'import d'un lot version 3 : une scène à plusieurs couches arrive dans la bibliothèque du Studio sans rechargement, s'ouvre
 * avec toutes ses couches, et n'écrase jamais une scène existante.
 */
import { layerRows, openStudio } from '../studio.js';

export const name = 'import de scènes';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  const layer = (/** @type {string} */ id, /** @type {string} */ kind) => ({ id, kind, visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: {} });
  const names = () => page.evaluate("[...document.querySelectorAll('#preset-list .preset-load')].map((b) => b.textContent)");

  const incoming = { version: 1, id: 'soiree', name: 'Soirée importée', layers: [layer('rain', 'rain'), layer('bubble', 'bubble'), layer('stars', 'stars-parallax')] };
  const bundle = { format: 'overlay-background-presets', version: 3, presets: [], scenes: [incoming] };

  const preview = await stack.api('/preview-import', { bundle });
  check('l’aperçu annonce une scène créée de trois couches', preview.created === 1 && preview.changes[0].component === 'scène de 3 couches');
  await stack.api('/import-presets', { bundle, expectedRevision: preview.revision });

  const appeared = await page.waitFor("[...document.querySelectorAll('#preset-list .preset-load')].some((b) => b.textContent.includes('Soirée importée'))", 10_000);
  check('la scène apparaît dans la bibliothèque sans recharger', appeared && (await names()).some((n) => n.includes('Soirée importée')));

  await page.evaluate("[...document.querySelectorAll('#preset-list .preset-load')].find((b) => b.textContent.includes('Soirée importée')).click()");
  await page.waitFor("document.querySelectorAll('#layers-list .layer-row').length >= 3", 8000);
  const rows = await layerRows(page);
  check('ouverte, elle montre ses trois couches', rows.filter((r) => r.id !== 'branding').length === 3);

  // Réimporter le même lot : rien ne change ; un lot différent de même identifiant ne l'écrase pas.
  const again = await stack.api('/preview-import', { bundle });
  check('réimporter le même lot est ignoré', again.unchanged === 1 && again.created === 0);
  const different = { ...bundle, scenes: [{ ...incoming, layers: [layer('seul', 'rain')] }] };
  const second = await stack.api('/preview-import', { bundle: different });
  await stack.api('/import-presets', { bundle: different, expectedRevision: second.revision });
  await page.waitFor("[...document.querySelectorAll('#preset-list .preset-load')].filter((b) => b.textContent.includes('Soirée importée')).length >= 2", 10_000);
  const after = (await names()).filter((n) => n.includes('Soirée importée'));
  check('un lot différent de même identifiant s’ajoute sous un nom ajusté, l’original reste', after.length === 2 && after.some((n) => n.includes('import')));

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
