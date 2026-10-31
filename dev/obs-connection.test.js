import { expect, test } from 'bun:test';
import { createObsConnection } from './obs-connection.js';

const silent = { info() {}, warn() {} };

/** Un faux client OBS qui garde les dépendances qu'on lui a données et dit s'il a été arrêté. */
function harness(settings = { url: 'ws://h:1', password: 'p' }) {
  /** @type {{ deps: any, stopped: boolean }[]} */
  const clients = [];
  const scenes = [];
  let resolveSettings = async () => settings;
  const connection = createObsConnection({
    resolve: () => resolveSettings(),
    onSceneChange: (name) => scenes.push(name),
    createClient: (deps) => {
      const client = { deps, stopped: false };
      clients.push(client);
      return { stop() { client.stopped = true; }, request: async (type) => `réponse ${type}` };
    },
    log: silent,
  });
  return { connection, clients, scenes, setResolve: (next) => { resolveSettings = next; } };
}

test('sans mot de passe aucun client n’est ouvert', async () => {
  const { connection, clients } = harness({ url: 'ws://h:1', password: '' });
  await connection.restart();
  expect(clients).toHaveLength(0);
  expect(connection.configured).toBe(false);
  expect(connection.status()).toMatchObject({ connected: false, reason: 'not-configured' });
});

test('avec un mot de passe, le client reçoit l’adresse et le mot de passe, et la connexion est « en cours »', async () => {
  const { connection, clients } = harness();
  await connection.restart();
  expect(clients).toHaveLength(1);
  expect(clients[0].deps.url).toBe('ws://h:1');
  expect(clients[0].deps.password).toBe('p');
  expect(connection.configured).toBe(true);
  expect(connection.status().reason).toBe('connecting');
});

test('redémarrer ferme l’ancien client et en ouvre un neuf avec les réglages du moment', async () => {
  const { connection, clients, setResolve } = harness();
  await connection.restart();
  setResolve(async () => ({ url: 'ws://autre:2', password: 'q' }));
  await connection.restart();
  expect(clients).toHaveLength(2);
  expect(clients[0].stopped).toBe(true);
  expect(clients[1].stopped).toBe(false);
  expect(clients[1].deps).toMatchObject({ url: 'ws://autre:2', password: 'q' });
});

test('redémarrer remet l’état à zéro (scènes, scène active, connexion)', async () => {
  const { connection, clients } = harness();
  await connection.restart();
  clients[0].deps.onStatus({ connected: true, reason: null });
  clients[0].deps.onScenes(['A', 'B']);
  clients[0].deps.onActiveScene('A');
  expect(connection.status()).toMatchObject({ connected: true, scenes: ['A', 'B'], activeScene: 'A' });
  await connection.restart();
  expect(connection.status()).toEqual({ connected: false, reason: 'connecting', scenes: [], activeScene: null });
});

test('les retours de l’ancien client sont ignorés après un redémarrage', async () => {
  const { connection, clients, scenes } = harness();
  await connection.restart();
  await connection.restart();
  clients[0].deps.onStatus({ connected: true, reason: null });
  clients[0].deps.onScenes(['vieille scène']);
  clients[0].deps.onSceneChange('vieille scène');
  expect(connection.status()).toMatchObject({ connected: false, scenes: [] });
  expect(scenes).toEqual([]);
});

test('le client courant renseigne l’état et transmet les changements de scène', async () => {
  const { connection, clients, scenes } = harness();
  await connection.restart();
  clients[0].deps.onStatus({ connected: false, reason: 'auth-rejected' });
  expect(connection.status().reason).toBe('auth-rejected');
  clients[0].deps.onStatus({ connected: true, reason: null });
  clients[0].deps.onSceneChange('Jeu');
  expect(scenes).toEqual(['Jeu']);
  expect(connection.status().activeScene).toBe('Jeu');
  clients[0].deps.onStatus({ connected: false, reason: 'closed' });
  expect(connection.status().activeScene).toBeNull();
});

test('deux redémarrages rapprochés : seul le dernier ouvre un client', async () => {
  const { connection, clients, setResolve } = harness();
  /** @type {(value: { url: string, password: string }) => void} */
  let releaseFirst = () => {};
  setResolve(() => new Promise((resolve) => { releaseFirst = resolve; }));
  const first = connection.restart();
  setResolve(async () => ({ url: 'ws://second:2', password: 'deux' }));
  await connection.restart();
  releaseFirst({ url: 'ws://first:1', password: 'un' });
  await first;
  expect(clients).toHaveLength(1);
  expect(clients[0].deps.url).toBe('ws://second:2');
});

test('des réglages illisibles ne font pas planter : non configuré, et le message est tenu', async () => {
  const { connection, clients, setResolve } = harness();
  setResolve(async () => { throw new Error('fichier illisible'); });
  await connection.restart();
  expect(clients).toHaveLength(0);
  expect(connection.status().reason).toBe('not-configured');
  expect(connection.configured).toBe(false);
});

test('request passe par le client courant, et refuse sans client', async () => {
  const { connection } = harness();
  await expect(connection.inspect()).rejects.toThrow('OBS non connecté');
  await connection.restart();
  const afterRestart = await connection.inspect().then(() => null, (error) => error.message);
  expect(afterRestart).not.toBe('OBS non connecté');
});

test('stop ferme le client et rend les retours tardifs sans effet', async () => {
  const { connection, clients } = harness();
  await connection.restart();
  connection.stop();
  expect(clients[0].stopped).toBe(true);
  clients[0].deps.onStatus({ connected: true, reason: null });
  expect(connection.status().connected).toBe(false);
});
