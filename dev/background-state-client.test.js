import { describe, expect, test } from 'bun:test';
import {
  BackgroundStateClientError,
  createBackgroundStateClient,
} from './background-state-client.js';

const stateFile = {
  current: { component: 'rain', options: { speed: 1 } },
  presets: [],
};

describe('client d’état du tuner', () => {
  test('lit l’état et centralise l’URL du serveur', async () => {
    const requests = [];
    const client = createBackgroundStateClient({
      baseUrl: 'http://state.test/',
      fetchImpl: async (url, init) => {
        requests.push([String(url), init?.method ?? 'GET']);
        return Response.json(stateFile);
      },
    });

    expect(await client.readState()).toEqual(stateFile);
    expect(requests).toEqual([['http://state.test/state', 'GET']]);
  });

  test('lit un état écrit avec les anciens noms et valeurs (serveur pas encore migré)', async () => {
    const legacy = {
      current: { component: 'RainBackground', options: { speed: 1, audioReactive: 'Oui' } },
      presets: [{ id: 'a', name: 'A', component: 'BubbleBackground', options: { audioReactive: 'Non' } }],
    };
    const client = createBackgroundStateClient({
      baseUrl: 'http://state.test',
      fetchImpl: async () => Response.json(legacy),
    });
    const state = await client.readState();
    expect(state.current).toEqual({ component: 'rain', options: { speed: 1, audioReactive: true } });
    expect(state.presets[0]).toMatchObject({ component: 'bubble', options: { audioReactive: false } });
  });

  test('une action de preset encode une seule fois le protocole HTTP', async () => {
    const requests = [];
    const client = createBackgroundStateClient({
      baseUrl: 'http://state.test',
      fetchImpl: async (url, init) => {
        requests.push({
          url: String(url),
          method: init?.method,
          headers: init?.headers,
          body: JSON.parse(String(init?.body)),
        });
        return Response.json({ ok: true });
      },
    });

    await client.savePreset({
      name: 'Pluie calme',
      component: 'RainBackground',
      options: { speed: 0.5 },
      tags: ['calme'],
    });

    expect(requests).toEqual([{
      url: 'http://state.test/save-preset',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        name: 'Pluie calme',
        component: 'RainBackground',
        options: { speed: 0.5 },
        tags: ['calme'],
      },
    }]);
  });

  test('les autres commandes utilisent leurs routes et enveloppes métier', async () => {
    const requests = [];
    const client = createBackgroundStateClient({
      baseUrl: 'http://state.test',
      fetchImpl: async (url, init) => {
        requests.push({
          path: new URL(String(url)).pathname,
          body: JSON.parse(String(init?.body)),
        });
        return Response.json({ ok: true });
      },
    });
    const current = { component: 'RainBackground', options: {} };

    await client.saveCurrent(current);
    await client.renamePreset('pluie', 'Pluie douce');
    await client.duplicatePreset('pluie');
    await client.deletePreset('pluie');
    await client.previewPresetImport('bundle-json');

    expect(requests).toEqual([
      { path: '/state', body: { current } },
      { path: '/rename-preset', body: { id: 'pluie', name: 'Pluie douce' } },
      { path: '/duplicate-preset', body: { id: 'pluie' } },
      { path: '/delete-preset', body: { id: 'pluie' } },
      { path: '/preview-import', body: { bundle: 'bundle-json' } },
    ]);
  });

  test('une erreur serveur conserve l’opération, le statut et le message utile', async () => {
    const client = createBackgroundStateClient({
      baseUrl: 'http://state.test',
      fetchImpl: async () => Response.json(
        { error: 'révision obsolète' },
        { status: 409 },
      ),
    });

    try {
      await client.importPresets('bundle-json', 'ancienne-révision');
      throw new Error('l’import aurait dû échouer');
    } catch (error) {
      expect(error).toBeInstanceOf(BackgroundStateClientError);
      expect(error).toMatchObject({
        operation: 'import-presets',
        status: 409,
        message: 'révision obsolète',
      });
    }
  });

  test('la synchronisation WebSocket expose les deux flux et se ferme proprement', () => {
    const sockets = [];
    class FakeWebSocket {
      constructor(url) {
        this.url = url;
        this.closed = false;
        sockets.push(this);
      }
      close() {
        this.closed = true;
      }
    }
    const received = [];
    const client = createBackgroundStateClient({
      baseUrl: 'https://state.test',
      fetchImpl: async () => Response.json({}),
      WebSocketImpl: FakeWebSocket,
    });

    const unsubscribe = client.subscribe({
      onCurrent: (current) => received.push(['current', current]),
      onPresets: () => received.push(['presets']),
    });
    sockets[0].onmessage({ data: JSON.stringify(stateFile.current) });
    sockets[1].onmessage({ data: JSON.stringify({ action: 'saved' }) });

    expect(sockets.map(({ url }) => url)).toEqual([
      'wss://state.test/state-ws',
      'wss://state.test/presets-ws',
    ]);
    expect(received).toEqual([
      ['current', stateFile.current],
      ['presets'],
    ]);
    unsubscribe();
    expect(sockets.every(({ closed }) => closed)).toBeTrue();
  });
});

describe('contrôle des serveurs', () => {
  test('la demande d’arrêt ou de redémarrage porte l’en-tête de contrôle', async () => {
    const requests = [];
    const client = createBackgroundStateClient({
      baseUrl: 'http://state.test',
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), method: init?.method, headers: init?.headers });
        return Response.json({ ok: true }, { status: 202 });
      },
    });
    await client.control('restart');
    await client.control('stop');
    expect(requests.map(({ url }) => url)).toEqual(['http://state.test/control/restart', 'http://state.test/control/stop']);
    expect(requests.every(({ method, headers }) => method === 'POST' && headers['X-Overlay-Control'] === '1')).toBe(true);
  });

  test('un refus remonte son code HTTP pour que l’interface le explique', async () => {
    const client = createBackgroundStateClient({
      baseUrl: 'http://state.test',
      fetchImpl: async () => Response.json({ error: 'serveur non supervisé' }, { status: 501 }),
    });
    const error = await client.control('stop').catch((caught) => caught);
    expect(error.status).toBe(501);
  });
});
