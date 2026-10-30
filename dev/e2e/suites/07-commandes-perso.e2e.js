// @ts-check
/**
 * Les commandes personnalisées : créer, capturer un raccourci, exécuter (un seul annuler), enregistrer une macro, exporter,
 * importer, dupliquer, supprimer, retrouver après rechargement.
 */
import { layerRow, layerRows, openStudio, panelState } from '../studio.js';

export const name = 'commandes personnalisées';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  await stack.api('/studio-settings', { customCommands: [] });
  await page.evaluate('localStorage.clear()');
  await page.goto(`http://localhost:${stack.staticPort}/dev/studio.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.sleep(500);

  const paletteRun = async (/** @type {string} */ query) => {
    await page.press('Control+k');
    await page.fill('#palette-input', query);
    await page.press('Enter');
    await page.sleep(250);
  };
  const cards = () => page.evaluate("[...document.querySelectorAll('#cc-list .cc-card')].map((c) => ({ name: c.querySelector('strong').textContent, shortcut: c.querySelector('kbd')?.textContent ?? null, steps: c.querySelector('.cc-card-steps').textContent }))");
  const editorState = () => page.evaluate("({ steps: [...document.querySelectorAll('#cc-steps .cc-step-label')].map((l) => l.textContent), shortcut: document.getElementById('cc-shortcut').textContent, errors: [...document.querySelectorAll('#cc-errors li')].map((l) => l.textContent), saveDisabled: document.getElementById('cc-save').disabled })");
  const addStep = async (/** @type {string} */ query) => {
    await page.fill('#cc-step-search', query);
    await page.click('#cc-step-results .cc-result');
  };
  const placement = async (/** @type {number} */ row) => page.evaluate(`(() => { const r = [...document.querySelectorAll('#layers-list .layer-row')][${row}]; return r.querySelector('.layer-sub').textContent; })()`);

  // Création depuis la palette.
  await paletteRun('creer commande personnalisee');
  check('la palette trouve « Créer une commande personnalisée » et ouvre l’éditeur', await page.evaluate("document.getElementById('custom-commands').open && !document.getElementById('cc-editor').hidden"));
  let editor = await editorState();
  check('sans nom ni étape, on ne peut pas enregistrer, et l’éditeur dit pourquoi', editor.saveDisabled === true && editor.errors.includes('le nom est obligatoire') && editor.errors.includes('au moins une étape est nécessaire'));

  await page.fill('#cc-name', 'Incrustation basse');
  await addStep('position incrustation bas droit');
  await addStep('basculer la grille');
  editor = await editorState();
  check('les étapes sont ajoutées dans l’ordre, depuis la recherche', editor.steps.join('|') === 'Position : Incrustation bas droit|Basculer la grille');
  await page.click('#cc-steps .cc-step:nth-child(2) button[title="Monter l’étape"]');
  check('une étape se monte', (await editorState()).steps[0] === 'Basculer la grille');
  await page.click('#cc-steps .cc-step:nth-child(1) button[title="Descendre l’étape"]');
  await page.click('#cc-steps .cc-step:nth-child(1) button[title="Retirer l’étape"]');
  await page.click('#cc-steps .cc-step:nth-child(1) button[title="Retirer l’étape"]');
  check('une étape se retire', (await editorState()).steps.length === 0);
  await addStep('position incrustation bas droit');
  await addStep('aligner a gauche');

  // Capture du raccourci.
  await page.click('#cc-shortcut');
  check('cliquer le raccourci passe en capture', (await editorState()).shortcut.startsWith('Appuyez'));
  await page.press('Control+t');
  editor = await editorState();
  check('une combinaison réservée au navigateur est refusée avec son motif', editor.shortcut === 'Ctrl+T' && editor.errors.some((/** @type {string} */ e) => e.includes('réservé')) && editor.saveDisabled === true);
  await page.click('#cc-shortcut');
  await page.press('Control+c');
  editor = await editorState();
  check('une combinaison déjà prise par une commande est refusée en nommant celle-ci', editor.errors.some((/** @type {string} */ e) => e.includes('déjà pris')));
  await page.click('#cc-shortcut');
  await page.press('Control+Shift+y');
  editor = await editorState();
  check('un raccourci libre est accepté : Ctrl+Maj+Y, enregistrement possible', editor.shortcut === 'Ctrl+Maj+Y' && editor.errors.length === 0 && editor.saveDisabled === false);
  await page.click('#cc-save');
  const saved = await cards();
  check('la commande apparaît dans le gestionnaire avec son raccourci et ses étapes', saved.length === 1 && saved[0].name === 'Incrustation basse' && saved[0].shortcut === 'Ctrl+Maj+Y' && saved[0].steps.includes('Incrustation bas droit → Aligner à gauche'));
  await page.click('#cc-close');

  // Exécution au raccourci : un seul annuler.
  await page.click(layerRow(1));
  await page.click('#inspector-unit-percent');
  const before = await page.evaluate("[document.getElementById('inspector-x').value, document.getElementById('inspector-width').value].join()");
  await page.press('Control+Shift+y');
  await page.sleep(250);
  const after = await page.evaluate("[document.getElementById('inspector-x').value, document.getElementById('inspector-width').value].join()");
  check('le raccourci exécute toutes les étapes : incrustation puis alignement à gauche (x 0, largeur 25 %)', before !== after && after.startsWith('0,25'));
  const undoLabel = (await panelState(page)).undoTitle;
  await page.click('#layers-undo');
  const reverted = await page.evaluate("[document.getElementById('inspector-x').value, document.getElementById('inspector-width').value].join()");
  check('un seul annuler défait toute la commande, nommée d’après elle', undoLabel.includes('Incrustation basse') && reverted === before);

  // Dans la palette, groupe « Personnalisées ».
  await page.press('Control+k');
  await page.fill('#palette-input', 'incrustation basse');
  const found = await page.evaluate("[...document.querySelectorAll('#palette-list .palette-item')].map((li) => li.querySelector('.palette-group').textContent + '|' + li.querySelector('.palette-label').textContent)");
  await page.press('Escape');
  check('la palette la propose, dans le groupe « Personnalisées »', found[0] === 'Personnalisées|Incrustation basse');

  // Étapes indisponibles : signalées.
  await page.click('#canvas-overlay', { position: { x: 4, y: 4 } });
  await page.press('Control+Shift+y');
  await page.sleep(200);
  const status = await page.evaluate("document.getElementById('server-status').textContent");
  check('sans sélection, la commande ne reste pas muette : elle explique qu’aucune étape n’est possible', status.includes('aucune étape possible'));

  // Enregistrement d'une macro.
  await paletteRun('enregistrer une macro');
  check('« Enregistrer une macro » affiche la barre d’enregistrement', await page.evaluate("!document.getElementById('macro-bar').hidden"));
  await paletteRun('ajouter bubble');
  await paletteRun('position coin haut gauche');
  const bar = await page.evaluate("({ count: document.getElementById('macro-count').textContent, steps: document.getElementById('macro-steps').textContent })");
  check('la barre compte les commandes exécutées, dans l’ordre', bar.count === '2 étapes' && bar.steps === 'Ajouter : Bubble → Position : Coin haut gauche');
  await page.click('#macro-finish');
  editor = await editorState();
  check('« Terminer » ouvre l’éditeur prérempli avec les étapes enregistrées', editor.steps.join('|') === 'Ajouter : Bubble|Position : Coin haut gauche');
  await page.fill('#cc-name', 'Bulles en coin');
  await page.click('#cc-save');
  check('la macro est enregistrée comme une commande', (await cards()).some((/** @type {*} */ c) => c.name === 'Bulles en coin'));
  check('la barre d’enregistrement a disparu', await page.evaluate("document.getElementById('macro-bar').hidden"));
  await page.click('#cc-close');

  // Export, import.
  await paletteRun('gerer les commandes');
  await page.click('#cc-export');
  const exported = await page.evaluate("document.getElementById('cc-io-text').value");
  const parsed = JSON.parse(exported);
  check('l’export est un JSON autonome qui contient les deux commandes', parsed.format === 'overlay-custom-commands' && parsed.commands.length === 2);
  await page.click('#cc-io-cancel');
  await page.click('#cc-import');
  const incoming = JSON.stringify({ format: 'overlay-custom-commands', version: 1, commands: [
    { name: 'Bulles en coin', steps: ['layer.top'] },
    { name: 'Venue d’ailleurs', steps: ['layer.top', 'layer.bottom'], shortcut: 'Ctrl+Maj+Y' },
    { name: 'Cassée', steps: ['inexistante'] },
    { name: 'Bonne', steps: ['layer.top'], shortcut: 'Ctrl+Maj+U' },
  ] });
  await page.evaluate(`(() => { const area = document.getElementById('cc-io-text'); area.value = ${JSON.stringify(incoming)}; })()`);
  await page.click('#cc-io-confirm');
  const importStatus = await page.evaluate("document.getElementById('cc-io-status').textContent");
  check('l’import reprend la bonne commande et refuse les trois autres avec leur raison', importStatus.startsWith('1 commande(s) importée(s)') && importStatus.includes('s\'appelle déjà') && importStatus.includes('déjà pris') && importStatus.includes('étape inconnue'));
  await page.click('#cc-io-cancel');
  check('la commande importée est dans la liste, sans avoir remplacé les existantes', (await cards()).map((/** @type {*} */ c) => c.name).join('|') === 'Incrustation basse|Bulles en coin|Bonne');

  // Dupliquer, supprimer avec confirmation.
  await page.click('#cc-list .cc-card:nth-child(2) button[data-action="duplicate"]');
  const duplicated = (await cards()).map((/** @type {*} */ c) => c.name);
  check('dupliquer crée une copie sans raccourci (il serait en conflit)', duplicated.includes('Bulles en coin (copie)') && (await cards()).find((/** @type {*} */ c) => c.name === 'Bulles en coin (copie)').shortcut === null);
  await page.click('#cc-list .cc-card:nth-child(4) button[data-action="remove"]');
  check('supprimer demande confirmation', await page.evaluate("!!document.querySelector('#cc-list .cc-card:nth-child(4) button[data-action=\"remove-confirm\"]')"));
  await page.click('#cc-list .cc-card:nth-child(4) button[data-action="remove-cancel"]');
  check('« Non » conserve la commande', (await cards()).length === 4);
  await page.click('#cc-list .cc-card:nth-child(4) button[data-action="remove"]');
  await page.click('#cc-list .cc-card:nth-child(4) button[data-action="remove-confirm"]');
  check('« Oui » la supprime', (await cards()).length === 3 && !(await cards()).some((/** @type {*} */ c) => c.name === 'Bulles en coin (copie)'));

  // Exécuter depuis le gestionnaire, puis persistance : sur le serveur, le stockage du navigateur ayant été vidé.
  await page.click('#cc-close');
  await page.sleep(900);
  await page.evaluate('localStorage.clear()');
  await page.goto(`http://localhost:${stack.staticPort}/dev/studio.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.sleep(500);
  await page.press('Control+k');
  await page.fill('#palette-input', 'bulles en coin');
  const afterReload = await page.evaluate("[...document.querySelectorAll('#palette-list .palette-label')].map((l) => l.textContent)");
  await page.press('Escape');
  check('après rechargement, les commandes personnalisées sont toujours là', afterReload.includes('Bulles en coin'));
  const rowsBefore = (await layerRows(page)).length;
  await page.press('Control+k');
  await page.fill('#palette-input', 'bulles en coin');
  await page.press('Enter');
  await page.sleep(300);
  check('la macro enregistrée rejoue ses étapes : une couche de plus, en coin', (await layerRows(page)).length === rowsBefore + 1);

  const stored = await stack.api('/studio-settings');
  check('le serveur détient les commandes', stored.customCommands.some((/** @type {*} */ c) => c.name === 'Bulles en coin'));
  await stack.api('/studio-settings', { customCommands: [] });
  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
