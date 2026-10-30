import { describe, expect, test } from 'bun:test';
import { MAX_LAYERS, createLayer, validateSceneDoc } from '../scene-doc.js';
import { createSceneEditor, uniqueLayerId, viewScene } from './scene-editor.js';

const scene = (layers = [], extra = {}) => ({ version: 1, id: 'nuit', name: 'Nuit', layers, ...extra });
const effect = (id, kind = 'rain', over = {}) => createLayer({ id, kind, ...over });
const branding = () => createLayer({ id: 'branding', kind: 'branding' });

/** Éditeur avec horloge pilotée. */
function setup(layers = [effect('a'), effect('b', 'bubble')], options = {}) {
  let time = 1000;
  const editor = createSceneEditor({ scene: scene(layers), now: () => time, ...options });
  return { editor, tick: (ms) => { time += ms; }, ids: () => editor.state().scene.layers.map((layer) => layer.id) };
}

describe('état et abonnement', () => {
  test('état initial : scène telle quelle, rien à annuler, pas de modification', () => {
    const { editor } = setup();
    expect(editor.state()).toMatchObject({ selection: [], solo: null, canUndo: false, canRedo: false, dirty: false, undoLabel: null });
  });

  test('un abonné reçoit chaque changement ; se désabonner l’arrête ; un refus ne notifie pas', () => {
    const { editor } = setup();
    const seen = [];
    const off = editor.subscribe((state) => seen.push(state.scene.layers.length));
    editor.addLayer({ kind: 'rain' });
    expect(seen).toEqual([3]);
    expect(editor.removeLayers(['inexistant']).ok).toBe(false);
    expect(seen).toEqual([3]);
    off();
    editor.addLayer({ kind: 'rain' });
    expect(seen).toEqual([3]);
  });

  test('dirty suit l’écart avec la dernière base ; annuler jusqu’à la base le remet à faux ; markSaved et load changent la base', () => {
    const { editor } = setup();
    editor.setLayers(['a'], { visible: false });
    expect(editor.state().dirty).toBe(true);
    editor.undo();
    expect(editor.state().dirty).toBe(false);
    editor.setLayers(['a'], { visible: false });
    editor.markSaved();
    expect(editor.state().dirty).toBe(false);
    expect(editor.state().canUndo).toBe(true);
    editor.load(scene([effect('z')]));
    expect(editor.state()).toMatchObject({ dirty: false, canUndo: false, selection: [] });
  });
});

describe('ajouter', () => {
  test('la nouvelle couche est sélectionnée, valide, avec un identifiant libre', () => {
    const { editor, ids } = setup([effect('rain')]);
    const result = editor.addLayer({ kind: 'rain' });
    expect(result).toEqual({ ok: true, id: 'rain-2' });
    expect(ids()).toEqual(['rain', 'rain-2']);
    expect(editor.state().selection).toEqual(['rain-2']);
    expect(validateSceneDoc(editor.state().scene).ok).toBe(true);
  });

  test('s’insère juste au-dessus de la sélection, sinon au sommet des effets, toujours sous le branding', () => {
    const { editor, ids } = setup([effect('a'), effect('b', 'bubble'), branding()]);
    editor.addLayer({ kind: 'dotgrid' });
    expect(ids()).toEqual(['a', 'b', 'dotgrid', 'branding']);
    editor.select(['a']);
    editor.addLayer({ kind: 'bubble' });
    expect(ids()).toEqual(['a', 'bubble', 'b', 'dotgrid', 'branding']);
  });

  test('un ancien nom d’effet est reconnu ; un type inconnu est refusé sans rien changer', () => {
    const { editor } = setup([]);
    expect(editor.addLayer({ kind: 'RainBackground' }).ok).toBe(true);
    expect(editor.state().scene.layers[0].kind).toBe('rain');
    const refused = editor.addLayer({ kind: 'inconnu' });
    expect(refused).toMatchObject({ ok: false, reason: 'invalid' });
    expect(editor.state().scene.layers).toHaveLength(1);
  });

  test(`au plus ${MAX_LAYERS} couches ; le refus laisse l’état et l’historique intacts`, () => {
    const { editor } = setup([]);
    for (let i = 0; i < MAX_LAYERS; i += 1) expect(editor.addLayer({ kind: 'rain' }).ok).toBe(true);
    const before = editor.state();
    expect(editor.addLayer({ kind: 'rain' })).toMatchObject({ ok: false, reason: 'limit' });
    expect(editor.state()).toBe(before);
  });

  test('le branding est unique et reste au sommet', () => {
    const { editor, ids } = setup([effect('a')]);
    expect(editor.addLayer({ kind: 'branding' }).ok).toBe(true);
    expect(editor.addLayer({ kind: 'branding' })).toMatchObject({ ok: false, reason: 'unique' });
    editor.addLayer({ kind: 'rain' });
    expect(ids().at(-1)).toBe('branding');
  });

  test('options, nom, opacité et placement initiaux sont conservés', () => {
    const { editor } = setup([]);
    editor.addLayer({ kind: 'rain', name: 'Pluie', options: { speed: 2 }, opacity: 0.4, placement: { width: 0.5 } });
    expect(editor.state().scene.layers[0]).toMatchObject({ name: 'Pluie', options: { speed: 2 }, opacity: 0.4, placement: { x: 0, y: 0, width: 0.5, height: 1 } });
  });
});

describe('supprimer et dupliquer', () => {
  test('supprimer retire les couches et la sélection qui les visait', () => {
    const { editor, ids } = setup();
    editor.select(['a', 'b']);
    editor.removeLayers(['a']);
    expect(ids()).toEqual(['b']);
    expect(editor.state().selection).toEqual(['b']);
  });

  test('supprimer tout est permis (scène vide) et reste annulable', () => {
    const { editor, ids } = setup();
    expect(editor.removeLayers(['a', 'b']).ok).toBe(true);
    expect(ids()).toEqual([]);
    editor.undo();
    expect(ids()).toEqual(['a', 'b']);
  });

  test('dupliquer place la copie au-dessus de l’original, sélectionnée, sans verrou, nom suffixé, options indépendantes', () => {
    const { editor, ids } = setup([effect('a', 'rain', { name: 'Pluie', locked: true, options: { speed: 2 } }), effect('b', 'bubble')]);
    const result = editor.duplicateLayers(['a']);
    expect(result).toEqual({ ok: true, ids: ['a-2'] });
    expect(ids()).toEqual(['a', 'a-2', 'b']);
    const [original, copy] = editor.state().scene.layers;
    expect(copy).toMatchObject({ name: 'Pluie copie', options: { speed: 2 } });
    expect('locked' in copy).toBe(false);
    expect(copy.options).not.toBe(original.options);
    expect(editor.state().selection).toEqual(['a-2']);
  });

  test('plusieurs copies d’un coup, limite respectée, branding non duplicable', () => {
    const { editor } = setup([effect('a'), effect('b'), branding()]);
    expect(editor.duplicateLayers(['a', 'b']).ok).toBe(true);
    expect(editor.state().scene.layers).toHaveLength(5);
    expect(editor.duplicateLayers(['branding'])).toMatchObject({ ok: false, reason: 'unique' });
    expect(editor.duplicateLayers(['a', 'b', 'a-2', 'b-2'])).toMatchObject({ ok: false, reason: 'limit' });
  });
});

describe('réordonner', () => {
  const four = () => setup([effect('a'), effect('b'), effect('c'), effect('d')]);

  test('d’un cran, tout en haut, tout en bas, à une position', () => {
    const { editor, ids } = four();
    editor.moveLayers(['b'], 'up');
    expect(ids()).toEqual(['a', 'c', 'b', 'd']);
    editor.moveLayers(['b'], 'down');
    expect(ids()).toEqual(['a', 'b', 'c', 'd']);
    editor.moveLayers(['a'], 'top');
    expect(ids()).toEqual(['b', 'c', 'd', 'a']);
    editor.moveLayers(['a'], 'bottom');
    expect(ids()).toEqual(['a', 'b', 'c', 'd']);
    editor.moveLayers(['d'], { to: 1 });
    expect(ids()).toEqual(['a', 'd', 'b', 'c']);
  });

  test('plusieurs couches : chacune d’un cran en haut ou en bas ; en tête ou en bas elles se regroupent dans leur ordre', () => {
    const { editor, ids } = four();
    editor.moveLayers(['a', 'c'], 'up');
    expect(ids()).toEqual(['b', 'a', 'd', 'c']);
    editor.moveLayers(['a', 'c'], 'down');
    expect(ids()).toEqual(['a', 'b', 'c', 'd']);
    editor.moveLayers(['a', 'c'], 'top');
    expect(ids()).toEqual(['b', 'd', 'a', 'c']);
  });

  test('aux extrémités, rien ne bouge et aucune entrée d’historique n’est créée', () => {
    const { editor } = four();
    editor.moveLayers(['d'], 'up');
    editor.moveLayers(['a'], 'down');
    expect(editor.state().canUndo).toBe(false);
  });

  test('les effets ne passent jamais au-dessus du branding, ni le branding sous un effet', () => {
    const { editor, ids } = setup([effect('a'), effect('b'), branding()]);
    editor.moveLayers(['b'], 'top');
    expect(ids()).toEqual(['a', 'b', 'branding']);
    editor.moveLayers(['branding'], 'bottom');
    expect(ids()).toEqual(['a', 'b', 'branding']);
    expect(editor.moveLayers(['a', 'branding'], 'up')).toMatchObject({ ok: false, reason: 'invalid' });
  });
});

describe('régler', () => {
  test('visible, verrou, nom et opacité ; un nom vide retire le nom ; déverrouiller retire la propriété', () => {
    const { editor } = setup();
    editor.setLayers(['a'], { name: '  Fond  ', locked: true, visible: false, opacity: 0.3 });
    expect(editor.state().scene.layers[0]).toMatchObject({ name: 'Fond', locked: true, visible: false, opacity: 0.3 });
    editor.setLayers(['a'], { name: ' ', locked: false });
    const layer = editor.state().scene.layers[0];
    expect('name' in layer).toBe(false);
    expect('locked' in layer).toBe(false);
  });

  test('l’opacité est ramenée dans [0, 1] ; une clé inconnue est refusée', () => {
    const { editor } = setup();
    editor.setLayers(['a'], { opacity: 4 });
    expect(editor.state().scene.layers[0].opacity).toBe(1);
    expect(editor.setLayers(['a'], /** @type {*} */ ({ kind: 'rain' }))).toMatchObject({ ok: false, reason: 'invalid' });
  });

  test('plusieurs couches en une seule entrée d’historique', () => {
    const { editor } = setup();
    editor.setLayers(['a', 'b'], { visible: false });
    expect(editor.state().scene.layers.every((layer) => !layer.visible)).toBe(true);
    editor.undo();
    expect(editor.state().scene.layers.every((layer) => layer.visible)).toBe(true);
    expect(editor.state().canUndo).toBe(false);
  });

  test('un changement sans effet n’écrit rien dans l’historique', () => {
    const { editor } = setup();
    editor.setLayers(['a'], { visible: true });
    editor.setPlacement(['a'], { x: 0 });
    expect(editor.state().canUndo).toBe(false);
  });

  test('placement : fusion partielle, bornes imposées, largeur nulle refusée par la canonisation', () => {
    const { editor } = setup();
    editor.setPlacement(['a'], { x: 0.25, width: 0.5 });
    expect(editor.state().scene.layers[0].placement).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
    editor.setPlacement(['a'], { width: 0 });
    expect(editor.state().scene.layers[0].placement.width).toBe(0.001);
    expect(editor.setPlacement(['a'], /** @type {*} */ ({ rotation: 5 }))).toMatchObject({ ok: false, reason: 'invalid' });
    expect(editor.setPlacement(['a'], { x: Number.NaN })).toMatchObject({ ok: false, reason: 'invalid' });
  });

  test('setPlacements : un placement par couche en une seule entrée', () => {
    const { editor } = setup();
    editor.setPlacements({ a: { x: 0.1 }, b: { x: 0.6 } }, { label: 'Aligner' });
    expect(editor.state().scene.layers.map((layer) => layer.placement.x)).toEqual([0.1, 0.6]);
    expect(editor.state().undoLabel).toBe('Aligner');
    editor.undo();
    expect(editor.state().scene.layers.map((layer) => layer.placement.x)).toEqual([0, 0]);
  });

  test('options : fusion, valeurs bornées par le type d’effet, option inconnue ou fausse refusée', () => {
    const { editor } = setup([effect('b', 'bubble')]);
    editor.setOptions('b', { count: 9999 });
    expect(editor.state().scene.layers[0].options.count).toBe(200);
    expect(editor.setOptions('b', { count: 'beaucoup' })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(editor.setOptions('absent', { count: 3 })).toMatchObject({ ok: false, reason: 'unknown' });
  });

  test('insertLayers : identifiants neufs, au-dessus de la sélection, sélectionnées ; le verrou ne suit pas', () => {
    const { editor, ids } = setup([effect('a'), effect('b', 'bubble')]);
    editor.select(['a']);
    const result = editor.insertLayers([effect('a', 'rain', { name: 'Pluie', locked: true, options: { speed: 4 } }), effect('b', 'bubble')]);
    expect(result).toEqual({ ok: true, ids: ['a-2', 'b-2'] });
    expect(ids()).toEqual(['a', 'a-2', 'b-2', 'b']);
    expect(editor.state().selection).toEqual(['a-2', 'b-2']);
    const pasted = editor.state().scene.layers[1];
    expect(pasted).toMatchObject({ name: 'Pluie', options: { speed: 4 } });
    expect('locked' in pasted).toBe(false);
    expect(editor.state().undoLabel).toBe('Coller 2 couches');
    editor.undo();
    expect(ids()).toEqual(['a', 'b']);
  });

  test('insertLayers : tout ou rien — limite de couches, branding déjà présent, liste vide', () => {
    const { editor, ids } = setup(Array.from({ length: 7 }, (_, i) => effect(`l${i}`)));
    expect(editor.insertLayers([effect('x'), effect('y')])).toMatchObject({ ok: false, reason: 'limit' });
    expect(ids()).toHaveLength(7);
    const withBranding = setup([effect('a'), branding()]).editor;
    expect(withBranding.insertLayers([branding()])).toMatchObject({ ok: false, reason: 'unique' });
    expect(withBranding.insertLayers([])).toMatchObject({ ok: false, reason: 'empty' });
    expect(withBranding.state().canUndo).toBe(false);
  });

  test('insertLayers : un branding collé reste au sommet, au-dessus des effets', () => {
    const { editor, ids } = setup([effect('a')]);
    editor.insertLayers([branding(), effect('b')]);
    expect(ids()).toEqual(['a', 'b', 'branding']);
  });

  test('applyStyle : l’opacité à toutes, les réglages seulement aux couches du même type, en une entrée', () => {
    const { editor } = setup([effect('a', 'rain', { options: { speed: 1 } }), effect('b', 'bubble', { options: { count: 5 } }), effect('c', 'rain')]);
    expect(editor.applyStyle(['a', 'b', 'c'], { kind: 'rain', opacity: 0.4, options: { speed: 3 } }).ok).toBe(true);
    const [a, b, c] = editor.state().scene.layers;
    expect(a).toMatchObject({ opacity: 0.4, options: { speed: 3 } });
    expect(b).toMatchObject({ opacity: 0.4, options: { count: 5 } });
    expect(c).toMatchObject({ opacity: 0.4, options: { speed: 3 } });
    expect(editor.state().undoLabel).toBe('Coller le style sur 3 couches');
    editor.undo();
    expect(editor.state().canUndo).toBe(false);
    expect(editor.applyStyle(['absent'], { kind: 'rain', opacity: 1, options: {} })).toMatchObject({ ok: false, reason: 'unknown' });
  });

  test('réinitialiser remet plein cadre et opaque, garde le reste, en une seule entrée ; rien à faire si déjà neutre', () => {
    const { editor } = setup([effect('a', 'rain', { opacity: 0.3, name: 'Fond', locked: true, options: { speed: 3 }, placement: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 } }), effect('b', 'bubble')]);
    expect(editor.resetLayers(['a', 'b']).ok).toBe(true);
    expect(editor.state().scene.layers[0]).toMatchObject({ opacity: 1, name: 'Fond', locked: true, options: { speed: 3 }, placement: { x: 0, y: 0, width: 1, height: 1 } });
    expect(editor.state().undoLabel).toBe('Réinitialiser 2 couches');
    editor.undo();
    expect(editor.state().scene.layers[0]).toMatchObject({ opacity: 0.3, placement: { x: 0.2 } });
    expect(editor.state().canUndo).toBe(false);
    editor.resetLayers(['b']);
    expect(editor.state().canUndo).toBe(false);
    expect(editor.resetLayers(['absent'])).toMatchObject({ ok: false, reason: 'unknown' });
  });

  test('changer l’effet garde placement, opacité, visibilité, verrou et place ; les options repartent de celles fournies', () => {
    const { editor, ids } = setup([effect('a', 'rain', { opacity: 0.4, locked: true, visible: false, options: { speed: 3 }, placement: { x: 0.2, y: 0.1, width: 0.5, height: 0.5 } }), effect('b', 'bubble')]);
    expect(editor.setLayerKind('a', 'dotgrid', { spacing: 40 }).ok).toBe(true);
    expect(editor.state().scene.layers[0]).toMatchObject({ id: 'a', kind: 'dotgrid', opacity: 0.4, locked: true, visible: false, options: { spacing: 40 }, placement: { x: 0.2, y: 0.1, width: 0.5, height: 0.5 } });
    expect(ids()).toEqual(['a', 'b']);
    editor.undo();
    expect(editor.state().scene.layers[0]).toMatchObject({ kind: 'rain', options: { speed: 3 } });
  });

  test('changer l’effet vers le même type, un type inconnu, une couche d’identité ou depuis une couche inconnue', () => {
    const { editor } = setup([effect('a'), branding()]);
    expect(editor.setLayerKind('a', 'rain').ok).toBe(true);
    expect(editor.state().canUndo).toBe(false);
    expect(editor.setLayerKind('a', 'inconnu')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(editor.setLayerKind('a', 'branding')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(editor.setLayerKind('absent', 'rain')).toMatchObject({ ok: false, reason: 'unknown' });
  });

  test('propriétés de la scène : nom, étiquettes, transition ; undefined retire ; transition fausse refusée', () => {
    const { editor } = setup();
    editor.setSceneProps({ name: 'Soir', tags: ['calme'], transition: { type: 'fade', durationMs: 300 } });
    expect(editor.state().scene).toMatchObject({ name: 'Soir', tags: ['calme'], transition: { type: 'fade', durationMs: 300 } });
    editor.setSceneProps({ tags: undefined, transition: undefined });
    expect('tags' in editor.state().scene).toBe(false);
    expect('transition' in editor.state().scene).toBe(false);
    expect(editor.setSceneProps({ transition: /** @type {*} */ ({ type: 'spin' }) })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(editor.setSceneProps({ name: ' ' })).toMatchObject({ ok: false, reason: 'invalid' });
  });
});

describe('annuler et rétablir', () => {
  test('annuler restaure scène et sélection d’avant ; rétablir les rejoue ; une nouvelle commande vide le rétablissement', () => {
    const { editor, ids } = setup();
    editor.select(['b']);
    editor.addLayer({ kind: 'rain' });
    expect(editor.state().selection).toEqual(['rain']);
    editor.undo();
    expect(ids()).toEqual(['a', 'b']);
    expect(editor.state().selection).toEqual(['b']);
    expect(editor.state().canRedo).toBe(true);
    editor.redo();
    expect(ids()).toEqual(['a', 'b', 'rain']);
    editor.undo();
    editor.removeLayers(['a']);
    expect(editor.state().canRedo).toBe(false);
    expect(editor.redo()).toMatchObject({ ok: false, reason: 'empty' });
  });

  test('rien à annuler : refus propre', () => {
    const { editor } = setup();
    expect(editor.undo()).toMatchObject({ ok: false, reason: 'empty' });
  });

  test('les libellés disent quoi annuler et quoi rétablir', () => {
    const { editor } = setup();
    editor.addLayer({ kind: 'rain' });
    expect(editor.state().undoLabel).toBe('Ajouter une couche');
    editor.undo();
    expect(editor.state()).toMatchObject({ undoLabel: null, redoLabel: 'Ajouter une couche' });
  });

  test('l’historique est borné : les plus anciennes entrées sortent', () => {
    const { editor } = setup([effect('a')], { historyLimit: 3 });
    for (let i = 0; i < 6; i += 1) editor.setLayers(['a'], { opacity: i / 10 });
    let undone = 0;
    while (editor.undo().ok) undone += 1;
    expect(undone).toBe(3);
  });

  test('un glissement (même clé, rapproché) forme une seule entrée ; une pause ou une autre clé en ouvre une nouvelle', () => {
    const { editor, tick } = setup();
    for (let i = 1; i <= 10; i += 1) {
      editor.setPlacement(['a'], { x: i / 20 }, { coalesceKey: 'drag' });
      tick(50);
    }
    editor.undo();
    expect(editor.state().scene.layers[0].placement.x).toBe(0);
    expect(editor.state().canUndo).toBe(false);

    editor.redo();
    tick(5000);
    editor.setPlacement(['a'], { x: 0.9 }, { coalesceKey: 'drag' });
    editor.undo();
    expect(editor.state().scene.layers[0].placement.x).toBe(0.5);

    editor.setLayers(['a'], { opacity: 0.5 }, { coalesceKey: 'opacity' });
    editor.setLayers(['a'], { opacity: 0.4 }, { coalesceKey: 'autre' });
    editor.undo();
    expect(editor.state().scene.layers[0].opacity).toBe(0.5);
  });

  test('une pause plus longue que le délai ouvre une nouvelle entrée, même avec la même clé', () => {
    const { editor, tick } = setup();
    editor.setPlacement(['a'], { x: 0.1 }, { coalesceKey: 'drag' });
    tick(5000);
    editor.setPlacement(['a'], { x: 0.9 }, { coalesceKey: 'drag' });
    editor.undo();
    expect(editor.state().scene.layers[0].placement.x).toBe(0.1);
  });

  test('sans clé, deux réglages identiques de suite restent deux entrées', () => {
    const { editor } = setup();
    editor.setLayers(['a'], { opacity: 0.5 });
    editor.setLayers(['a'], { opacity: 0.4 });
    editor.undo();
    expect(editor.state().scene.layers[0].opacity).toBe(0.5);
  });

  test('annuler une suppression rend la sélection aux couches qui existent encore', () => {
    const { editor } = setup();
    editor.select(['a', 'b']);
    editor.removeLayers(['a']);
    editor.undo();
    expect(editor.state().selection).toEqual(['a', 'b']);
  });
});

describe('sélection et solo', () => {
  test('remplacer, ajouter, basculer ; les identifiants inconnus sont ignorés ; ordre = ordre des couches', () => {
    const { editor } = setup([effect('a'), effect('b'), effect('c')]);
    editor.select(['c', 'a']);
    expect(editor.state().selection).toEqual(['a', 'c']);
    editor.select(['b'], 'add');
    expect(editor.state().selection).toEqual(['a', 'b', 'c']);
    editor.select(['a', 'inconnu'], 'toggle');
    expect(editor.state().selection).toEqual(['b', 'c']);
    editor.selectAll();
    expect(editor.state().selection).toEqual(['a', 'b', 'c']);
    editor.clearSelection();
    expect(editor.state().selection).toEqual([]);
  });

  test('sélectionner n’est pas une entrée d’historique et ne notifie pas quand rien ne change', () => {
    const { editor } = setup();
    let count = 0;
    editor.subscribe(() => { count += 1; });
    editor.select(['a']);
    editor.select(['a']);
    expect(count).toBe(1);
    expect(editor.state().canUndo).toBe(false);
  });

  test('le solo est un état de vue : il n’écrit rien dans la scène ni dans l’historique, et tombe avec sa couche', () => {
    const { editor } = setup();
    editor.setSolo('a');
    expect(editor.state()).toMatchObject({ solo: 'a', dirty: false, canUndo: false });
    expect(viewScene(editor.state().scene, 'a').layers.map((layer) => layer.visible)).toEqual([true, false]);
    expect(editor.state().scene.layers.map((layer) => layer.visible)).toEqual([true, true]);
    editor.removeLayers(['a']);
    expect(editor.state().solo).toBeNull();
    expect(viewScene(editor.state().scene, null)).toBe(editor.state().scene);
    editor.setSolo('inconnu');
    expect(editor.state().solo).toBeNull();
  });
});

describe('garanties', () => {
  test('les scènes de l’historique ne sont jamais modifiées sur place', () => {
    const { editor } = setup();
    const before = editor.state().scene;
    const snapshot = JSON.stringify(before);
    editor.setPlacement(['a'], { x: 0.3 });
    editor.setOptions('b', { count: 10 });
    editor.removeLayers(['a']);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  test('après n’importe quelle suite de commandes, la scène détenue reste valide', () => {
    const { editor } = setup([]);
    const commands = [
      () => editor.addLayer({ kind: 'rain' }),
      () => editor.addLayer({ kind: 'bubble' }),
      () => editor.addLayer({ kind: 'branding' }),
      () => editor.moveLayers(editor.state().selection, 'bottom'),
      () => editor.duplicateLayers(editor.state().selection),
      () => editor.setLayers(editor.state().selection, { opacity: 7, locked: true }),
      () => editor.setPlacement(editor.state().selection, { width: -3, x: 99 }),
      () => editor.removeLayers(editor.state().selection.slice(0, 1)),
      () => editor.undo(),
      () => editor.redo(),
    ];
    for (let round = 0; round < 6; round += 1) {
      for (const run of commands) {
        run();
        expect(validateSceneDoc(editor.state().scene, { allowEmpty: true }).ok).toBe(true);
      }
    }
  });

  test('uniqueLayerId assainit la base et suffixe en cas de collision', () => {
    expect(uniqueLayerId(scene([]), 'Mon effet !')).toBe('Mon-effet');
    expect(uniqueLayerId(scene([effect('a'), effect('a-2')]), 'a')).toBe('a-3');
  });
});
