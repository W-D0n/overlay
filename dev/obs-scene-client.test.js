// @ts-check
import { expect, test } from 'bun:test';
import { createObsSceneClient, reconnectDelayMs, RECONNECT_DELAYS_MS } from './obs-scene-client.js';
import { computeObsAuthResponse } from '../obs-auth.js';

/**
 * Faux socket OBS : on pilote à la main les messages reçus et on inspecte ceux envoyés.
 * Aucun réseau, aucune instance d'OBS.
 */
function createFakeSocket() {
  const listeners = { message: [], close: [], error: [] };
  const sent = [];
  return {
    sent,
    addEventListener(type, callback) { listeners[type]?.push(callback); },
    send(payload) { sent.push(JSON.parse(payload)); },
    close() {},
    emitMessage(message) {
      for (const callback of listeners.message) callback({ data: JSON.stringify(message) });
    },
    emitClose(code) {
      for (const callback of listeners.close) callback({ code });
    },
    /** Données brutes non JSON, telles qu'OBS pourrait en envoyer sur une trame corrompue. */
    emitRaw(data) {
      for (const callback of listeners.message) callback({ data });
    },
  };
}

function setup({ password = 'secret' } = {}) {
  const sockets = [];
  const scenesSeen = [];
  const changes = [];
  const statuses = [];
  const retries = [];
  const logs = [];

  const client = createObsSceneClient({
    url: 'ws://127.0.0.1:4455',
    password,
    onSceneChange: (name) => changes.push(name),
    onScenes: (names) => scenesSeen.push(names),
    onStatus: (status) => statuses.push(status),
    createSocket: () => { const socket = createFakeSocket(); sockets.push(socket); return socket; },
    scheduleReconnect: (callback, delayMs) => retries.push({ callback, delayMs }),
    log: (message) => logs.push(message),
  });

  return { client, sockets, scenesSeen, changes, statuses, retries, logs };
}

/** L'auth OBS passe par deux digests asynchrones : on attend l'envoi réel plutôt qu'un nombre
 * arbitraire de ticks. */
async function waitForSent(socket, op) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const message = socket.sent.find((sent) => sent.op === op);
    if (message !== undefined) return message;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`aucun message op=${op} envoyé`);
}

const HELLO_WITH_AUTH = {
  op: 0,
  d: { rpcVersion: 1, authentication: { salt: 'saltySalt==', challenge: 'chal1enge==' } },
};

test('1. le HELLO authentifié reçoit une réponse conforme au protocole OBS', async () => {
  const harness = setup();
  harness.sockets[0].emitMessage(HELLO_WITH_AUTH);

  const identify = await waitForSent(harness.sockets[0], 1);
  expect(identify.d.authentication).toBe(await computeObsAuthResponse({
    password: 'secret',
    salt: 'saltySalt==',
    challenge: 'chal1enge==',
  }));
});

test('2. un HELLO sans authentification n’envoie pas de réponse d’auth', async () => {
  const harness = setup();
  harness.sockets[0].emitMessage({ op: 0, d: { rpcVersion: 1 } });

  const identify = await waitForSent(harness.sockets[0], 1);
  expect(identify.d.authentication).toBeUndefined();
  expect(identify.d.eventSubscriptions).toBe(1 << 2);
});

test('3. l’identification demande la liste des scènes et publie l’état connecté', () => {
  const harness = setup();
  harness.sockets[0].emitMessage({ op: 2, d: {} });

  const request = harness.sockets[0].sent.find((message) => message.op === 6);
  expect(request.d.requestType).toBe('GetSceneList');
  expect(harness.statuses.at(-1)).toEqual({ connected: true, reason: null });
});

test('4. la liste des scènes est remontée en noms exploitables', () => {
  const harness = setup();
  harness.sockets[0].emitMessage({ op: 2, d: {} });
  harness.sockets[0].emitMessage({
    op: 7,
    d: { requestId: 'scene-list', responseData: { scenes: [{ sceneName: 'Discussion' }, { sceneName: 'BRB' }, {}] } },
  });
  expect(harness.scenesSeen).toEqual([['Discussion', 'BRB']]);
});

test('5. un changement de scène est remonté une seule fois', () => {
  const harness = setup();
  harness.sockets[0].emitMessage({
    op: 5,
    d: { eventType: 'CurrentProgramSceneChanged', eventData: { sceneName: 'BRB' } },
  });
  expect(harness.changes).toEqual(['BRB']);
});

test('6. un autre événement OBS est ignoré', () => {
  const harness = setup();
  harness.sockets[0].emitMessage({
    op: 5,
    d: { eventType: 'InputVolumeChanged', eventData: { inputName: 'Mic' } },
  });
  expect(harness.changes).toEqual([]);
});

test('7. un message illisible ou incomplet ne lève pas et ne déclenche rien', () => {
  const harness = setup();
  expect(() => {
    harness.sockets[0].emitRaw('{{{ pas du json');
    harness.sockets[0].emitMessage({ op: 5, d: null });
    harness.sockets[0].emitMessage({ op: 5, d: { eventType: 'CurrentProgramSceneChanged', eventData: {} } });
  }).not.toThrow();
  expect(harness.changes).toEqual([]);
});

test('8. une fermeture programme une reconnexion avec recul croissant', () => {
  const harness = setup();
  harness.sockets[0].emitClose(1006);
  expect(harness.retries[0].delayMs).toBe(RECONNECT_DELAYS_MS[0]);

  harness.retries[0].callback();
  harness.sockets[1].emitClose(1006);
  expect(harness.retries[1].delayMs).toBe(RECONNECT_DELAYS_MS[1]);
});

test('9. une identification réussie remet le recul à zéro', () => {
  const harness = setup();
  harness.sockets[0].emitClose(1006);
  harness.retries[0].callback();
  harness.sockets[1].emitMessage({ op: 2, d: {} });
  harness.sockets[1].emitClose(1006);
  expect(harness.retries[1].delayMs).toBe(RECONNECT_DELAYS_MS[0]);
});

test('10. un mot de passe refusé arrête les tentatives et laisse une trace', () => {
  const harness = setup();
  harness.sockets[0].emitClose(4009);

  expect(harness.retries).toEqual([]);
  expect(harness.statuses.at(-1)).toEqual({ connected: false, reason: 'auth-rejected' });
  expect(harness.logs.join(' ')).toContain('OBS_WS_PASSWORD');
});

test('11. stop empêche toute reconnexion ultérieure', () => {
  const harness = setup();
  harness.client.stop();
  harness.sockets[0].emitClose(1006);
  expect(harness.retries).toEqual([]);
});

test('12. reconnectDelayMs plafonne sur la dernière valeur', () => {
  expect(reconnectDelayMs(0)).toBe(2000);
  expect(reconnectDelayMs(50)).toBe(30000);
});
