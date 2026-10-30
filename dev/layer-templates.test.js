import { describe, expect, test } from 'bun:test';
import { createLayer } from '../scene-doc.js';
import { createTemplate, describeTemplate, templateNameError, uniqueTemplateId } from './layer-templates.js';
import { createSceneEditor } from './scene-editor.js';
import { validateStudioSettings } from './studio-settings.js';

const rain = createLayer({ id: 'rain', kind: 'rain', name: 'Averse', opacity: 0.6, locked: true });
const bubble = createLayer({ id: 'bubble', kind: 'bubble' });

describe('createTemplate', () => {
  test('garde réglages, opacité, nom et placement ; pas le verrou ; ne partage rien avec la scène', () => {
    const result = createTemplate('  Pluie douce ', [rain, bubble], []);
    expect(result.ok).toBe(true);
    expect(result.template.id).toBe('tpl.pluie-douce');
    expect(result.template.name).toBe('Pluie douce');
    expect(result.template.layers[0]).toMatchObject({ id: 'rain', name: 'Averse', opacity: 0.6 });
    expect('locked' in result.template.layers[0]).toBe(false);
    result.template.layers[0].opacity = 0.1;
    expect(rain.opacity).toBe(0.6);
  });

  test('le modèle produit est valide pour le serveur', () => {
    const result = createTemplate('Pluie', [rain, bubble], []);
    expect(validateStudioSettings({ templates: [result.template] }).ok).toBe(true);
  });

  test('refuse une sélection vide, un nom vide, trop long ou déjà pris (sans tenir compte de la casse)', () => {
    expect(createTemplate('A', [], [])).toEqual({ ok: false, error: 'sélectionnez au moins une couche' });
    expect(createTemplate(' ', [rain], []).error).toContain('obligatoire');
    expect(createTemplate('x'.repeat(41), [rain], []).error).toContain('dépasse');
    const existing = createTemplate('Pluie', [rain], []).template;
    expect(createTemplate('PLUIE', [rain], [existing]).error).toContain('déjà');
  });

  test('l’identifiant reste unique même si deux noms donnent le même', () => {
    expect(uniqueTemplateId('Été !', ['tpl.ete'])).toBe('tpl.ete-2');
    expect(uniqueTemplateId('Été !', ['tpl.ete', 'tpl.ete-2'])).toBe('tpl.ete-3');
  });

  test('renommer : son propre nom n’est pas un conflit', () => {
    const existing = createTemplate('Pluie', [rain], []).template;
    expect(templateNameError('Pluie', [existing], existing.id)).toBeNull();
    expect(templateNameError('Pluie', [existing], null)).toContain('déjà');
  });
});

describe('describeTemplate', () => {
  test('compte et nomme les couches', () => {
    const { template } = createTemplate('P', [rain, bubble], []);
    expect(describeTemplate(template, (kind) => `Effet ${kind}`)).toBe('2 couches : Averse, Effet bubble');
    expect(describeTemplate(createTemplate('Q', [bubble], []).template, (k) => k)).toBe('1 couche : bubble');
  });
});

describe('insertion dans une scène', () => {
  test('un modèle s’insère en un seul geste annulable, avec des identifiants neufs, dans une autre scène', () => {
    const { template } = createTemplate('Pluie', [rain, bubble], []);
    const editor = createSceneEditor({ scene: { version: 1, id: 'autre', name: 'Autre', layers: [createLayer({ id: 'rain', kind: 'rain' })] } });
    const result = editor.insertLayers(template.layers, 'Insérer le modèle « Pluie »');
    expect(result.ok).toBe(true);
    expect(editor.state().scene.layers).toHaveLength(3);
    expect(new Set(editor.state().scene.layers.map((l) => l.id)).size).toBe(3);
    expect(editor.state().undoLabel).toBe('Insérer le modèle « Pluie »');
    editor.undo();
    expect(editor.state().scene.layers).toHaveLength(1);
  });
});
