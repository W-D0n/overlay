// @ts-check
/**
 * Layer groups in the real Studio: group and ungroup from the panel and from Ctrl+G / Ctrl+Shift+G (one history entry each), fold and unfold, drag a layer into a group,
 * hide a group from its row, and the canvas, where a click takes the group and Alt+click goes down into its members.
 */
import { addLayer, layerRow, layerRows, openStudio } from '../studio.js';

export const name = 'groupes de couches dans le Studio';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });

  /** The panel rows with what a group changes: kind of row, depth, fold state, inherited look. */
  const rows = () => page.evaluate(`[...document.querySelectorAll('#layers-list .layer-row')].map((r) => ({
    id: r.dataset.id, title: r.querySelector('.layer-title').textContent, group: r.classList.contains('is-group'), depth: r.dataset.depth,
    expanded: r.getAttribute('aria-expanded'), selected: r.classList.contains('is-selected'), hidden: r.classList.contains('is-hidden'), inherited: r.classList.contains('is-inherited'),
  }))`);
  const shape = async () => (await rows()).map((/** @type {*} */ row) => `${row.group ? 'G:' : ''}${row.depth === '1' ? '>' : ''}${row.title}`).join('|');
  const selectedTitles = async () => (await rows()).filter((/** @type {*} */ row) => row.selected).map((/** @type {*} */ row) => row.title).join();
  const undoTitle = () => page.evaluate("document.getElementById('layers-undo').title");
  const frame = () => page.evaluate("(() => { const r = document.getElementById('bg-layer').getBoundingClientRect(); return { x: r.x, y: r.y, scale: r.width / 1920 }; })()");

  // Two effects and the identity layer: Branding, Bulles, DotGrid from the top.
  await addLayer(page, 'bubble');
  const before = await shape();
  check('the scene starts without group', !before.includes('G:'));

  // Group from the panel: both effects selected, the group row comes on top of its members.
  await page.click(layerRow(1));
  await page.click(layerRow(2), { modifiers: ['Control'] });
  check('the group button is enabled for two effects', await page.evaluate("!document.getElementById('layers-group').disabled"));
  await page.click('#layers-group');
  const grouped = await shape();
  check('grouping makes a group row above its two members, indented', /^[^|]*\|G:[^|]*\|>[^|]*\|>[^|]*$/.test(grouped) ? true : grouped);
  check('the group is the selection after grouping', (await rows()).filter((/** @type {*} */ row) => row.selected).every((/** @type {*} */ row) => row.group) && (await rows()).some((/** @type {*} */ row) => row.selected));
  check('the group row is titled "Groupe"', (await rows()).some((/** @type {*} */ row) => row.group && row.title === 'Groupe'));
  check('grouping is one history entry', /Grouper/i.test(await undoTitle()) ? true : await undoTitle());

  // The fold chevron belongs to groups: a plain row keeps its room (hidden), a group row shows it.
  const foldVisibility = () => page.evaluate("[...document.querySelectorAll('#layers-list .layer-row')].map((r) => ({ group: r.classList.contains('is-group'), visibility: getComputedStyle(r.querySelector('.layer-fold')).visibility }))");
  const folds = await foldVisibility();
  check('only the group row shows its fold chevron', folds.some((/** @type {*} */ row) => row.group) && folds.every((/** @type {*} */ row) => row.visibility === (row.group ? 'visible' : 'hidden')));

  // Fold and unfold.
  const groupRow = (await rows()).findIndex((/** @type {*} */ row) => row.group);
  await page.click(`${layerRow(groupRow)} .layer-fold`);
  check('folding hides the members rows and marks the group collapsed', (await rows()).length === 2 && (await rows()).find((/** @type {*} */ row) => row.group).expanded === 'false' ? true : await shape());
  await page.click(`${layerRow(groupRow)} .layer-fold`);
  check('unfolding shows them again', (await rows()).length === 4 && (await rows()).find((/** @type {*} */ row) => row.group).expanded === 'true');

  // The same from the keyboard: Left folds the selected group, Right unfolds it.
  await page.click(layerRow(groupRow));
  await page.focus('#layers-list');
  await page.press('ArrowLeft');
  check('the Left arrow folds the selected group', (await rows()).length === 2);
  await page.press('ArrowRight');
  check('the Right arrow unfolds it', (await rows()).length === 4);

  // Hide the group from its row: the members rows show it is inherited, and nothing but the group is flagged hidden in the scene.
  await page.click(`${layerRow(groupRow)} .layer-visible`);
  const hidden = await rows();
  check('hiding the group marks its members as hidden by their group', hidden.filter((/** @type {*} */ row) => row.depth === '1').every((/** @type {*} */ row) => row.inherited) && hidden[groupRow].hidden ? true : hidden);
  await page.click(`${layerRow(groupRow)} .layer-visible`);
  check('showing it again clears that', (await rows()).every((/** @type {*} */ row) => !row.inherited && !row.hidden));

  // Ungroup from the panel, then undo gives the group back in one step.
  await page.click(layerRow(groupRow));
  await page.click('#layers-ungroup');
  check('ungrouping brings back the flat list', (await shape()) === before ? true : await shape());
  await page.click('#layers-undo');
  check('undo gives the group back', (await shape()) === grouped ? true : await shape());
  await page.click('#layers-redo');
  check('redo ungroups again', (await shape()) === before ? true : await shape());

  // Keyboard: Ctrl+G groups the selection, Ctrl+Shift+G ungroups it.
  await page.click(layerRow(1));
  await page.click(layerRow(2), { modifiers: ['Control'] });
  await page.focus('#layers-list');
  await page.press('Control+g');
  check('Ctrl+G groups the selection', (await shape()) === grouped ? true : await shape());
  await page.press('Control+Shift+g');
  check('Ctrl+Shift+G ungroups it', (await shape()) === before ? true : await shape());

  // Group again, then drag a third layer into the group by dropping it on the group row.
  await addLayer(page, 'shape');
  const flat = await shape();
  await page.click(layerRow(2));
  await page.click(layerRow(3), { modifiers: ['Control'] });
  await page.press('Control+g');
  const withThird = await shape();
  check('with a free layer above, the group holds two members', (await rows()).filter((/** @type {*} */ row) => row.depth === '1').length === 2 ? true : withThird);
  const freeIndex = (await rows()).findIndex((/** @type {*} */ row) => !row.group && row.depth !== '1' && row.title !== 'Branding');
  const groupIndex = (await rows()).findIndex((/** @type {*} */ row) => row.group);
  await page.drag(layerRow(freeIndex), layerRow(groupIndex));
  const joined = await rows();
  check('dropping a layer on a group row puts it in the group', joined.filter((/** @type {*} */ row) => row.depth === '1').length === 3 ? true : await shape());
  await page.click('#layers-undo');
  check('and undo takes it out in one step', (await rows()).filter((/** @type {*} */ row) => row.depth === '1').length === 2);

  // The canvas: a click takes the group, Alt+click goes down into a member. The free layer is hidden: it is full frame and would take the click first.
  const freeNow = (await rows()).findIndex((/** @type {*} */ row) => row.title === 'Forme');
  await page.click(`${layerRow(freeNow)} .layer-visible`);
  const groupNow = (await rows()).findIndex((/** @type {*} */ row) => row.group);
  check('the group exists before the canvas gestures', groupNow >= 0 ? true : await shape());
  const f = await frame();
  const overlayBox = await page.boxOf('#canvas-overlay');
  const centre = { x: f.x + 960 * f.scale - overlayBox.x, y: f.y + 540 * f.scale - overlayBox.y };
  await page.click('#canvas-overlay', { position: centre });
  const picked = await selectedTitles();
  check('a click on the canvas selects the group', picked === 'Groupe' ? true : picked);
  await page.click('#canvas-overlay', { position: centre, modifiers: ['Alt'] });
  const drilled = await selectedTitles();
  check('Alt+click goes down into a member of the group', drilled !== '' && drilled !== 'Groupe' ? true : drilled);

  // Delete the group: its members go with it, one step.
  await page.click(layerRow((await rows()).findIndex((/** @type {*} */ row) => row.group)));
  await page.focus('#layers-list');
  await page.press('Delete');
  check('deleting the group removes it with its members', !(await shape()).includes('G:') && (await rows()).length < joined.length ? true : await shape());
  await page.click('#layers-undo');
  check('undo brings the whole block back', (await shape()).includes('G:'));

  check('no error was reported by the page', errors.length === 0 ? true : errors.slice(0, 3));
  void flat;
}
