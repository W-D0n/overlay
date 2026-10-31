// @ts-check
/**
 * La médiathèque et la couche image : import par fichier et par glisser-déposer, choix d'une image pour une couche, couleurs lues
 * dans les pixels de l'aperçu (l'image vient du serveur d'état : le canvas doit rester lisible), refus d'un faux fichier, suppression
 * refusée tant que l'image sert, publication et rechargement.
 */
import { openStudio } from '../studio.js';

export const name = 'médiathèque et image';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });

  // Une vraie image PNG 200×100 : moitié gauche bleue, moitié droite rouge.
  await page.evaluate(`window.__makeFile = async (name, type = 'image/png', width = 200, height = 100) => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(0,0,255)'; context.fillRect(0, 0, width / 2, height);
    context.fillStyle = 'rgb(255,0,0)'; context.fillRect(width / 2, 0, width / 2, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return new File([blob], name, { type });
  }`);
  const giveInput = (/** @type {string} */ expression) => page.evaluate(`(async () => {
    const file = await (${expression});
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.getElementById('asset-file');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const cards = () => page.evaluate("[...document.querySelectorAll('#asset-grid .asset-card')].map((c) => ({ name: c.querySelector('.asset-name').textContent, info: c.querySelector('.asset-info').textContent, use: !!c.querySelector('.asset-use') }))");
  const status = () => page.evaluate("document.getElementById('asset-status').textContent");
  const pixels = (/** @type {[number, number][]} */ points, /** @type {number} */ index = -1) => page.evaluate(`(() => {
    const canvas = [...document.getElementById('bg-layer').querySelectorAll('canvas')].filter((c) => c.parentElement.id !== 'bg-layer').at(${index});
    const context = canvas.getContext('2d');
    return ${JSON.stringify(points)}.map(([fx, fy]) => [...context.getImageData(Math.round((canvas.width - 1) * fx), Math.round((canvas.height - 1) * fy), 1, 1).data]);
  })()`);

  // La galerie ouvre la médiathèque pour une image.
  await page.click('#layers-add');
  await page.click('#gallery-grid [data-kind="image"]');
  await page.waitFor("document.getElementById('asset-library').open", 5000);
  check('« Image » dans la galerie ouvre la médiathèque, vide au départ', (await cards()).length === 0 && (await page.evaluate("!document.getElementById('asset-library-hint').hidden")));

  await giveInput("window.__makeFile('affiche.png')");
  await page.waitFor("document.querySelectorAll('#asset-grid .asset-card').length === 1", 8000);
  let list = await cards();
  check('l’image importée apparaît avec son nom, ses dimensions et son usage', list[0].name === 'affiche.png' && list[0].info.startsWith('200×100') && list[0].info.endsWith('inutilisée'));
  check('en choix, chaque image propose « Utiliser »', list[0].use === true);
  check('l’import est annoncé', (await status()).includes('1 image importée'));

  await giveInput("window.__makeFile('copie.png')");
  await page.waitFor("document.getElementById('asset-status').textContent.includes('déjà là')", 8000);
  check('la même image importée sous un autre nom n’est pas dupliquée', (await cards()).length === 1);

  await giveInput("Promise.resolve(new File(['ceci n est pas une image'], 'faux.png', { type: 'image/png' }))");
  await page.waitFor("document.getElementById('asset-status').textContent.includes('refusé')", 8000);
  check('un faux fichier, même déclaré image, est refusé avec la raison du serveur', (await status()).includes('format non pris en charge') && (await cards()).length === 1);

  await giveInput("Promise.resolve(new File(['a'], 'notes.txt', { type: 'text/plain' }))");
  await page.waitFor("document.getElementById('asset-status').textContent.includes('ignoré')", 8000);
  check('un fichier qui n’est pas une image est ignoré sans appeler le serveur', (await status()).includes('1 fichier ignoré') && (await cards()).length === 1);

  await page.click('#asset-grid .asset-use');
  await page.waitFor("!document.getElementById('asset-library').open", 5000);
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].some((t) => t.textContent === 'Image')", 8000);
  await page.sleep(800);

  const [left, right] = await pixels([[0.25, 0.5], [0.75, 0.5]]);
  check('l’image est peinte dans l’aperçu : moitié gauche bleue, moitié droite rouge', left[2] > 240 && left[0] < 15 && right[0] > 240 && right[2] < 15 && left[3] === 255);

  const geometry = await page.evaluate(`(() => {
    const canvas = [...document.getElementById('bg-layer').querySelectorAll('canvas')].filter((c) => c.parentElement.id !== 'bg-layer').at(-1);
    const stage = document.getElementById('bg-layer').getBoundingClientRect();
    const rect = canvas.parentElement.getBoundingClientRect();
    return { w: rect.width / stage.width, h: rect.height / stage.height, cx: (rect.left + rect.width / 2 - stage.left) / stage.width, cy: (rect.top + rect.height / 2 - stage.top) / stage.height, ratio: rect.width / rect.height };
  })()`);
  check('la couche naît à la proportion de l’image (2:1), à sa taille naturelle, centrée', Math.abs(geometry.ratio - 2) < 0.02 && Math.abs(geometry.w - 200 / 1920) < 0.01 && Math.abs(geometry.cx - 0.5) < 0.01 && Math.abs(geometry.cy - 0.5) < 0.01);

  const selects = await page.evaluate("[...document.querySelectorAll('#fields select')].map((s) => [...s.options].map((o) => o.textContent).join('|'))");
  check('le formulaire de la couche liste les images de la médiathèque, la bonne choisie', selects.some((/** @type {string} */ s) => s === '(aucune image)|affiche.png') && (await page.evaluate("[...document.querySelectorAll('#fields select')].some((s) => s.selectedOptions[0]?.textContent === 'affiche.png')")));

  // Cadrage : couvrir une zone de proportion différente rogne l'image au lieu de la déformer.
  await page.fill('#inspector-width', 50);
  await page.fill('#inspector-height', 50);
  await page.sleep(600);
  const fitIndex = await page.evaluate("[...document.querySelectorAll('#fields select')].findIndex((s) => [...s.options].some((o) => o.value === 'cover'))");
  await page.evaluate(`(() => { const select = document.querySelectorAll('#fields select')[${fitIndex}]; select.value = 'cover'; select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await page.sleep(700);
  const [coverLeft, coverRight] = await pixels([[0.02, 0.5], [0.98, 0.5]]);
  check('« Couvrir » remplit toute la zone (rapport 16:9) en rognant l’image, sans marge', coverLeft[3] === 255 && coverRight[3] === 255 && coverLeft[2] > 240 && coverRight[0] > 240);
  await page.evaluate(`(() => { const select = document.querySelectorAll('#fields select')[${fitIndex}]; select.value = 'contain'; select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await page.sleep(700);
  const [containTop] = await pixels([[0.5, 0.01]]);
  check('« Contenir » laisse des marges transparentes quand les proportions diffèrent', containTop[3] === 0);

  // Glisser-déposer d'un fichier sur l'aperçu : import et couche en une fois.
  await page.evaluate(`(async () => {
    const file = await window.__makeFile('depose.png', 'image/png', 120, 120);
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const area = document.getElementById('stage-area');
    area.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    area.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  })()`);
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].filter((t) => t.textContent === 'Image').length === 2", 10_000);
  check('déposer une image sur l’aperçu l’importe et en fait une couche', true);

  // Suppression : refusée tant que l'image sert.
  // Ouverture par la commande de la palette.
  await page.press('Control+k');
  await page.fill('#palette-input', 'médiathèque');
  await page.sleep(300);
  await page.press('Enter');
  await page.waitFor("document.getElementById('asset-library').open", 5000);
  check('la palette de commandes ouvre la médiathèque', true);
  await page.waitFor("document.querySelectorAll('#asset-grid .asset-card').length === 2", 8000);
  list = await cards();
  check('hors choix, aucune image ne propose « Utiliser » ; les usages sont comptés', list.every((/** @type {*} */ c) => !c.use) && list.some((/** @type {*} */ c) => c.info.endsWith('inutilisée') === false));

  const target = await page.evaluate("[...document.querySelectorAll('#asset-grid .asset-card')].findIndex((c) => c.querySelector('.asset-name').textContent === 'affiche.png')");
  const removeSelector = `#asset-grid .asset-card:nth-child(${target + 1}) .asset-remove`;
  await page.click(removeSelector);
  check('une première pression demande confirmation', (await page.evaluate(`document.querySelector(${JSON.stringify(removeSelector)}).textContent`)) === 'Confirmer ?');
  await page.click(removeSelector);
  await page.waitFor("document.getElementById('asset-status').textContent.includes('utilisée')", 8000);
  check('la suppression d’une image utilisée est refusée, avec la raison', (await status()).includes('utilisée') && (await cards()).length === 2);

  // Les deux couches sont publiées, l'image est servie à l'antenne.
  await page.click('#asset-library-close');
  await page.click('#publish-send');
  await page.waitFor("document.getElementById('publish-bar').dataset.state === 'live'", 8000);
  const aired = (await stack.api('/state')).scene.layers.filter((/** @type {*} */ layer) => layer.kind === 'image');
  check('publié : deux couches image, chacune avec l’identifiant de son asset', aired.length === 2 && aired.every((/** @type {*} */ layer) => /^[0-9a-f]{32}$/.test(layer.options.asset)) && aired[0].options.asset !== aired[1].options.asset);
  const served = await fetch(`http://localhost:${stack.statePort}/assets/${aired[0].options.asset}`);
  check('le serveur sert l’image avec son type, un cache sans limite et l’accès entre origines', served.headers.get('content-type') === 'image/png' && (served.headers.get('cache-control') ?? '').includes('immutable') && served.headers.get('access-control-allow-origin') === '*');

  await page.goto(`http://localhost:${stack.staticPort}/dev/studio.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.waitFor("[...document.querySelectorAll('#layers-list .layer-title')].filter((t) => t.textContent === 'Image').length === 2", 10_000);
  await page.sleep(1200);
  const [reloadedLeft, reloadedRight] = await pixels([[0.25, 0.5], [0.75, 0.5]], -2);
  check('après rechargement, l’image est de nouveau chargée du serveur et peinte', reloadedLeft[3] === 255 && reloadedRight[3] === 255 && reloadedLeft[2] > 240 && reloadedRight[0] > 240 ? true : [reloadedLeft, reloadedRight]);

  // Le refus voulu du faux fichier est un 400 que Chrome journalise : c'est attendu, tout le reste ne l'est pas.
  const unexpected = errors.filter((/** @type {string} */ message) => !message.includes('assets?name=faux.png'));
  check('aucune erreur inattendue dans la console', unexpected.length === 0 ? true : unexpected);
}
