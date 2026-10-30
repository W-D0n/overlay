import { describe, expect, test } from 'bun:test';
import { SETTINGS_LIMITS, applySettingsPatch, emptyStudioSettings, normalizeStudioSettings, validateSettingsPatch, validateStudioSettings } from './studio-settings.js';

const command = (over = {}) => ({ id: 'custom.ma-macro', name: 'Ma macro', steps: ['edit.copy'], ...over });
const errorsOf = (raw) => { const result = validateStudioSettings(raw); return result.ok ? [] : result.errors; };

describe('validateStudioSettings', () => {
  test('absent, vide ou complet : valide', () => {
    expect(validateStudioSettings(undefined).ok).toBe(true);
    expect(validateStudioSettings({}).ok).toBe(true);
    expect(validateStudioSettings({ customCommands: [command(), command({ id: 'custom.b', shortcut: 'Ctrl+Maj+K' })], preferences: { 'view.grid': true, 'placement.unit': 'pixel', zoom: 1.5 } }).ok).toBe(true);
  });

  test('refuse ce qui n’est pas un objet, des commandes qui ne sont pas un tableau, des préférences qui ne sont pas un objet', () => {
    expect(errorsOf(3)).toEqual(['studio : objet attendu']);
    expect(errorsOf({ customCommands: {} })).toEqual(['customCommands : tableau attendu']);
    expect(errorsOf({ preferences: [] })).toEqual(['preferences : objet attendu']);
  });

  test('commande : identifiant « custom.… » unique, nom borné, étapes 1 à 30, raccourci texte', () => {
    expect(errorsOf({ customCommands: [command({ id: 'autre' })] })[0]).toContain('identifiant « custom.… »');
    expect(errorsOf({ customCommands: [command(), command()] })[0]).toContain('en double');
    expect(errorsOf({ customCommands: [command({ name: ' ' })] })[0]).toContain('name');
    expect(errorsOf({ customCommands: [command({ name: 'x'.repeat(SETTINGS_LIMITS.nameLength + 1) })] })[0]).toContain('name');
    expect(errorsOf({ customCommands: [command({ steps: [] })] })[0]).toContain('steps');
    expect(errorsOf({ customCommands: [command({ steps: Array(SETTINGS_LIMITS.steps + 1).fill('a') })] })[0]).toContain('steps');
    expect(errorsOf({ customCommands: [command({ shortcut: 3 })] })[0]).toContain('shortcut');
  });

  test('étapes : un identifiant de commande, ou une opération { op, args } ; le reste est refusé', () => {
    expect(validateStudioSettings({ customCommands: [command({ steps: ['edit.copy', { op: 'setPlacements', args: { patch: { x: 0.1 } }, target: 'selection' }] })] }).ok).toBe(true);
    expect(errorsOf({ customCommands: [command({ steps: [42] })] })[0]).toContain('texte ou objet');
    expect(errorsOf({ customCommands: [command({ steps: [{ op: '', args: {} }] })] })[0]).toContain('.op');
    expect(errorsOf({ customCommands: [command({ steps: [{ op: 'x', args: 'non' }] })] })[0]).toContain('.args');
    expect(errorsOf({ customCommands: [command({ steps: [{ op: 'x', args: { big: 'y'.repeat(SETTINGS_LIMITS.stepBytes) } }] })] }).some((e) => e.includes('volumineuse'))).toBe(true);
  });

  test('trop de commandes est refusé', () => {
    const many = Array.from({ length: SETTINGS_LIMITS.commands + 1 }, (_, i) => command({ id: `custom.c${i}` }));
    expect(errorsOf({ customCommands: many })[0]).toContain('commandes au plus');
  });

  test('préférences : nom sûr, valeur texte, nombre fini ou booléen, bornées', () => {
    expect(errorsOf({ preferences: { 'bad key': 1 } })[0]).toContain('nom invalide');
    expect(errorsOf({ preferences: { __proto__x: 1, ok: { a: 1 } } }).some((e) => e.includes('texte, nombre ou booléen'))).toBe(true);
    expect(errorsOf({ preferences: { n: Number.NaN } })[0]).toContain('texte, nombre ou booléen');
    expect(errorsOf({ preferences: { long: 'x'.repeat(SETTINGS_LIMITS.preferenceValueLength + 1) } })[0]).toContain('trop longue');
    const many = Object.fromEntries(Array.from({ length: SETTINGS_LIMITS.preferences + 1 }, (_, i) => [`k${i}`, i]));
    expect(errorsOf({ preferences: many })[0]).toContain('réglages au plus');
  });
});

describe('modèles de couches', () => {
  const layer = (over = {}) => ({ id: 'rain', kind: 'rain', visible: true, opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 }, options: {}, ...over });
  const template = (over = {}) => ({ id: 'tpl.pluie', name: 'Pluie', layers: [layer()], ...over });

  test('un modèle valide passe ; l’identifiant « tpl.… » est obligatoire et unique', () => {
    expect(validateStudioSettings({ templates: [template()] }).ok).toBe(true);
    expect(errorsOf({ templates: [template({ id: 'pluie' })] })[0]).toContain('tpl.');
    expect(errorsOf({ templates: [template(), template()] })[0]).toContain('en double');
  });

  test('nom, nombre de couches, couches invalides et taille sont bornés', () => {
    expect(errorsOf({ templates: [template({ name: ' ' })] })[0]).toContain('name');
    expect(errorsOf({ templates: [template({ layers: [] })] })[0]).toContain('couches');
    expect(errorsOf({ templates: [template({ layers: [layer({ kind: 'inconnu' })] })] }).length).toBeGreaterThan(0);
    expect(errorsOf({ templates: [template({ layers: [layer({ opacity: 'x' })] })] }).length).toBeGreaterThan(0);
    expect(errorsOf({ templates: [template({ layers: [layer({ options: { big: 'x'.repeat(SETTINGS_LIMITS.templateBytes) } })] })] })[0]).toContain('volumineux');
    expect(errorsOf({ templates: 'non' })).toEqual(['templates : tableau attendu']);
    const many = Array.from({ length: SETTINGS_LIMITS.templates + 1 }, (_, i) => template({ id: `tpl.m${i}` }));
    expect(errorsOf({ templates: many })[0]).toContain('modèles au plus');
  });

  test('un patch remplace les modèles en bloc et laisse le reste', () => {
    const current = { customCommands: [command()], preferences: { a: 1 }, templates: [template()] };
    expect(applySettingsPatch(current, { templates: [] })).toEqual({ ...current, templates: [] });
    expect(applySettingsPatch(current, { preferences: { b: 2 } }).templates).toEqual(current.templates);
    expect(validateSettingsPatch({ templates: [template({ id: 'x' })] }).ok).toBe(false);
  });
});

describe('normalisation et changements', () => {
  test('normalizeStudioSettings complète les absents et copie en profondeur', () => {
    expect(normalizeStudioSettings(undefined)).toEqual(emptyStudioSettings());
    const raw = { customCommands: [command()], preferences: { a: 1 } };
    const normalized = normalizeStudioSettings(raw);
    expect(normalized).toEqual({ ...raw, templates: [] });
    normalized.customCommands[0].name = 'changé';
    expect(raw.customCommands[0].name).toBe('Ma macro');
  });

  test('applySettingsPatch : commandes remplacées en bloc, préférences fusionnées, null retire une clé', () => {
    const current = { customCommands: [command()], preferences: { a: 1, b: 2 } };
    expect(applySettingsPatch(current, { preferences: { b: null, c: 'x' } })).toEqual({ customCommands: [command()], preferences: { a: 1, c: 'x' } });
    expect(applySettingsPatch(current, { customCommands: [] })).toEqual({ customCommands: [], preferences: { a: 1, b: 2 } });
    expect(applySettingsPatch(current, {})).toEqual(current);
    expect(current.preferences).toEqual({ a: 1, b: 2 });
  });

  test('validateSettingsPatch accepte null pour retirer une préférence, refuse le reste comme validateStudioSettings', () => {
    expect(validateSettingsPatch({ preferences: { a: null, b: 1 } }).ok).toBe(true);
    expect(validateSettingsPatch({ preferences: { a: {} } }).ok).toBe(false);
    expect(validateSettingsPatch([]).ok).toBe(false);
    expect(validateSettingsPatch({ customCommands: [command({ id: 'x' })] }).ok).toBe(false);
  });
});
