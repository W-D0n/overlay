import { describe, expect, test } from 'bun:test';
import { createCommandRegistry } from './command-registry.js';
import {
  CUSTOM_GROUP, MAX_STEPS, NAME_MAX_LENGTH, checkShortcut, createCustomCommandStore, createMacroRecorder, isStepAllowed, parseCustomCommands,
  shortcutFromEvent, slugify, toCommand, uniqueCustomId, validateCustomCommand,
} from './custom-commands.js';

const KNOWN = new Set(['edit.copy', 'edit.paste', 'layer.top', 'position.align.left', 'edit.undo', 'help.palette', 'custom.autre']);
const ctx = (over = {}) => ({ knownIds: KNOWN, ...over });
const key = (k, over = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...over });

describe('shortcutFromEvent', () => {
  test('la notation du registre : Ctrl, Alt, Maj, touche en majuscule, noms français', () => {
    expect(shortcutFromEvent(key('k', { ctrlKey: true }))).toBe('Ctrl+K');
    expect(shortcutFromEvent(key('K', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Maj+K');
    expect(shortcutFromEvent(key('ArrowUp', { altKey: true }))).toBe('Alt+ArrowUp');
    expect(shortcutFromEvent(key('Delete', { ctrlKey: true }))).toBe('Ctrl+Suppr');
    expect(shortcutFromEvent(key(' ', { ctrlKey: true }))).toBe('Ctrl+Espace');
    expect(shortcutFromEvent(key('F6'))).toBe('F6');
  });

  test('un modificateur seul n’est pas un raccourci', () => {
    for (const k of ['Control', 'Shift', 'Alt', 'Meta']) expect(shortcutFromEvent(key(k, { ctrlKey: true }))).toBeNull();
  });
});

describe('checkShortcut', () => {
  test('accepte Ctrl+lettre, Alt+touche, touche de fonction', () => {
    expect(checkShortcut('Ctrl+Maj+K')).toBeNull();
    expect(checkShortcut('Alt+G')).toBeNull();
    expect(checkShortcut('F6')).toBeNull();
  });

  test('refuse une touche de saisie nue ou avec Maj seul : elle gênerait la frappe', () => {
    expect(checkShortcut('G')).toContain('Ctrl ou Alt');
    expect(checkShortcut('Maj+G')).toContain('Ctrl ou Alt');
  });

  test('refuse les combinaisons réservées du navigateur', () => {
    for (const reserved of ['Ctrl+T', 'Ctrl+W', 'Ctrl+R', 'Ctrl+1', 'Alt+F4', 'F5', 'F12']) expect(checkShortcut(reserved)).toContain('réservé');
  });

  test('refuse un raccourci déjà pris, sans tenir compte de la casse, en nommant le propriétaire', () => {
    const taken = new Map([['Ctrl+D', 'Dupliquer']]);
    expect(checkShortcut('ctrl+d', { taken })).toContain('Dupliquer');
    expect(checkShortcut('Ctrl+Maj+D', { taken })).toBeNull();
  });

  test('refuse un raccourci mal formé', () => {
    expect(checkShortcut('Super+K')).toContain('invalide');
    expect(checkShortcut('')).toBe('raccourci vide');
  });
});

describe('validateCustomCommand', () => {
  test('une définition valide : nom rogné, identifiant dérivé du nom, étapes conservées', () => {
    const result = validateCustomCommand({ name: '  Mise en page  ', steps: ['layer.top', 'position.align.left'], shortcut: 'Ctrl+Maj+M' }, ctx());
    expect(result).toEqual({ ok: true, command: { id: 'custom.mise-en-page', name: 'Mise en page', steps: ['layer.top', 'position.align.left'], shortcut: 'Ctrl+Maj+M' } });
  });

  test('l’identifiant d’une commande existante est conservé ; le raccourci est facultatif', () => {
    const result = validateCustomCommand({ id: 'custom.abc', name: 'Nouveau nom', steps: ['edit.copy'] }, ctx());
    expect(result.ok && result.command).toEqual({ id: 'custom.abc', name: 'Nouveau nom', steps: ['edit.copy'] });
  });

  test('nom obligatoire, borné, unique (sans casse) parmi les autres commandes', () => {
    expect(validateCustomCommand({ name: ' ', steps: ['edit.copy'] }, ctx()).errors).toContain('le nom est obligatoire');
    expect(validateCustomCommand({ name: 'x'.repeat(NAME_MAX_LENGTH + 1), steps: ['edit.copy'] }, ctx()).errors[0]).toContain('dépasse');
    const others = [{ id: 'custom.a', name: 'Ma macro', steps: ['edit.copy'] }];
    expect(validateCustomCommand({ name: 'MA MACRO', steps: ['edit.copy'] }, ctx({ others })).errors[0]).toContain('s\'appelle déjà');
    expect(validateCustomCommand({ id: 'custom.a', name: 'Ma macro', steps: ['edit.copy'] }, ctx({ others })).ok).toBe(true);
  });

  test('au moins une étape, pas plus de MAX_STEPS ; chaque étape existe', () => {
    expect(validateCustomCommand({ name: 'X', steps: [] }, ctx()).errors).toContain('au moins une étape est nécessaire');
    expect(validateCustomCommand({ name: 'X' }, ctx()).errors).toContain('au moins une étape est nécessaire');
    expect(validateCustomCommand({ name: 'X', steps: Array(MAX_STEPS + 1).fill('edit.copy') }, ctx()).errors[0]).toContain('étapes au plus');
    expect(validateCustomCommand({ name: 'X', steps: ['edit.copy', 'inconnue'] }, ctx()).errors).toContain('étape inconnue : inconnue');
  });

  test('pas de récursion ni d’étape sans sens : commandes personnalisées, fenêtres, annuler / rétablir', () => {
    for (const forbidden of ['custom.autre', 'help.palette', 'edit.undo']) {
      expect(validateCustomCommand({ name: 'X', steps: [forbidden] }, ctx()).errors[0]).toContain('non autorisée');
    }
    expect(isStepAllowed('edit.copy')).toBe(true);
    expect(isStepAllowed('custom.x')).toBe(false);
    expect(isStepAllowed('commands.record')).toBe(false);
  });

  test('le raccourci est contrôlé : réservé, conflit avec une autre commande', () => {
    expect(validateCustomCommand({ name: 'X', steps: ['edit.copy'], shortcut: 'Ctrl+T' }, ctx()).errors[0]).toContain('réservé');
    const taken = new Map([['Ctrl+C', 'Copier les couches']]);
    expect(validateCustomCommand({ name: 'X', steps: ['edit.copy'], shortcut: 'Ctrl+C' }, ctx({ taken })).errors[0]).toContain('Copier les couches');
  });

  test('toutes les erreurs sont rendues ensemble ; une entrée qui n’est pas un objet est refusée', () => {
    const result = validateCustomCommand({ name: '', steps: [], shortcut: 'G' }, ctx());
    expect(result.errors.length).toBe(3);
    expect(validateCustomCommand(null, ctx()).ok).toBe(false);
    expect(validateCustomCommand([], ctx()).ok).toBe(false);
  });
});

describe('identifiants', () => {
  test('slugify ignore accents et ponctuation ; uniqueCustomId suffixe les collisions', () => {
    expect(slugify('Mise en page — été !')).toBe('mise-en-page-ete');
    expect(slugify('!!!')).toBe('commande');
    expect(uniqueCustomId('Ma macro', [])).toBe('custom.ma-macro');
    expect(uniqueCustomId('Ma macro', ['custom.ma-macro', 'custom.ma-macro-2'])).toBe('custom.ma-macro-3');
  });
});

describe('exécution', () => {
  function setup() {
    const registry = createCommandRegistry();
    const calls = [];
    let selection = true;
    registry.registerAll([
      { id: 'a', label: 'Étape A', group: 'G', run: () => calls.push('a') },
      { id: 'b', label: 'Étape B', group: 'G', enabled: () => selection, run: () => calls.push('b') },
      { id: 'c', label: 'Étape C', group: 'G', run: () => calls.push('c') },
    ]);
    const batches = [];
    const messages = { ok: [], error: [] };
    const command = (steps) => toCommand({ id: 'custom.m', name: 'Ma macro', steps, shortcut: 'Ctrl+Maj+M' }, {
      registry,
      batch: (label, run) => { batches.push(label); return run(); },
      labelOf: (id) => `libellé ${id}`,
      report: { ok: (m) => messages.ok.push(m), error: (m) => messages.error.push(m) },
    });
    return { registry, calls, batches, messages, command, deselect: () => { selection = false; } };
  }

  test('une commande ordinaire du registre : groupe « Personnalisées », raccourci, mots-clés des étapes', () => {
    const { command } = setup();
    const built = command(['a', 'b']);
    expect(built).toMatchObject({ id: 'custom.m', label: 'Ma macro', group: CUSTOM_GROUP, shortcut: 'Ctrl+Maj+M' });
    expect(built.keywords).toContain('libellé a');
    expect(built.keywords).toContain('macro');
  });

  test('les étapes s’exécutent dans l’ordre, dans un seul lot nommé d’après la commande', () => {
    const { command, calls, batches, messages } = setup();
    command(['c', 'a', 'b']).run();
    expect(calls).toEqual(['c', 'a', 'b']);
    expect(batches).toEqual(['Ma macro']);
    expect(messages.ok[0]).toContain('3 étape(s)');
  });

  test('une étape indisponible est ignorée et signalée, les autres s’exécutent', () => {
    const { command, calls, deselect, messages } = setup();
    deselect();
    command(['a', 'b', 'c']).run();
    expect(calls).toEqual(['a', 'c']);
    expect(messages.error[0]).toContain('2 étape(s) faite(s), 1 ignorée(s)');
    expect(messages.error[0]).toContain('libellé b');
  });

  test('une étape devenue introuvable (commande retirée du code) est signalée comme telle', () => {
    const { command, calls, messages } = setup();
    command(['a', 'disparue']).run();
    expect(calls).toEqual(['a']);
    expect(messages.error[0]).toContain('disparue (introuvable)');
  });

  test('toujours exécutable : quand aucune étape n’est possible, elle l’explique au lieu de ne rien faire', () => {
    const { command, deselect, calls, messages, batches } = setup();
    deselect();
    const built = command(['b']);
    expect(built.enabled).toBeUndefined();
    built.run();
    expect(calls).toEqual([]);
    expect(messages.error[0]).toContain('aucune étape possible');
    expect(messages.error[0]).toContain('libellé b');
    expect(batches).toEqual(['Ma macro']);
  });

  test('les étapes sont jouées en silence : une macro ne s’enregistre pas elle-même', () => {
    const { command, registry } = setup();
    const seen = [];
    registry.onRun((id) => seen.push(id));
    command(['a', 'c']).run();
    expect(seen).toEqual([]);
  });
});

describe('enregistreur de macro', () => {
  function setup() {
    const registry = createCommandRegistry();
    for (const id of ['edit.copy', 'edit.undo', 'help.palette', 'layer.top', 'custom.x']) registry.register({ id, label: id, group: 'G', run: () => {} });
    return { registry, recorder: createMacroRecorder(registry) };
  }

  test('enregistre les commandes exécutées, hors annuler, fenêtres et commandes personnalisées', () => {
    const { registry, recorder } = setup();
    recorder.start();
    expect(recorder.isRecording()).toBe(true);
    for (const id of ['edit.copy', 'edit.undo', 'help.palette', 'layer.top', 'custom.x', 'layer.top']) registry.run(id);
    expect(recorder.finish()).toEqual(['edit.copy', 'layer.top', 'layer.top']);
    expect(recorder.isRecording()).toBe(false);
  });

  test('ne garde rien avant start ni après finish ; cancel jette tout', () => {
    const { registry, recorder } = setup();
    registry.run('edit.copy');
    recorder.start();
    registry.run('layer.top');
    expect(recorder.steps()).toEqual(['layer.top']);
    recorder.cancel();
    expect(recorder.steps()).toEqual([]);
    registry.run('edit.copy');
    expect(recorder.finish()).toEqual([]);
  });

  test('l’enregistrement est borné à MAX_STEPS ; start deux fois n’efface pas', () => {
    const { registry, recorder } = setup();
    recorder.start();
    recorder.start();
    for (let i = 0; i < MAX_STEPS + 5; i += 1) registry.run('layer.top');
    expect(recorder.steps()).toHaveLength(MAX_STEPS);
  });

  test('prévient ses abonnés à chaque étape et à l’arrêt', () => {
    const { registry, recorder } = setup();
    let count = 0;
    const off = recorder.subscribe(() => { count += 1; });
    recorder.start();
    registry.run('layer.top');
    recorder.finish();
    expect(count).toBe(3);
    off();
  });
});

describe('stockage', () => {
  const command = (id, name = id) => ({ id, name, steps: ['edit.copy'] });
  const fake = () => { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), data }; };

  test('ajoute, remplace par identifiant, retire ; persiste et se relit', () => {
    const storage = fake();
    const store = createCustomCommandStore({ storage });
    store.save(command('custom.a'));
    store.save(command('custom.b'));
    store.save({ ...command('custom.a'), name: 'Renommée' });
    expect(store.list().map((c) => [c.id, c.name])).toEqual([['custom.a', 'Renommée'], ['custom.b', 'custom.b']]);
    store.remove('custom.b');
    expect(createCustomCommandStore({ storage }).list().map((c) => c.id)).toEqual(['custom.a']);
  });

  test('un stockage corrompu ou hostile ne casse rien', () => {
    const storage = fake();
    storage.setItem('overlay.studio.custom-commands', '{pas du json');
    expect(createCustomCommandStore({ storage }).list()).toEqual([]);
    const hostile = { getItem() { throw new Error('refusé'); }, setItem() { throw new Error('plein'); } };
    const store = createCustomCommandStore({ storage: hostile });
    store.save(command('custom.a'));
    expect(store.list()).toHaveLength(1);
  });

  test('les entrées mal formées du stockage sont ignorées', () => {
    const storage = fake();
    storage.setItem('overlay.studio.custom-commands', JSON.stringify([{ id: 'custom.ok', name: 'ok', steps: ['edit.copy'] }, { id: 3 }, null, 'x']));
    expect(createCustomCommandStore({ storage }).list().map((c) => c.id)).toEqual(['custom.ok']);
  });

  test('l’export est un JSON autonome', () => {
    const store = createCustomCommandStore();
    store.save(command('custom.a', 'Ma macro'));
    expect(JSON.parse(store.exportJson())).toEqual({ format: 'overlay-custom-commands', version: 1, commands: [command('custom.a', 'Ma macro')] });
  });
});

describe('import', () => {
  const exported = (commands) => JSON.stringify({ format: 'overlay-custom-commands', version: 1, commands });

  test('reprend les commandes valides avec des identifiants neufs et rapporte les refusées avec leurs raisons', () => {
    const text = exported([
      { id: 'custom.x', name: 'Bonne', steps: ['edit.copy'], shortcut: 'Ctrl+Maj+B' },
      { id: 'custom.y', name: 'Mauvaise', steps: ['inconnue'] },
    ]);
    const result = parseCustomCommands(text, { knownIds: KNOWN });
    expect(result.ok).toBe(true);
    expect(result.commands).toEqual([{ id: 'custom.bonne', name: 'Bonne', steps: ['edit.copy'], shortcut: 'Ctrl+Maj+B' }]);
    expect(result.rejected).toEqual([{ name: 'Mauvaise', errors: ['étape inconnue : inconnue'] }]);
  });

  test('un import ne remplace jamais une commande existante : nom en double refusé, identifiant jamais réutilisé', () => {
    const existing = [{ id: 'custom.bonne', name: 'Bonne', steps: ['edit.copy'] }];
    const result = parseCustomCommands(exported([{ name: 'Bonne', steps: ['edit.copy'] }, { name: 'Autre', steps: ['edit.copy'] }]), { knownIds: KNOWN, existing });
    expect(result.commands.map((c) => c.name)).toEqual(['Autre']);
    expect(result.rejected[0].errors[0]).toContain('s\'appelle déjà');
  });

  test('deux commandes importées qui se disputent un raccourci : la seconde est refusée', () => {
    const result = parseCustomCommands(exported([
      { name: 'Un', steps: ['edit.copy'], shortcut: 'Ctrl+Maj+Q' },
      { name: 'Deux', steps: ['edit.copy'], shortcut: 'Ctrl+Maj+Q' },
    ]), { knownIds: KNOWN });
    expect(result.commands.map((c) => c.name)).toEqual(['Un']);
    expect(result.rejected[0].errors[0]).toContain('déjà pris par « Un »');
  });

  test('un tableau nu est accepté ; un JSON illisible ou étranger est refusé', () => {
    expect(parseCustomCommands(JSON.stringify([{ name: 'A', steps: ['edit.copy'] }]), { knownIds: KNOWN }).commands).toHaveLength(1);
    expect(parseCustomCommands('{pas du json', { knownIds: KNOWN })).toEqual({ ok: false, error: 'JSON illisible' });
    expect(parseCustomCommands('{"format":"autre"}', { knownIds: KNOWN }).ok).toBe(false);
  });
});
