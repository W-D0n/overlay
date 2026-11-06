import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createOpsRoutes } from './ops-routes.js';
import { EXIT_RESTART, EXIT_STOP } from '../lifecycle/supervisor.js';

/** @type {string[]} */
const directories = [];
afterEach(() => { while (directories.length > 0) rmSync(/** @type {string} */ (directories.pop()), { recursive: true, force: true }); });

const ID_A = 'a'.repeat(32);
const ID_B = 'b'.repeat(32);
const connectedStatus = { connected: true, reason: null, scenes: ['Jeu', 'Pause'], activeScene: 'Jeu' };
const offlineStatus = { connected: false, reason: 'not-configured', scenes: [], activeScene: null };

function setup({ status = offlineStatus, configured = false, inspect = null, file = { scenes: [] }, readOk = true, assetList = async () => [], supervised = true, counts = {} } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-ops-'));
  directories.push(directory);
  const path = join(directory, 'state.json');
  const asked = [];
  const exits = [];
  const routes = createOpsRoutes({
    store: { path, read: async () => (readOk ? { ok: true, file } : { ok: false, errors: ['illisible'] }) },
    assets: { list: assetList },
    channels: { count: (channel, role) => { asked.push([channel, role]); return counts[`${channel}:${role}`] ?? 0; } },
    obs: { status: () => status, configured, inspect },
    control: { supervised, exit: (code) => exits.push(code) },
    staticPort: 5931,
  });
  const get = (route) => routes.get[route]();
  const post = (route, body, headers = {}) => routes.post[route](new Request('http://localhost/x', { method: 'POST', headers, body: JSON.stringify(body) }));
  return { routes, get, post, path, asked, exits };
}

const summary = { frames: 300, fps: 59.8, meanMs: 16.7, p95Ms: 17.5, worstMs: 30, overBudget: 1, share: 0.003 };
const report = { env: 'Source 1920×1080 · CEF', results: [{ id: 'base', label: 'Base', summary, verdict: 'ok' }] };

describe('les routes d’exploitation', () => {
  test('la table dit quelles routes elle tient, en lecture et en écriture', () => {
    const { routes } = setup();
    expect(Object.keys(routes.get).sort()).toEqual(['/bench-result', '/diagnostics', '/live-status', '/obs-status']);
    expect(Object.keys(routes.post).sort()).toEqual(['/bench-result', '/control/restart', '/control/stop']);
  });
});

describe('GET /obs-status et /live-status', () => {
  test('/obs-status rend l’état d’OBS et dit s’il est configuré', async () => {
    const { get } = setup({ status: connectedStatus, configured: true });
    expect(await (await get('/obs-status')).json()).toEqual({ ...connectedStatus, configured: true });
    expect(await (await setup().get('/obs-status')).json()).toEqual({ ...offlineStatus, configured: false });
  });

  test('/live-status compte les pages de rendu du canal d’état, pas les autres', async () => {
    const { get, asked } = setup({ counts: { 'state:render': 2, 'state:studio': 5 } });
    expect(await (await get('/live-status')).json()).toEqual({ renderPages: 2 });
    expect(asked).toEqual([['state', 'render']]);
  });

  test('les réponses portent les en-têtes CORS', async () => {
    const response = await setup().get('/obs-status');
    expect(response.headers.get('Access-Control-Allow-Origin')).not.toBeNull();
  });
});

describe('GET /diagnostics', () => {
  test('assemble l’état d’OBS, les pages de rendu, le port statique, la table scène → preset et l’usage des images', async () => {
    const file = { scenes: [], sceneMap: { Jeu: 'preset-1' }, current: { layers: [{ options: { asset: ID_A } }, { options: { asset: ID_B } }] } };
    const { get, asked } = setup({ status: offlineStatus, configured: true, file, assetList: async () => [{ id: ID_A }], counts: { 'state:render': 3 } });
    const body = await (await get('/diagnostics')).json();
    expect(body).toEqual({
      obs: { ...offlineStatus, configured: true },
      inspection: null,
      inspectionError: null,
      renderPages: 3,
      sceneMap: { Jeu: 'preset-1' },
      staticPort: 5931,
      assetUse: { referenced: 2, missing: 1 },
    });
    expect(asked).toEqual([['state', 'render']]);
  });

  test('connecté et inspectable : l’inspection est jointe ; sinon elle n’est même pas demandée', async () => {
    let calls = 0;
    const inspect = async () => { calls += 1; return { sources: [] }; };
    const connected = await (await setup({ status: connectedStatus, inspect }).get('/diagnostics')).json();
    expect(connected.inspection).toEqual({ sources: [] });
    expect(calls).toBe(1);
    await setup({ status: offlineStatus, inspect }).get('/diagnostics');
    expect(calls).toBe(1);
    const uninspectable = await (await setup({ status: connectedStatus, inspect: null }).get('/diagnostics')).json();
    expect(uninspectable.inspection).toBeNull();
    expect(uninspectable.inspectionError).toBeNull();
  });

  test('une inspection qui échoue donne son message, sans inspection ni erreur de la route', async () => {
    const inspect = async () => { throw new Error('OBS ne répond pas'); };
    const response = await setup({ status: connectedStatus, inspect }).get('/diagnostics');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.inspection).toBeNull();
    expect(body.inspectionError).toBe('OBS ne répond pas');
  });

  test('un fichier d’état illisible : pas de table, aucune image comptée', async () => {
    const body = await (await setup({ readOk: false, assetList: async () => [{ id: ID_A }] }).get('/diagnostics')).json();
    expect(body.sceneMap).toEqual({});
    expect(body.assetUse).toEqual({ referenced: 0, missing: 0 });
  });

  test('l’historique ne compte pas dans l’usage des images (il n’affiche rien à l’antenne)', async () => {
    const file = { scenes: [], current: { layers: [{ options: { asset: ID_A } }] }, history: [{ scene: { layers: [{ options: { asset: ID_B } }] } }] };
    const body = await (await setup({ file, assetList: async () => [] }).get('/diagnostics')).json();
    expect(body.assetUse).toEqual({ referenced: 1, missing: 1 });
  });

  test('une médiathèque illisible : toutes les images référencées manquent, la route répond quand même', async () => {
    const file = { scenes: [], current: { layers: [{ options: { asset: ID_A } }, { options: { asset: ID_B } }] } };
    const response = await setup({ file, assetList: async () => { throw new Error('disque'); } }).get('/diagnostics');
    expect(response.status).toBe(200);
    expect((await response.json()).assetUse).toEqual({ referenced: 2, missing: 2 });
  });

  test('une image référencée plusieurs fois compte une fois', async () => {
    const file = { scenes: [], current: { layers: [{ options: { asset: ID_A } }, { options: { asset: ID_A } }] } };
    const body = await (await setup({ file, assetList: async () => [{ id: ID_A }] }).get('/diagnostics')).json();
    expect(body.assetUse).toEqual({ referenced: 1, missing: 0 });
  });
});

describe('le rapport du banc de mesure', () => {
  test('aucun rapport : 404 avec son message', async () => {
    const response = await setup().get('/bench-result');
    expect(response.status).toBe(404);
    expect(await response.text()).toContain('aucun rapport');
  });

  test('un rapport valide est rangé à côté du fichier d’état, mis en forme, avec un retour à la ligne final, et se relit tel quel', async () => {
    const { get, post, path } = setup();
    const posted = await post('/bench-result', report);
    expect(posted.status).toBe(200);
    expect(await posted.json()).toEqual({ ok: true });
    const text = readFileSync(`${path}.bench.json`, 'utf8');
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "env"');
    const read = await get('/bench-result');
    expect(read.status).toBe(200);
    expect(read.headers.get('Content-Type')).toBe('application/json');
    expect(await read.json()).toMatchObject({ env: report.env, results: [{ id: 'base', verdict: 'ok' }] });
  });

  test('un rapport invalide est refusé (400) avec la raison, sans rien écrire', async () => {
    const { post, path } = setup();
    const response = await post('/bench-result', { env: 'e', results: [{ id: 'inconnu' }] });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('inconnu');
    expect(existsSync(`${path}.bench.json`)).toBe(false);
  });

  test('ce qui est rangé est le rapport validé, pas le corps reçu', async () => {
    const { post, path } = setup();
    await post('/bench-result', { ...report, extra: 'ignoré' });
    expect(readFileSync(`${path}.bench.json`, 'utf8')).not.toContain('ignoré');
  });
});

describe('POST /control/restart et /control/stop', () => {
  const header = { 'X-Overlay-Control': '1' };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  test('sans l’en-tête de contrôle : 400, et personne ne sort', async () => {
    const { post, exits } = setup();
    const response = await post('/control/restart', {});
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('X-Overlay-Control');
    await wait(150);
    expect(exits).toEqual([]);
  });

  test('hors du lanceur : 501, et personne ne sort', async () => {
    const { post, exits } = setup({ supervised: false });
    const response = await post('/control/stop', {}, header);
    expect(response.status).toBe(501);
    await wait(150);
    expect(exits).toEqual([]);
  });

  test('relancer : 202, puis la sortie « relance » après un court délai ; arrêter : la sortie « arrêt »', async () => {
    const restart = setup();
    const response = await restart.post('/control/restart', {}, header);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, action: 'restart' });
    expect(restart.exits).toEqual([]);
    await wait(180);
    expect(restart.exits).toEqual([EXIT_RESTART]);

    const stop = setup();
    const stopped = await stop.post('/control/stop', {}, header);
    expect(await stopped.json()).toEqual({ ok: true, action: 'stop' });
    await wait(180);
    expect(stop.exits).toEqual([EXIT_STOP]);
  });

  test('l’en-tête doit valoir exactement 1', async () => {
    const { post } = setup();
    expect((await post('/control/restart', {}, { 'X-Overlay-Control': '0' })).status).toBe(400);
    expect((await post('/control/restart', {}, { 'X-Overlay-Control': 'true' })).status).toBe(400);
  });
});
