import { describe, expect, test } from 'bun:test';
import { sceneFromCurrent } from '../scene-doc.js';
import { BACKGROUND_COMPONENT_NAMES, backgroundEffectLabel, defaultBackgroundOptions } from './component-field-schemas.js';
import { createLayerClipboard } from './layer-clipboard.js';
import { createStudioCommands } from './studio-commands.js';
import { createStudioDocument } from './studio-document.js';
import { PLACEMENT_PRESETS } from './placement-math.js';

/** Un Studio complet sauf le DOM : vrai document, vrai éditeur, vrai presse-papiers ; doublures pour la vue et les fenêtres. */
function setup() {
  const studio = createStudioDocument({ scene: sceneFromCurrent({ component: 'rain', options: {} }) });
  const calls = [];
  const errors = [];
  const record = (name) => () => calls.push(name);
  const registry = createStudioCommands({
    studio,
    clipboard: createLayerClipboard(),
    labelOf: backgroundEffectLabel,
    addableKinds: [...BACKGROUND_COMPONENT_NAMES, 'branding'],
    defaultOptions: defaultBackgroundOptions,
    view: { zoomIn: record('zoomIn'), zoomOut: record('zoomOut'), fit: record('fit'), zoom100: record('zoom100'), toggle: (key) => calls.push(`toggle:${key}`) },
    publication: { publish: record('publish'), discard: record('discard'), showChanges: record('changes'), toggleCompare: record('compare'), testTransition: record('test') },
    dialogs: { palette: record('palette'), shortcuts: record('shortcuts'), history: record('history'), editHistory: record('editHistory'), diagnostic: record('diagnostic') },
    customCommands: { open: record('custom.open'), create: record('custom.create'), startRecording: record('custom.record'), isRecording: () => false },
    report: { ok() {}, error: (message) => errors.push(message) },
  });
  return { registry, studio, editor: studio.editor, calls, errors };
}

const kinds = (studio) => studio.state().scene.layers.map((layer) => layer.kind).join();

describe('garde du registre', () => {
  test('les raccourcis sont uniques : deux commandes ne se disputent jamais une combinaison', () => {
    const { registry } = setup();
    const shortcuts = registry.list().filter((c) => c.shortcut !== undefined).map((c) => c.shortcut);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  test('chaque commande a un libellé, un groupe, et un identifiant unique', () => {
    const { registry } = setup();
    const ids = registry.list().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const command of registry.list()) {
      expect(command.label.length).toBeGreaterThan(0);
      expect(command.group.length).toBeGreaterThan(0);
    }
  });

  test('chaque effet, le branding et chaque position prédéfinie ont leur commande', () => {
    const { registry } = setup();
    for (const kind of [...BACKGROUND_COMPONENT_NAMES, 'branding']) expect(registry.has(`layer.add.${kind}`)).toBe(true);
    for (const preset of PLACEMENT_PRESETS) expect(registry.has(`position.preset.${preset.id}`)).toBe(true);
  });
});

describe('disponibilité', () => {
  test('sans sélection ni historique : rien à copier, annuler, supprimer ; ajouter reste possible', () => {
    const { registry } = setup();
    for (const id of ['edit.undo', 'edit.redo', 'edit.copy', 'edit.cut', 'edit.delete', 'edit.paste', 'layer.up', 'position.align.left']) expect(registry.isEnabled(id)).toBe(false);
    expect(registry.isEnabled('layer.add.bubble')).toBe(true);
  });

  test('le branding existe déjà : « Ajouter : Branding » est indisponible, et revient quand on le retire', () => {
    const { registry, editor } = setup();
    expect(registry.isEnabled('layer.add.branding')).toBe(false);
    editor.removeLayers(['branding']);
    expect(registry.isEnabled('layer.add.branding')).toBe(true);
  });

  test('la répartition demande trois couches ; la publication demande un brouillon', () => {
    const { registry, editor } = setup();
    editor.addLayer({ kind: 'bubble' });
    editor.select(['main', 'bubble']);
    expect(registry.isEnabled('position.distribute.horizontal')).toBe(false);
    editor.selectAll();
    expect(editor.state().selection).toHaveLength(3);
    expect(registry.isEnabled('position.distribute.horizontal')).toBe(true);
    expect(registry.isEnabled('publish.send')).toBe(true);
  });

  test('en antenne (aucun brouillon) : publier, abandonner, comparer sont indisponibles ; tester la transition reste possible', () => {
    const { registry } = setup();
    for (const id of ['publish.send', 'publish.discard', 'publish.changes', 'publish.compare']) expect(registry.isEnabled(id)).toBe(false);
    expect(registry.isEnabled('publish.testTransition')).toBe(true);
  });
});

describe('commandes', () => {
  test('ajouter un effet : la couche arrive avec ses options de départ, sélectionnée', () => {
    const { registry, studio, editor } = setup();
    registry.run('layer.add.bubble');
    expect(kinds(studio)).toBe('rain,bubble,branding');
    expect(editor.state().selection).toEqual(['bubble']);
    expect(studio.state().scene.layers[1].options).toEqual(defaultBackgroundOptions('bubble'));
  });

  test('copier, coller (au-dessus), couper : le contenu passe d’une couche à l’autre, la limite de couches refuse sans rien changer', () => {
    const { registry, studio, editor, errors } = setup();
    editor.select(['main']);
    registry.run('edit.copy');
    expect(registry.isEnabled('edit.paste')).toBe(true);
    registry.run('edit.paste');
    expect(kinds(studio)).toBe('rain,rain,branding');
    registry.run('edit.cut');
    expect(kinds(studio)).toBe('rain,branding');
    for (let i = 0; i < 6; i += 1) registry.run('edit.paste');
    expect(studio.state().scene.layers).toHaveLength(8);
    const before = studio.state().scene;
    registry.run('edit.paste');
    expect(studio.state().scene).toBe(before);
    expect(errors.at(-1)).toContain('8 couches au plus');
  });

  test('copier le style puis le coller sur une autre couche du même type', () => {
    const { registry, studio, editor } = setup();
    editor.setOptions('main', { speed: 3 });
    editor.setLayers(['main'], { opacity: 0.4 });
    editor.addLayer({ kind: 'rain' });
    editor.select(['main']);
    registry.run('edit.copyStyle');
    editor.select(['rain']);
    expect(registry.isEnabled('edit.pasteStyle')).toBe(true);
    registry.run('edit.pasteStyle');
    expect(studio.state().scene.layers[1]).toMatchObject({ opacity: 0.4, options: { speed: 3 } });
  });

  test('ordre : monter, descendre, premier plan, arrière-plan — sans franchir le branding', () => {
    const { registry, studio, editor } = setup();
    editor.addLayer({ kind: 'bubble' });
    editor.select(['main']);
    registry.run('layer.top');
    expect(kinds(studio)).toBe('bubble,rain,branding');
    registry.run('layer.bottom');
    expect(kinds(studio)).toBe('rain,bubble,branding');
    registry.run('layer.up');
    expect(kinds(studio)).toBe('bubble,rain,branding');
    registry.run('layer.down');
    expect(kinds(studio)).toBe('rain,bubble,branding');
  });

  test('basculer visibilité et verrou : sur toute la sélection, à partir de l’état de la première couche', () => {
    const { registry, studio, editor } = setup();
    editor.select(['main']);
    registry.run('layer.toggleVisible');
    registry.run('layer.toggleLock');
    expect(studio.state().scene.layers[0]).toMatchObject({ visible: false, locked: true });
    registry.run('layer.toggleVisible');
    registry.run('layer.toggleLock');
    expect(studio.state().scene.layers[0].visible).toBe(true);
    expect('locked' in studio.state().scene.layers[0]).toBe(false);
  });

  test('position : une couche seule s’aligne sur la toile, plusieurs sur leur sélection ; positions prédéfinies', () => {
    const { registry, studio, editor } = setup();
    editor.select(['main']);
    registry.run('position.preset.pip-br');
    expect(studio.state().scene.layers[0].placement).toMatchObject({ x: 0.72, width: 0.25 });
    registry.run('position.align.left');
    expect(studio.state().scene.layers[0].placement.x).toBe(0);
    registry.run('position.align.hcenter');
    expect(studio.state().scene.layers[0].placement.x).toBeCloseTo(0.375, 9);
  });

  test('solo : un état de vue qui bascule sur la couche principale', () => {
    const { registry, editor } = setup();
    editor.select(['main']);
    registry.run('layer.solo');
    expect(editor.state().solo).toBe('main');
    registry.run('layer.solo');
    expect(editor.state().solo).toBeNull();
  });

  test('annuler et rétablir passent par l’éditeur', () => {
    const { registry, studio, editor } = setup();
    editor.addLayer({ kind: 'bubble' });
    registry.run('edit.undo');
    expect(kinds(studio)).toBe('rain,branding');
    registry.run('edit.redo');
    expect(kinds(studio)).toBe('rain,bubble,branding');
  });
});

describe('délégation vers la vue, la publication et les fenêtres', () => {
  test('chaque commande appelle sa doublure', () => {
    const { registry, editor, calls } = setup();
    editor.setOptions('main', { speed: 2 });
    for (const id of ['view.zoomIn', 'view.zoomOut', 'view.fit', 'view.zoom100', 'view.snap', 'view.grid', 'view.rulers', 'view.safe', 'publish.send', 'publish.discard', 'publish.changes', 'publish.compare', 'publish.testTransition', 'help.palette', 'help.shortcuts', 'help.history', 'edit.history', 'help.diagnostic']) {
      expect(registry.run(id)).toBe(true);
    }
    expect(calls).toEqual(['zoomIn', 'zoomOut', 'fit', 'zoom100', 'toggle:snap', 'toggle:grid', 'toggle:rulers', 'toggle:safe', 'publish', 'discard', 'changes', 'compare', 'test', 'palette', 'shortcuts', 'history', 'editHistory', 'diagnostic']);
  });
});
