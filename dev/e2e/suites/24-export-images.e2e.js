// @ts-check
/**
 * Une scène qui utilise une image voyage avec elle : l'export emporte l'image (lot version 4), et l'import, sur un serveur où l'image
 * n'existe pas, la range dans la médiathèque puis crée la scène — qui se peint aussitôt avec la bonne image.
 */
import { openStudio } from '../studio.js';

export const name = 'export avec images';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });

  await page.evaluate(`window.__makeFile = async (name) => {
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 90;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(255,0,0)'; context.fillRect(0, 0, 160, 90);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return new File([blob], name, { type: 'image/png' });
  }`);

  // 1. Une scène « Affiche » : une image rouge dans la scène, rangée dans Mes scènes.
  await page.click('#layers-add');
  await page.click('#gallery-grid [data-kind="image"]');
  await page.waitFor("document.getElementById('asset-library').open", 5000);
  await page.evaluate(`(async () => {
    const transfer = new DataTransfer();
    transfer.items.add(await window.__makeFile('rouge.png'));
    const input = document.getElementById('asset-file');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await page.waitFor("document.querySelectorAll('#asset-grid .asset-card').length === 1", 8000);
  await page.click('#asset-grid .asset-use');
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Image')", 8000);
  await page.fill('#preset-name', 'Affiche');
  await page.click('#preset-save');
  await page.waitFor("[...document.querySelectorAll('#preset-list .preset-load')].some((b) => b.textContent.includes('Affiche'))", 8000);
  const assetId = (await stack.api('/state')).scenes.find((/** @type {*} */ scene) => scene.name === 'Affiche').layers.find((/** @type {*} */ layer) => layer.kind === 'image').options.asset;
  check('la scène « Affiche » référence l’image importée', /^[0-9a-f]{32}$/.test(assetId));

  // 2. L'export : on attrape le fichier que le navigateur télécharge.
  await page.evaluate(`(() => { const original = URL.createObjectURL.bind(URL); URL.createObjectURL = (blob) => { window.__exported = blob; return original(blob); }; })()`);
  await page.click('#preset-export');
  await page.waitFor('!!window.__exported', 8000);
  const exportedText = await page.evaluate('window.__exported.text()');
  const exported = JSON.parse(exportedText);
  check('le lot exporté est en version 4 et emporte l’image avec son identifiant et son nom', exported.version === 4 && exported.assets.length === 1 && exported.assets[0].id === assetId && exported.assets[0].name === 'rouge.png' && exported.assets[0].data.length > 50);

  // 3. « Une autre machine » : plus de scène, plus d'image.
  const removed = await stack.api('/delete-preset', { id: (await stack.api('/state')).scenes.find((/** @type {*} */ scene) => scene.name === 'Affiche').id });
  check('la scène est supprimée du serveur', removed.ok !== false && !(await stack.api('/state')).scenes.some((/** @type {*} */ scene) => scene.name === 'Affiche'));
  const deleted = await fetch(`http://localhost:${stack.statePort}/assets/${assetId}`, { method: 'DELETE' });
  check('l’image, devenue inutilisée, se supprime', deleted.status === 200);
  check('plus aucune image sur le serveur', (await (await fetch(`http://localhost:${stack.statePort}/assets`)).json()).assets.length === 0);

  await page.goto(`http://localhost:${stack.staticPort}/dev/studio.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.waitFor("document.getElementById('preset-import')", 8000);

  // 4. L'import du lot.
  await page.evaluate(`((text) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], 'lot.json', { type: 'application/json' }));
    const input = document.getElementById('preset-import');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })(${JSON.stringify(exportedText)})`);
  await page.waitFor("!document.getElementById('preset-import-review').hidden", 8000);
  await page.click('#preset-import-confirm');
  await page.waitFor("[...document.querySelectorAll('#preset-list .preset-load')].some((b) => b.textContent.includes('Affiche'))", 10_000);

  const library = (await (await fetch(`http://localhost:${stack.statePort}/assets`)).json()).assets;
  check('l’image est revenue dans la médiathèque avec le même identifiant, son nom et ses dimensions', library.length === 1 && library[0].id === assetId && library[0].name === 'rouge.png' && library[0].width === 160 && library[0].height === 90);
  const served = await fetch(`http://localhost:${stack.statePort}/assets/${assetId}`);
  check('et elle est servie', served.status === 200 && served.headers.get('content-type') === 'image/png');

  // 5. Ouvrir la scène importée : l'image est peinte (rouge), aucune image manquante.
  await page.click("#preset-list .preset-row:last-child .preset-load");
  await page.sleep(1500);
  const center = await page.evaluate(`(() => {
    const canvas = [...document.getElementById('bg-layer').querySelectorAll('canvas')].filter((c) => c.parentElement.id !== 'bg-layer').at(-1);
    return [...canvas.getContext('2d').getImageData(Math.round(canvas.width / 2), Math.round(canvas.height / 2), 1, 1).data];
  })()`);
  check('la scène importée s’ouvre avec son image peinte (rouge)', center[0] > 240 && center[1] < 15 && center[3] === 255 ? true : center);
  const diagnostics = await (await fetch(`http://localhost:${stack.statePort}/diagnostics`)).json();
  check('le diagnostic ne signale aucune image manquante', diagnostics.assetUse.missing === 0 && diagnostics.assetUse.referenced === 1);

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
