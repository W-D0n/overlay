import { expect, test } from 'bun:test';
import {
  collectBackgroundLiveReadiness,
  evaluateBackgroundLiveReadiness,
} from './background-live-readiness.js';

const file = {
  current: { component: 'RainBackground', options: {} },
  presets: [
    {
      id: 'discussion-calme',
      name: 'Discussion calme',
      component: 'BubbleBackground',
      options: { count: 12 },
    },
  ],
};

test('un preset valide produit un diagnostic prêt et son URL OBS stable', () => {
  const report = evaluateBackgroundLiveReadiness({
    state: { ok: true, file },
    selection: { presetId: 'discussion-calme', quality: 'performance' },
    runtime: { fps: 60, pixelRatio: 1, paused: false },
    relay: { reachable: false },
  });

  expect(report.status).toBe('ready');
  expect(report.obsUrl).toBe(
    'http://localhost:5500/background.html?preset=discussion-calme&transparent=1&quality=performance',
  );
  expect(report.checks.map(({ id, status }) => [id, status])).toEqual([
    ['state', 'ready'],
    ['selection', 'ready'],
    ['url', 'ready'],
    ['runtime', 'ready'],
    ['relay', 'ready'],
  ]);
});

test('un service d’état indisponible bloque le départ sans masquer la marche à suivre', () => {
  const report = evaluateBackgroundLiveReadiness({
    state: { ok: false, error: 'Failed to fetch' },
    selection: { presetId: null, quality: 'auto' },
    runtime: { fps: 60, pixelRatio: 2, paused: false },
    relay: { reachable: null },
  });

  expect(report.status).toBe('blocking');
  expect(report.obsUrl).toBeNull();
  expect(report.checks.map(({ id }) => id)).toEqual([
    'state',
    'selection',
    'url',
    'runtime',
    'relay',
  ]);
  expect(report.checks.find(({ id }) => id === 'state')).toMatchObject({
    status: 'blocking',
    title: 'Serveur d’état indisponible',
    action: { label: 'Réessayer' },
  });
});

test('un identifiant de preset absent bloque une URL OBS trompeuse', () => {
  const report = evaluateBackgroundLiveReadiness({
    state: { ok: true, file },
    selection: { presetId: 'preset-absent', quality: 'auto' },
    runtime: { fps: 60, pixelRatio: 2, paused: false },
    relay: { reachable: false },
  });

  expect(report.status).toBe('blocking');
  expect(report.obsUrl).toBeNull();
  expect(report.checks.map(({ id }) => id)).toEqual([
    'state',
    'selection',
    'url',
    'runtime',
    'relay',
  ]);
  expect(report.checks.find(({ id }) => id === 'selection')).toMatchObject({
    status: 'blocking',
    title: 'Preset introuvable',
    action: { label: 'Choisir un preset existant' },
  });
});

test('le fond courant fournit aussi une URL OBS transparente sans faux preset', () => {
  const report = evaluateBackgroundLiveReadiness({
    state: { ok: true, file },
    selection: { presetId: null, quality: 'auto' },
    runtime: { fps: 58, pixelRatio: 2, paused: false },
    relay: { reachable: false },
  });

  expect(report.status).toBe('ready');
  expect(report.obsUrl).toBe('http://localhost:5500/background.html?transparent=1');
  expect(report.checks.find(({ id }) => id === 'selection')).toMatchObject({
    status: 'ready',
    title: 'Effet courant prêt',
  });
  expect(report.checks.find(({ id }) => id === 'url')).toMatchObject({
    detail: 'Cette adresse suit l’effet courant du tuner.',
    action: { value: 'http://localhost:5500/background.html?transparent=1' },
  });
});

test('un effet inconnu bloque le diagnostic avant de copier son URL', () => {
  const report = evaluateBackgroundLiveReadiness({
    state: {
      ok: true,
      file: { ...file, current: { component: 'UnknownBackground', options: {} } },
    },
    selection: { presetId: null, quality: 'auto' },
    runtime: { fps: 60, pixelRatio: 2, paused: false },
    relay: { reachable: false },
  });

  expect(report.status).toBe('blocking');
  expect(report.obsUrl).toBeNull();
  expect(report.checks.find(({ id }) => id === 'selection')).toMatchObject({
    status: 'blocking',
    title: 'Effet inconnu',
    action: { label: 'Choisir un effet disponible' },
  });
});

test('un fond vide ou une mesure en pause demande une attention sans inventer un seuil OBS', () => {
  const report = evaluateBackgroundLiveReadiness({
    state: {
      ok: true,
      file: { ...file, current: { component: null, options: {} } },
    },
    selection: { presetId: null, quality: 'auto' },
    runtime: { fps: null, pixelRatio: null, paused: true },
    relay: { reachable: false },
  });

  expect(report.status).toBe('attention');
  expect(report.checks.find(({ id }) => id === 'selection')).toMatchObject({
    status: 'attention',
    title: 'Aucun effet actif',
    action: { label: 'Choisir un effet' },
  });
  expect(report.checks.find(({ id }) => id === 'runtime')).toMatchObject({
    status: 'attention',
    title: 'Mesure en attente',
  });
});

test('la collecte interroge seulement les services en lecture', async () => {
  const requests = [];
  const report = await collectBackgroundLiveReadiness({
    stateServer: 'http://state.test',
    relayUrl: 'http://relay.test/',
    selection: { presetId: 'discussion-calme', quality: 'auto' },
    runtime: { fps: 60, pixelRatio: 2, paused: false },
    fetchImpl: async (url, init) => {
      requests.push([String(url), init?.method]);
      if (String(url).startsWith('http://state.test')) {
        return new Response(JSON.stringify(file), { status: 200 });
      }
      return new Response('relay ok', { status: 200 });
    },
  });

  expect(report.status).toBe('ready');
  expect(requests).toEqual([
    ['http://state.test/state', 'GET'],
    ['http://relay.test/', 'GET'],
  ]);
});

test('une coupure réseau produit un diagnostic complet sans faire échouer la collecte', async () => {
  const report = await collectBackgroundLiveReadiness({
    stateServer: 'http://state.test',
    relayUrl: 'http://relay.test/',
    selection: { presetId: null, quality: 'auto' },
    runtime: { fps: 60, pixelRatio: 2, paused: false },
    fetchImpl: async () => {
      throw new TypeError('Failed to fetch');
    },
  });

  expect(report.status).toBe('blocking');
  expect(report.obsUrl).toBeNull();
  expect(report.checks.map(({ id }) => id)).toEqual([
    'state',
    'selection',
    'url',
    'runtime',
    'relay',
  ]);
  expect(report.checks.find(({ id }) => id === 'state')).toMatchObject({
    status: 'blocking',
    title: 'Serveur d’état indisponible',
  });
  expect(report.checks.find(({ id }) => id === 'runtime')).toMatchObject({ status: 'ready' });
  expect(report.checks.find(({ id }) => id === 'relay')).toMatchObject({ status: 'ready' });
});
