import { describe, expect, test } from 'bun:test';
import {
  BackgroundStateClientError,
  createBackgroundStateClient,
} from './background-state-client.js';

const stateFile = {
  current: { component: 'RainBackground', options: { speed: 1 } },
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
