import { describe, expect, test } from 'bun:test';
import { createCommandRegistry, fold, scoreCommand, shortcutMatches } from './command-registry.js';

const command = (id, label, over = {}) => ({ id, label, group: 'Édition', run: () => {}, ...over });

describe('fold et scoreCommand', () => {
  test('fold ignore casse et accents', () => {
    expect(fold('Éclair À')).toBe('eclair a');
    expect(fold(null)).toBe('');
  });

  test('une requête vide convient à tout ; un mot absent exclut la commande', () => {
    expect(scoreCommand(command('a', 'Dupliquer'), '')).toBe(0);
    expect(scoreCommand(command('a', 'Dupliquer'), 'zzz')).toBeNull();
  });

  test('chaque mot doit se retrouver (libellé, groupe ou mots-clés)', () => {
    const c = command('a', 'Aligner à gauche', { group: 'Position', keywords: ['left'] });
    expect(scoreCommand(c, 'aligner gauche')).not.toBeNull();
    expect(scoreCommand(c, 'position')).not.toBeNull();
    expect(scoreCommand(c, 'left')).not.toBeNull();
    expect(scoreCommand(c, 'aligner droite')).toBeNull();
  });

  test('début de libellé > début de mot > milieu de mot > groupe ou mots-clés', () => {
    const start = scoreCommand(command('a', 'Dupliquer la couche'), 'dup');
    const word = scoreCommand(command('b', 'Couche dupliquée'), 'dup');
    const middle = scoreCommand(command('c', 'Réduplication'), 'dup');
    const keyword = scoreCommand(command('d', 'Copier', { keywords: ['dupliquer'] }), 'dup');
    expect(start).toBeLessThan(word);
    expect(word).toBeLessThan(middle);
    expect(middle).toBeLessThan(keyword);
  });
});

describe('registre', () => {
  test('enregistrer, retrouver, exécuter ; un doublon d’identifiant est refusé', () => {
    const registry = createCommandRegistry();
    const calls = [];
    registry.register(command('undo', 'Annuler', { run: () => calls.push('undo') }));
    expect(registry.has('undo')).toBe(true);
    expect(registry.run('undo')).toBe(true);
    expect(calls).toEqual(['undo']);
    expect(() => registry.register(command('undo', 'Autre'))).toThrow('déjà enregistrée');
  });

  test('une commande désactivée ne s’exécute pas ; une commande inconnue non plus', () => {
    const registry = createCommandRegistry();
    let on = false;
    const calls = [];
    registry.register(command('x', 'X', { enabled: () => on, run: () => calls.push('x') }));
    expect(registry.run('x')).toBe(false);
    expect(registry.isEnabled('x')).toBe(false);
    on = true;
    expect(registry.run('x')).toBe(true);
    expect(registry.run('inconnue')).toBe(false);
    expect(registry.isEnabled('inconnue')).toBe(false);
    expect(calls).toEqual(['x']);
  });

  test('list rend l’état d’activation à l’instant de l’appel', () => {
    const registry = createCommandRegistry();
    let on = false;
    registry.register(command('x', 'X', { enabled: () => on }));
    expect(registry.list()[0].enabled).toBe(false);
    on = true;
    expect(registry.list()[0].enabled).toBe(true);
  });

  test('search : meilleurs résultats d’abord, désactivées après les activées, ordre d’enregistrement à égalité', () => {
    const registry = createCommandRegistry();
    registry.registerAll([
      command('b', 'Supprimer une couche'),
      command('a', 'Supprimer', { enabled: () => false }),
      command('c', 'Annuler la suppression'),
      command('d', 'Supprimer tout'),
    ]);
    expect(registry.search('suppr').map((c) => c.id)).toEqual(['d', 'b', 'c', 'a']);
    expect(registry.search('').map((c) => c.id)).toEqual(['b', 'c', 'd', 'a']);
    expect(registry.search('introuvable')).toEqual([]);
  });

  test('shortcuts : seules les commandes qui en ont un, regroupées', () => {
    const registry = createCommandRegistry();
    registry.registerAll([
      command('a', 'Annuler', { shortcut: 'Ctrl+Z' }),
      command('b', 'Rétablir', { shortcut: 'Ctrl+Maj+Z' }),
      command('c', 'Sans raccourci'),
      command('d', 'Zoomer', { group: 'Vue', shortcut: '+' }),
    ]);
    expect(registry.shortcuts()).toEqual([
      { group: 'Édition', items: [{ label: 'Annuler', shortcut: 'Ctrl+Z' }, { label: 'Rétablir', shortcut: 'Ctrl+Maj+Z' }] },
      { group: 'Vue', items: [{ label: 'Zoomer', shortcut: '+' }] },
    ]);
  });
});

describe('shortcutMatches', () => {
  const key = (k, over = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...over });

  test('lettre avec Ctrl (ou Cmd) ; les modificateurs doivent correspondre exactement', () => {
    expect(shortcutMatches('Ctrl+Z', key('z', { ctrlKey: true }))).toBe(true);
    expect(shortcutMatches('Ctrl+Z', key('z', { metaKey: true }))).toBe(true);
    expect(shortcutMatches('Ctrl+Z', key('Z', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(shortcutMatches('Ctrl+Maj+Z', key('Z', { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(shortcutMatches('Ctrl+Z', key('z'))).toBe(false);
    expect(shortcutMatches('Ctrl+Z', key('z', { ctrlKey: true, altKey: true }))).toBe(false);
  });

  test('touches nommées en français ou en anglais', () => {
    expect(shortcutMatches('Suppr', key('Delete'))).toBe(true);
    expect(shortcutMatches('Ctrl+Entrée', key('Enter', { ctrlKey: true }))).toBe(true);
    expect(shortcutMatches('Échap', key('Escape'))).toBe(true);
    expect(shortcutMatches('Alt+ArrowUp', key('ArrowUp', { altKey: true }))).toBe(true);
    expect(shortcutMatches('Suppr', key('Backspace'))).toBe(false);
  });

  test('un symbole obtenu avec Maj (« ? », « + ») ne demande pas Maj dans le raccourci', () => {
    expect(shortcutMatches('?', key('?', { shiftKey: true }))).toBe(true);
    expect(shortcutMatches('+', key('+', { shiftKey: true }))).toBe(true);
    expect(shortcutMatches('Ctrl+]', key(']', { ctrlKey: true }))).toBe(true);
    expect(shortcutMatches('0', key('0'))).toBe(true);
    expect(shortcutMatches('0', key('0', { shiftKey: true }))).toBe(false);
  });

  test('un raccourci mal écrit ne correspond à rien', () => {
    expect(shortcutMatches('Hyper+Z', key('z'))).toBe(false);
  });

  test('forEvent trouve la commande liée, ignore celles déclarées gérées ailleurs', () => {
    const registry = createCommandRegistry();
    registry.registerAll([
      command('a', 'Copier', { shortcut: 'Ctrl+C' }),
      command('b', 'Annuler', { shortcut: 'Ctrl+Z', bind: false }),
    ]);
    expect(registry.forEvent(key('c', { ctrlKey: true }))?.id).toBe('a');
    expect(registry.forEvent(key('z', { ctrlKey: true }))).toBeNull();
    expect(registry.forEvent(key('q'))).toBeNull();
  });
});
