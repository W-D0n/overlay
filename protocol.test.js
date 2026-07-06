/**
 * protocol.test.js — Tests autonomes de la logique pure du protocole (S2).
 * Lancement : `bun test`
 *
 * Numérotation T## continue sur tout le fichier (jamais réinitialisée par describe).
 * Chaque test référence le ou les AC de docs/specs/scene-config-protocol.md.
 */

import { test, expect } from 'bun:test';
import { reduceMessage, validateSceneConfig, DEFAULT_TRANSITION } from './protocol.js';
import discussionConfig from './scenes/data/discussion.scene.json';
import brbConfig from './scenes/data/brb.scene.json';
import codageConfig from './scenes/data/codage.scene.json';

const CTX = { now: 1000 };

/** État minimal réaliste pour les tests. @returns {import('./types.js').StreamState} */
function buildState(overrides = {}) {
  return {
    streamerName: 'D0n', viewers: 42, duration: '01:00:00', sessionId: '007',
    currentActivity: 'SvelteKit', currentFile: 'App.svelte', currentBranch: 'main',
    currentTool: '', chatMessages: [], latestAlert: null, activePoll: null,
    pomodoro: { secondsLeft: 1500, totalSeconds: 1500, sessionIndex: 1, totalSessions: 4, phase: 'idle' },
    nextStream: '', nextStreamTopic: '', currentSong: '', guest: null,
    sessionStats: { maxViewers: 0, newFollows: 0, duration: '00:00:00' },
    sourceTitle: '', sourceAuthor: '', sourcePlatform: '', subjectLine: 'Sujet', recapLines: [],
    socialLinks: [], currentScene: 'brb', visibilityLevel: 'full',
    ...overrides,
  };
}

/** Config minimale valide, librement mutable par test. */
function validConfig() {
  return {
    id: 'discussion',
    background: { component: 'DotGridBackground', options: { mode: 'discussion' } },
    transition: { type: 'crossfade', duration: 400, easing: 'easeInOut' },
    layers: [
      { name: 'goldbar', components: [{ component: 'GoldBar', options: {} }], visibility: { full: true, minimal: true, hidden: false } },
      { name: 'body', components: [], visibility: { full: true, minimal: false, hidden: false } },
    ],
  };
}

// ─── reduceMessage — nouveaux types ─────────────────────────────────────────

test('T01 [AC-01/02] scene.set valide → patch currentScene + event scene-change', () => {
  const r = reduceMessage(buildState({ currentScene: 'brb' }), { type: 'scene.set', data: { scene: 'codage' } }, CTX);
  expect(r.patch).toEqual({ currentScene: 'codage' });
  expect(r.events).toEqual([{ name: 'overlay:scene-change', detail: { scene: 'codage' } }]);
  expect(r.warnings).toEqual([]);
  expect(r.effects).toEqual([]);
});

test('T02 [AC-03/04] visibility.set valide → patch + event visibility-change', () => {
  const r = reduceMessage(buildState({ visibilityLevel: 'full' }), { type: 'visibility.set', data: { level: 'minimal' } }, CTX);
  expect(r.patch).toEqual({ visibilityLevel: 'minimal' });
  expect(r.events).toEqual([{ name: 'overlay:visibility-change', detail: { level: 'minimal' } }]);
});

test('T03 [AC-05/06] morph.trigger valide → event morph, patch null', () => {
  const r = reduceMessage(buildState(), { type: 'morph.trigger', data: { imageUrl: 'logo.png' } }, CTX);
  expect(r.events).toEqual([{ name: 'overlay:morph', detail: { imageUrl: 'logo.png' } }]);
  expect(r.patch).toBeNull();
});

test('T04 [AC-07] scene.set id vide/non-string → warning, pas de patch/event', () => {
  const r = reduceMessage(buildState(), { type: 'scene.set', data: { scene: '' } }, CTX);
  expect(r.patch).toBeNull();
  expect(r.events).toEqual([]);
  expect(r.warnings).toEqual(['[overlay] scene.set : scène inconnue — ']);
});

test('T04b [AC-07] scene.set vers un id inconnu du registry → accepté par reduceMessage (S8, SceneId ouvert) ; rejeté en aval par scene-runtime.js au montage, pas ici (AD-1, découplage)', () => {
  const r = reduceMessage(buildState(), { type: 'scene.set', data: { scene: 'nope' } }, CTX);
  expect(r.patch).toEqual({ currentScene: 'nope' });
});

test('T05 [AC-08] visibility.set niveau inconnu → warning, pas de patch/event', () => {
  const r = reduceMessage(buildState(), { type: 'visibility.set', data: { level: 'nope' } }, CTX);
  expect(r.patch).toBeNull();
  expect(r.warnings).toEqual(['[overlay] visibility.set : niveau inconnu — nope']);
});

test('T06 [AC-22] scene.set vers la scène courante → no-op', () => {
  const r = reduceMessage(buildState({ currentScene: 'codage' }), { type: 'scene.set', data: { scene: 'codage' } }, CTX);
  expect(r.patch).toBeNull();
  expect(r.events).toEqual([]);
  expect(r.warnings).toEqual([]);
});

test('T07 [AC-22] visibility.set vers le niveau courant → no-op', () => {
  const r = reduceMessage(buildState({ visibilityLevel: 'minimal' }), { type: 'visibility.set', data: { level: 'minimal' } }, CTX);
  expect(r.patch).toBeNull();
  expect(r.events).toEqual([]);
});

test('T08 [AC-23] morph.trigger data non-objet → detail {} + warning', () => {
  const r = reduceMessage(buildState(), { type: 'morph.trigger', data: 'star' }, CTX);
  expect(r.events).toEqual([{ name: 'overlay:morph', detail: {} }]);
  expect(r.warnings).toEqual(['[overlay] morph.trigger : data invalide — star']);
});

test('T09 morph.trigger sans data → detail {} sans warning', () => {
  const r = reduceMessage(buildState(), { type: 'morph.trigger' }, CTX);
  expect(r.events).toEqual([{ name: 'overlay:morph', detail: {} }]);
  expect(r.warnings).toEqual([]);
});

test('T10 [AC-19] scene.set override transition valide → detail contient transition', () => {
  const r = reduceMessage(buildState({ currentScene: 'brb' }), { type: 'scene.set', data: { scene: 'codage', transition: { duration: 1200 } } }, CTX);
  expect(r.events[0].detail).toEqual({ scene: 'codage', transition: { duration: 1200 } });
});

test('T11 [AC-19] scene.set sans override → clé transition absente du detail', () => {
  const r = reduceMessage(buildState({ currentScene: 'brb' }), { type: 'scene.set', data: { scene: 'codage' } }, CTX);
  expect('transition' in r.events[0].detail).toBe(false);
});

test('T12 scene.set transition non-objet → override ignoré, scène changée, warning', () => {
  const r = reduceMessage(buildState({ currentScene: 'brb' }), { type: 'scene.set', data: { scene: 'codage', transition: 'fast' } }, CTX);
  expect(r.patch).toEqual({ currentScene: 'codage' });
  expect('transition' in r.events[0].detail).toBe(false);
  expect(r.warnings).toEqual(['[overlay] scene.set : transition invalide — fast']);
});

test('T13 [AC-20] scene.set transition.type inconnu → override ignoré, scène changée, warning', () => {
  const r = reduceMessage(buildState({ currentScene: 'brb' }), { type: 'scene.set', data: { scene: 'codage', transition: { type: 'zoom', duration: 500 } } }, CTX);
  expect(r.patch).toEqual({ currentScene: 'codage' });
  expect('transition' in r.events[0].detail).toBe(false);
  expect(r.warnings).toEqual(['[overlay] scene.set : type de transition inconnu — zoom']);
});

test('T14 scene.set sans data → warning data manquant', () => {
  const r = reduceMessage(buildState(), { type: 'scene.set' }, CTX);
  expect(r.warnings).toEqual(['[overlay] scene.set : data manquant']);
});

// ─── reduceMessage — guard & inconnu ────────────────────────────────────────

test('T15 [AC-32] message malformé (null) → résultat vide, ne lève pas', () => {
  const r = reduceMessage(buildState(), null, CTX);
  expect(r).toEqual({ patch: null, events: [], warnings: [], effects: [] });
});

test('T16 [AC-32] message non-objet (42, string) ou sans type → résultat vide', () => {
  for (const bad of [42, 'x', {}, { data: 1 }, { type: 5 }]) {
    expect(reduceMessage(buildState(), bad, CTX)).toEqual({ patch: null, events: [], warnings: [], effects: [] });
  }
});

test('T17 [AC-27] type inconnu → résultat vide', () => {
  expect(reduceMessage(buildState(), { type: 'foo.bar', data: {} }, CTX)).toEqual({ patch: null, events: [], warnings: [], effects: [] });
});

// ─── reduceMessage — pureté & forme ─────────────────────────────────────────

test('T18 [AC-26] reduceMessage ne mute jamais state', () => {
  const messages = [
    { type: 'scene.set', data: { scene: 'codage' } },
    { type: 'chat.message', data: { username: 'a', text: 'hi', timestamp: 1 } },
    { type: 'alert.sub', data: { username: 'b', amount: 3 } },
    { type: 'session.start', data: { id: '99' } },
    { type: 'context.update', data: { activity: 'X' } },
  ];
  for (const msg of messages) {
    const state = buildState();
    const snapshot = structuredClone(state);
    reduceMessage(state, msg, CTX);
    expect(state).toEqual(snapshot);
  }
});

test('T19 [AC-38] ReduceResult inclut toujours les 4 champs', () => {
  for (const msg of [{ type: 'scene.set', data: { scene: 'codage' } }, { type: 'foo' }, null, { type: 'session.start', data: {} }]) {
    const r = reduceMessage(buildState(), msg, CTX);
    expect(r).toHaveProperty('patch');
    expect(r).toHaveProperty('events');
    expect(r).toHaveProperty('warnings');
    expect(r).toHaveProperty('effects');
  }
});

test('T20 [AC-31] constantes de repli exportées avec les bonnes valeurs', () => {
  expect(DEFAULT_TRANSITION).toEqual({ type: 'crossfade', duration: 400, easing: 'easeInOut' });
});

// ─── reduceMessage — types existants migrés ─────────────────────────────────

test('T21 [AC-33] stream.stats → patch viewers/duration (fallback état)', () => {
  const r = reduceMessage(buildState({ viewers: 10, duration: '00:10:00' }), { type: 'stream.stats', data: { viewers: 99 } }, CTX);
  expect(r.patch).toEqual({ viewers: 99, duration: '00:10:00' });
});

test('T22 [AC-36] chat.message → nouveau message en tête, cap à 20, état non muté', () => {
  const existing = Array.from({ length: 20 }, (_, i) => ({ username: 'u', text: `m${i}`, timestamp: i }));
  const state = buildState({ chatMessages: existing });
  const snapshot = structuredClone(state);
  const r = reduceMessage(state, { type: 'chat.message', data: { username: 'new', text: 'hi', timestamp: 999 } }, CTX);
  expect(r.patch.chatMessages).toHaveLength(20);
  expect(r.patch.chatMessages[0]).toEqual({ username: 'new', text: 'hi', timestamp: 999 });
  expect(state).toEqual(snapshot);
});

test('T23 [AC-34] alert.* → timestamp = context.now (horloge injectée)', () => {
  const r = reduceMessage(buildState(), { type: 'alert.follow', data: { username: 'bob' } }, { now: 555 });
  expect(r.patch.latestAlert).toEqual({ type: 'follow', username: 'bob', timestamp: 555, amount: undefined });
});

test('T24 [AC-33] alert.* username par défaut Anonyme + suffixe type', () => {
  const r = reduceMessage(buildState(), { type: 'alert.raid', data: { amount: 50 } }, CTX);
  expect(r.patch.latestAlert.type).toBe('raid');
  expect(r.patch.latestAlert.username).toBe('Anonyme');
  expect(r.patch.latestAlert.amount).toBe(50);
});

test('T25 [AC-33] poll.update / poll.end / pomodoro.tick', () => {
  const poll = { question: 'Q', yesRatio: 0.5, totalVotes: 10 };
  expect(reduceMessage(buildState(), { type: 'poll.update', data: poll }, CTX).patch).toEqual({ activePoll: poll });
  expect(reduceMessage(buildState(), { type: 'poll.end' }, CTX).patch).toEqual({ activePoll: null });
  const pomo = { secondsLeft: 10, totalSeconds: 1500, sessionIndex: 2, totalSessions: 4, phase: 'focus' };
  expect(reduceMessage(buildState(), { type: 'pomodoro.tick', data: pomo }, CTX).patch).toEqual({ pomodoro: pomo });
});

test('T26 [AC-33] context.update → mapping data → champs état avec fallback', () => {
  const r = reduceMessage(buildState({ currentFile: 'old.js' }), { type: 'context.update', data: { activity: 'Blender', subject: 'Sculpt' } }, CTX);
  expect(r.patch).toEqual({
    currentActivity: 'Blender', currentFile: 'old.js', currentBranch: 'main',
    currentTool: '', subjectLine: 'Sculpt', currentSong: '',
  });
});

test('T27 [AC-35] session.start → patch sessionId + effect reset-duration-timer', () => {
  const r = reduceMessage(buildState({ sessionId: '001' }), { type: 'session.start', data: { id: '042' } }, CTX);
  expect(r.patch).toEqual({ sessionId: '042' });
  expect(r.effects).toEqual(['reset-duration-timer']);
});

// ─── validateSceneConfig ────────────────────────────────────────────────────

test('T28 [AC-28] les 3 configs de référence sont valides', () => {
  for (const c of [discussionConfig, brbConfig, codageConfig]) {
    const r = validateSceneConfig(c);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  }
});

test('T29 [AC-37] pré-checks structurels V0 (null, layers absent/non-tableau)', () => {
  expect(validateSceneConfig(null).ok).toBe(false);
  expect(validateSceneConfig(null).errors).toEqual(['config absente ou non-objet']);
  expect(validateSceneConfig({ id: 'brb' }).errors).toEqual(['layers absent ou non-tableau']);
  expect(validateSceneConfig({ layers: 'nope' }).errors).toEqual(['layers absent ou non-tableau']);
});

test('T30 [AC-29] V0c — couche malformée détectée', () => {
  const c = validConfig();
  c.layers.push(/** @type {*} */ ({ name: 123 }));
  expect(validateSceneConfig(c).errors).toContain("couche malformée à l'index 2");
});

test('T31 [AC-29] V1 — id invalide (chaîne vide) ; toute chaîne non-vide est acceptée (S8, SceneId ouvert)', () => {
  const c = validConfig(); c.id = /** @type {*} */ ('');
  expect(validateSceneConfig(c).errors).toContain('id invalide : ');

  const open = validConfig(); open.id = /** @type {*} */ ('nouvelle-scene-jamais-vue');
  expect(validateSceneConfig(open).errors).not.toContain('id invalide : nouvelle-scene-jamais-vue');
});

test('T32 [Track B AC-01] V2 — background invalide (composant inconnu ou non-objet)', () => {
  const c = validConfig(); c.background = /** @type {*} */ (42);
  expect(validateSceneConfig(c).errors).toContain('background invalide : 42');

  const unknown = validConfig(); unknown.background = /** @type {*} */ ({ component: 'NeVersJamais', options: {} });
  expect(validateSceneConfig(unknown).errors).toContain(`background invalide : ${String(unknown.background)}`);
});

test('T33 [Track B AC-01] V2 — background null accepté (scène sans effet de fond)', () => {
  const c = validConfig(); c.background = null;
  expect(validateSceneConfig(c).errors).not.toContain('background invalide : null');
});

test('T34 [AC-29] V3 — transition invalide', () => {
  const c = validConfig(); c.transition = /** @type {*} */ ({ type: 'zoom', duration: 400 });
  expect(validateSceneConfig(c).errors).toContain('transition invalide');
});

test('T35 [AC-29] V4 — goldbar manquante', () => {
  const c = validConfig(); c.layers = c.layers.filter((l) => l.name !== 'goldbar');
  expect(validateSceneConfig(c).errors).toContain('goldbar manquante');
});

test('T36 [AC-29] V4 — goldbar dupliquée', () => {
  const c = validConfig();
  c.layers.push({ name: 'goldbar', components: [], visibility: { full: true, minimal: true, hidden: false } });
  expect(validateSceneConfig(c).errors).toContain('goldbar dupliquée');
});

test('T37 [AC-29] V5 — goldbar ne survit pas au minimal', () => {
  const c = validConfig(); c.layers[0].visibility = { full: true, minimal: false, hidden: false };
  expect(validateSceneConfig(c).errors).toContain('goldbar doit survivre au niveau minimal');
});

test('T38 [AC-29] V6 — nom de couche dupliqué', () => {
  const c = validConfig();
  c.layers.push({ name: 'body', components: [], visibility: { full: true, minimal: false, hidden: false } });
  expect(validateSceneConfig(c).errors).toContain('nom de couche dupliqué : body');
});

test('T39 [AC-29] V7 — visibilité incohérente (minimal sans full)', () => {
  const c = validConfig(); c.layers[1].visibility = { full: false, minimal: true, hidden: false };
  expect(validateSceneConfig(c).errors).toContain('visibilité incohérente sur body');
});

test('T40 [AC-29] V8 — composant inconnu', () => {
  const c = validConfig(); c.layers[1].components = [/** @type {*} */ ({ component: 'Unknown', options: {} })];
  expect(validateSceneConfig(c).errors).toContain('composant inconnu : Unknown');
});

test('T41 [AC-29] V9 — aucune couche visible en full (co-occurrence V5/V7 documentée)', () => {
  // V9 ne peut pas être isolé : un goldbar valide (V5+V7) implique full=true.
  // On vérifie que le filet V9 se déclenche quand aucune couche n'est full.
  const c = validConfig();
  c.layers[0].visibility = { full: false, minimal: false, hidden: false };
  c.layers[1].visibility = { full: false, minimal: false, hidden: false };
  expect(validateSceneConfig(c).errors).toContain('aucune couche visible en full');
});

test('T42 [AC-06] V10 — placement absent accepté (rétrocompatibilité)', () => {
  const c = validConfig();
  expect(validateSceneConfig(c).errors).toEqual([]);
});

test('T43 [AC-03/AC-04] V10 — placement valide accepté, x/y=0 accepté', () => {
  const c = validConfig();
  c.layers[1].placement = { x: 0, y: 0, width: 100, height: 100 };
  expect(validateSceneConfig(c).errors).toEqual([]);
});

test('T44 [AC-04] V10 — placement rejeté si x/y non finis', () => {
  const c = validConfig();
  c.layers[1].placement = /** @type {*} */ ({ x: NaN, y: 40 });
  expect(validateSceneConfig(c).errors).toContain('placement invalide sur body : x/y doivent être des nombres finis');

  const c2 = validConfig();
  c2.layers[1].placement = /** @type {*} */ ({ x: 40, y: 'nope' });
  expect(validateSceneConfig(c2).errors).toContain('placement invalide sur body : x/y doivent être des nombres finis');
});

test('T45 [AC-05] V10 — placement rejeté si width/height <= 0 ou non fini', () => {
  const c = validConfig();
  c.layers[1].placement = { x: 0, y: 0, width: 0 };
  expect(validateSceneConfig(c).errors).toContain('placement invalide sur body : width doit être un nombre fini strictement positif');

  const c2 = validConfig();
  c2.layers[1].placement = { x: 0, y: 0, height: -5 };
  expect(validateSceneConfig(c2).errors).toContain('placement invalide sur body : height doit être un nombre fini strictement positif');
});

test('T46 [AC-02] V11 — placement de composant individuel valide accepté (S8)', () => {
  const c = validConfig();
  c.layers[0].components[0].placement = { x: 0, y: 0, width: 40, height: 2 };
  expect(validateSceneConfig(c).errors).toEqual([]);
});

test('T47 [AC-02] V11 — placement de composant individuel rejeté si x/y non finis (S8)', () => {
  const c = validConfig();
  c.layers[0].components[0].placement = /** @type {*} */ ({ x: NaN, y: 0 });
  expect(validateSceneConfig(c).errors).toContain('placement invalide sur composant GoldBar (couche goldbar, index 0) : x/y doivent être des nombres finis');
});

test('T48 [AC-02] V11 — placement absent sur un composant accepté (rétrocompatibilité)', () => {
  const c = validConfig();
  expect(validateSceneConfig(c).errors).toEqual([]);
});
