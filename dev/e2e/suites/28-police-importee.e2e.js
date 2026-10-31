// @ts-check
/**
 * Une police importée dans la médiathèque : acceptée à son en-tête (le navigateur ne lui donne aucun type), chargée par la page, choisie pour un
 * texte qui change réellement de forme, proposée seule quand on choisit une police (jamais les images), et emportée par un export.
 */
import { existsSync, readFileSync } from 'node:fs';
import { openStudio } from '../studio.js';

export const name = 'police importée';

/** Une vraie police du système qui sert d'essai : un fichier TrueType est un fichier TrueType, d'où qu'il vienne. */
const CANDIDATES = ['C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/calibri.ttf', 'C:/Windows/Fonts/verdana.ttf'];

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  const fontPath = CANDIDATES.find((path) => existsSync(path));
  check('une police du système sert à l’essai', fontPath !== undefined ? true : CANDIDATES);
  if (fontPath === undefined) return;
  const fontBase64 = readFileSync(fontPath).toString('base64');

  await openStudio({ page, stack });
  await page.evaluate(`window.__give = async (name, type, base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], name, { type }));
    const input = document.getElementById('asset-file');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }`);
  const cards = () => page.evaluate("[...document.querySelectorAll('#asset-grid .asset-card')].map((c) => ({ name: c.querySelector('.asset-name').textContent, info: c.querySelector('.asset-info').textContent, font: !!c.querySelector('.asset-font-sample'), family: c.querySelector('.asset-font-sample')?.style.fontFamily ?? '', use: !!c.querySelector('.asset-use') }))");
  const inkCount = () => page.evaluate(`(() => {
    const canvas = [...document.getElementById('bg-layer').querySelectorAll('canvas')].filter((c) => c.parentElement.id !== 'bg-layer').at(-1);
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 40) count += 1;
    return count;
  })()`);

  // 1. Un texte, rendu dans sa famille par défaut.
  await page.click('#layers-add');
  await page.click('#gallery-grid [data-kind="text"]');
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Texte')", 8000);
  await page.fill('#fields textarea', 'Hamburgefonstiv Quickly');
  await page.sleep(700);
  const before = await inkCount();

  // 2. La médiathèque : une police (sans type MIME) et une image.
  await page.press('Control+k');
  await page.fill('#palette-input', 'médiathèque');
  await page.sleep(300);
  await page.press('Enter');
  await page.waitFor("document.getElementById('asset-library').open", 5000);
  await page.evaluate(`window.__give('police-essai.ttf', '', ${JSON.stringify(fontBase64)})`);
  await page.waitFor("document.querySelectorAll('#asset-grid .asset-card').length === 1", 10_000);
  let list = await cards();
  check('la police est acceptée malgré l’absence de type, et décrite par son format', list[0].name === 'police-essai.ttf' && list[0].info.startsWith('police TTF') && list[0].info.endsWith('inutilisée'));
  check('sa carte est un échantillon, pas une image', list[0].font === true);
  const sampled = await page.waitFor("document.querySelector('#asset-grid .asset-font-sample').style.fontFamily.includes('overlay-asset-')", 8000);
  check('l’échantillon s’écrit dans la police importée elle-même', sampled === true);
  check('l’import est annoncé en fichiers (une police s’y trouve)', (await page.evaluate("document.getElementById('asset-status').textContent")).includes('1 fichier importé'));

  await page.evaluate(`(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 20;
    canvas.getContext('2d').fillRect(0, 0, 40, 20);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'carre.png', { type: 'image/png' }));
    const input = document.getElementById('asset-file');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await page.waitFor("document.querySelectorAll('#asset-grid .asset-card').length === 2", 10_000);
  await page.click('#asset-library-close');

  // 3. Le choix de la police ne propose que les polices.
  const fieldSelects = await page.evaluate("[...document.querySelectorAll('#fields select')].map((s) => [...s.options].map((o) => o.textContent).join('|'))");
  check('le réglage « Police importée » liste les polices, jamais les images', fieldSelects.some((/** @type {string} */ s) => s === '(aucune police)|police-essai.ttf'));
  await page.evaluate("[...document.querySelectorAll('#fields .asset-field button')][0].click()");
  await page.waitFor("document.getElementById('asset-library').open", 5000);
  await page.sleep(500);
  list = await cards();
  check('le sélecteur de police n’affiche que la police, avec « Utiliser »', list.length === 1 && list[0].name === 'police-essai.ttf' && list[0].use === true);
  await page.click('#asset-grid .asset-use');
  await page.waitFor("!document.getElementById('asset-library').open", 5000);

  // 4. Le texte change réellement de forme.
  const loaded = await page.waitFor("[...document.fonts].some((f) => f.family.includes('overlay-asset-') && f.status === 'loaded')", 10_000);
  check('la page a chargé la police sous son nom de famille propre', loaded === true);
  await page.sleep(800);
  const after = await inkCount();
  check('le texte est dessiné dans la police importée : sa forme (donc son encre) a changé', Math.abs(after - before) / before > 0.02 ? true : [before, after]);

  // 5. Publier, exporter : la police voyage.
  await page.fill('#preset-name', 'Titre police');
  await page.click('#preset-save');
  await page.waitFor("[...document.querySelectorAll('#preset-list .preset-load')].some((b) => b.textContent.includes('Titre police'))", 8000);
  await page.evaluate(`(() => { const original = URL.createObjectURL.bind(URL); URL.createObjectURL = (blob) => { window.__exported = blob; return original(blob); }; })()`);
  await page.click('#preset-export');
  await page.waitFor('!!window.__exported', 8000);
  const exported = JSON.parse(await page.evaluate('window.__exported.text()'));
  check('l’export emporte la police (et seulement ce que la scène utilise : pas l’image)', exported.assets.length === 1 && exported.assets[0].type === 'ttf' && exported.assets[0].name === 'police-essai.ttf');

  // 6. Une police utilisée ne se supprime pas.
  const usage = (await (await fetch(`http://localhost:${stack.statePort}/assets`)).json()).assets.find((/** @type {*} */ asset) => asset.type === 'ttf');
  const refused = await fetch(`http://localhost:${stack.statePort}/assets/${usage.id}`, { method: 'DELETE' });
  check('le serveur refuse de supprimer une police qu’une scène utilise', refused.status === 409 && usage.uses >= 1);

  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
