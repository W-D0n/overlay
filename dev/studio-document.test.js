import { describe, expect, test } from 'bun:test';
import { createLayer, sceneFromCurrent, sceneFromPreset } from '../scene-doc.js';
import { createStudioDocument } from './studio-document.js';

const onAir = () => sceneFromCurrent({ component: 'rain', options: { speed: 1 } });
const preset = (over = {}) => sceneFromPreset({ id: 'nuit', name: 'Nuit', component: 'bubble', options: { count: 5 }, tags: ['calme'], transition: { type: 'fade', durationMs: 500 }, ...over });
const kinds = (scene) => scene.layers.map((layer) => layer.kind);

describe('brouillon calculé', () => {
  test('au départ le document montre l’antenne : pas de brouillon', () => {
    const doc = createStudioDocument({ scene: onAir() });
    expect(doc.state()).toMatchObject({ isDraft: false, activePresetId: null, hasArrival: false });
    expect(kinds(doc.state().scene)).toEqual(['rain', 'branding']);
  });

  test('un réglage ouvre le brouillon ; le défaire (annulation) le referme', () => {
    const doc = createStudioDocument({ scene: onAir() });
    doc.editor.setOptions('main', { speed: 2 });
    expect(doc.state().isDraft).toBe(true);
    doc.editor.undo();
    expect(doc.state().isDraft).toBe(false);
  });

  test('revenir à la main à la même valeur referme aussi le brouillon', () => {
    const doc = createStudioDocument({ scene: onAir() });
    doc.editor.setOptions('main', { speed: 2 });
    doc.editor.setOptions('main', { speed: 1 });
    expect(doc.state().isDraft).toBe(false);
  });

  test('la transition seule, l’identité et les étiquettes ne font pas un brouillon', () => {
    const doc = createStudioDocument({ scene: onAir() });
    doc.editor.setSceneProps({ transition: { type: 'wipe', durationMs: 300 }, tags: ['x'], name: 'Autre' });
    expect(doc.state().isDraft).toBe(false);
  });

  test('ajouter, masquer, déplacer une couche sont des brouillons', () => {
    const doc = createStudioDocument({ scene: onAir() });
    doc.editor.addLayer({ kind: 'bubble' });
    expect(doc.state().isDraft).toBe(true);
    doc.editor.undo();
    doc.editor.setLayers(['main'], { visible: false });
    expect(doc.state().isDraft).toBe(true);
    doc.editor.undo();
    doc.editor.setPlacement(['main'], { x: 0.1 });
    expect(doc.state().isDraft).toBe(true);
  });

  test('l’état est stable entre deux lectures sans changement, et neuf après un changement', () => {
    const doc = createStudioDocument({ scene: onAir() });
    expect(doc.state()).toBe(doc.state());
    const before = doc.state();
    doc.editor.setOptions('main', { speed: 3 });
    expect(doc.state()).not.toBe(before);
  });
});

describe('ouvrir un preset', () => {
  test('essayé : brouillon avec arrivée, preset actif, historique d’édition neuf', () => {
    const doc = createStudioDocument({ scene: onAir() });
    doc.editor.setOptions('main', { speed: 2 });
    doc.open(preset(), 'nuit', true);
    expect(doc.state()).toMatchObject({ isDraft: true, hasArrival: true, activePresetId: 'nuit' });
    expect(doc.state().scene.id).toBe('nuit');
    expect(doc.editor.state().canUndo).toBe(false);
  });

  test('un preset dont les couches sont celles de l’antenne n’ouvre pas de brouillon', () => {
    const doc = createStudioDocument({ scene: onAir() });
    doc.open(sceneFromPreset({ id: 'pluie', name: 'Pluie', component: 'rain', options: { speed: 1 }, tags: ['x'] }), 'pluie', true);
    expect(doc.state().isDraft).toBe(false);
  });

  test('ouvert sans brouillon (réglage libre) : pas d’arrivée', () => {
    const doc = createStudioDocument({ scene: onAir() });
    doc.open(preset(), 'nuit', false);
    expect(doc.state().hasArrival).toBe(false);
  });
});

describe('publier', () => {
  test('la scène à envoyer porte l’identité de l’antenne, sans étiquettes ; la transition seulement après ouverture d’un preset', () => {
    const doc = createStudioDocument({ scene: onAir() });
    doc.open(preset(), 'nuit', true);
    const sent = doc.publishable();
    expect(sent).toMatchObject({ id: 'current', name: 'En antenne', transition: { type: 'fade', durationMs: 500 } });
    expect('tags' in sent).toBe(false);
    expect(kinds(sent)).toEqual(['bubble', 'branding']);

    doc.editor.setOptions('main', { count: 9 });
    expect(doc.publishable().transition).toBeDefined();
  });

  test('un simple réglage s’envoie sans transition (remplacement sec)', () => {
    const doc = createStudioDocument({ scene: sceneFromCurrent({ component: 'rain', options: {}, transition: { type: 'fade', durationMs: 400 } }) });
    doc.editor.setOptions('main', { speed: 2 });
    expect('transition' in doc.publishable()).toBe(false);
  });

  test('après la publication : plus de brouillon, plus d’arrivée, l’antenne est ce qui a été envoyé', () => {
    const doc = createStudioDocument({ scene: onAir() });
    doc.open(preset(), 'nuit', true);
    const sent = doc.publishable();
    doc.markPublished(sent);
    expect(doc.state()).toMatchObject({ isDraft: false, hasArrival: false, activePresetId: 'nuit' });
    expect(doc.state().onAir).toEqual(sent);
    expect(doc.editor.state().dirty).toBe(false);
  });
});

describe('antenne qui change', () => {
  test('hors brouillon, le document suit l’antenne', () => {
    const doc = createStudioDocument({ scene: onAir() });
    const adopted = doc.receive(sceneFromCurrent({ component: 'dotgrid', options: {} }));
    expect(adopted).toBe(true);
    expect(kinds(doc.state().scene)).toEqual(['dotgrid', 'branding']);
    expect(doc.state().isDraft).toBe(false);
  });

  test('pendant un brouillon, le brouillon est protégé et seule l’antenne mémorisée change', () => {
    const doc = createStudioDocument({ scene: onAir() });
    doc.editor.setOptions('main', { speed: 2 });
    const incoming = sceneFromCurrent({ component: 'dotgrid', options: {} });
    expect(doc.receive(incoming)).toBe(false);
    expect(doc.state().scene.layers[0].options.speed).toBe(2);
    expect(kinds(doc.state().onAir)).toEqual(['dotgrid', 'branding']);
    expect(doc.state().isDraft).toBe(true);
  });

  test('l’écho de sa propre publication ne recharge pas l’éditeur (l’historique d’édition survit)', () => {
    const doc = createStudioDocument({ scene: onAir() });
    doc.editor.setOptions('main', { speed: 2 });
    const sent = doc.publishable();
    doc.markPublished(sent);
    const before = doc.state().scene;
    doc.receive(sent);
    expect(doc.state().scene).toBe(before);
    expect(doc.editor.state().canUndo).toBe(true);
  });

  test('une antenne qui diffère d’un document propre le recharge et clôt l’arrivée', () => {
    const doc = createStudioDocument({ scene: onAir() });
    doc.open(preset(), 'nuit', false);
    doc.receive(sceneFromCurrent({ component: 'dotgrid', options: {} }));
    expect(doc.state().hasArrival).toBe(false);
  });
});

describe('abandonner et s’abonner', () => {
  test('discard remet la scène de l’antenne et ferme le brouillon', () => {
    const doc = createStudioDocument({ scene: onAir() });
    doc.open(preset(), 'nuit', true);
    doc.discard();
    expect(kinds(doc.state().scene)).toEqual(['rain', 'branding']);
    expect(doc.state()).toMatchObject({ isDraft: false, hasArrival: false });
  });

  test('un abonné est prévenu des commandes de l’éditeur comme des opérations du document, et se désabonne', () => {
    const doc = createStudioDocument({ scene: onAir() });
    const drafts = [];
    const off = doc.subscribe((state) => drafts.push(state.isDraft));
    doc.editor.setOptions('main', { speed: 2 });
    doc.discard();
    expect(drafts.at(0)).toBe(true);
    expect(drafts.at(-1)).toBe(false);
    off();
    const count = drafts.length;
    doc.editor.setOptions('main', { speed: 3 });
    expect(drafts).toHaveLength(count);
  });

  test('setActivePresetId prévient une seule fois, et pas si rien ne change', () => {
    const doc = createStudioDocument({ scene: onAir() });
    let count = 0;
    doc.subscribe(() => { count += 1; });
    doc.setActivePresetId('a');
    doc.setActivePresetId('a');
    expect(count).toBe(1);
  });

  test('une couche créée avec createLayer reste comparable par ses seules couches', () => {
    const doc = createStudioDocument({ scene: onAir() });
    doc.editor.addLayer({ kind: 'bubble' });
    doc.editor.removeLayers(['bubble']);
    expect(doc.state().isDraft).toBe(false);
    expect(createLayer({ id: 'x', kind: 'rain' }).visible).toBe(true);
  });
});
