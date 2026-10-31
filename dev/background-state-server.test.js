import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FAKE_CLIENT_ID, startFakeTwitch } from './e2e/fake-twitch.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(10);
  }
  throw new Error('condition non atteinte dans le délai imparti');
}

/**
 * Port libre attribué par l'OS au moment du spawn. Un port dérivé du PID était réutilisé à
 * l'identique par deux exécutions rapprochées de `bun test` — le serveur de la précédente pouvait
 * encore relâcher le port et le nouveau enfant échouait à écouter.
 */
async function reserveFreePort() {
  const probe = Bun.serve({ port: 0, fetch: () => new Response('probe') });
  const { port } = probe;
  await probe.stop(true);
  return port;
}

async function waitForServer(baseUrl) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/state`);
      if (response.ok) return;
    } catch {
      // Le process enfant démarre encore.
    }
    await delay(20);
  }
  throw new Error(`serveur de test indisponible : ${baseUrl}`);
}

test('l’import est prévisualisé sans écriture puis protégé par sa révision', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-background-state-'));
  const stateFile = join(directory, 'state.json');
  const port = await reserveFreePort();
  const baseUrl = `http://localhost:${port}`;
  const child = Bun.spawn(['bun', 'dev/background-state-server.js'], {
    cwd: join(import.meta.dir, '..'),
    env: {
      ...process.env,
      BACKGROUND_STATE_PORT: String(port),
      BACKGROUND_STATE_FILE: stateFile,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  try {
    await waitForServer(baseUrl);
    const saved = await fetch(`${baseUrl}/save-preset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alpha', component: 'rain', options: {} }),
    });
    expect(saved.ok).toBe(true);
    const before = readFileSync(stateFile, 'utf8');

    const messages = [];
    const socket = new WebSocket(`ws://localhost:${port}/presets-ws`);
    socket.onmessage = (event) => messages.push(event.data);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });

    const rejected = await fetch(`${baseUrl}/import-presets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bundle: {
          format: 'overlay-background-presets',
          version: 1,
          presets: [{ id: 'invalide', name: 'Invalide', component: 'UnknownBackground', options: {} }],
        },
      }),
    });
    expect(rejected.status).toBe(400);
    await delay(60);
    expect(readFileSync(stateFile, 'utf8')).toBe(before);
    expect(messages).toEqual([]);

    const bundle = {
      format: 'overlay-background-presets',
      version: 1,
      presets: [{ id: 'beta', name: 'Beta', component: 'bubble', options: {} }],
    };
    const previewResponse = await fetch(`${baseUrl}/preview-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundle }),
    });
    expect(previewResponse.ok).toBe(true);
    const preview = await previewResponse.json();
    expect(preview).toEqual({
      revision: expect.stringMatching(/^[0-9a-f]{8}$/),
      created: 1,
      updated: 0,
      renamed: 0,
      unchanged: 0,
      changes: [{
        id: 'beta',
        operation: 'created',
        name: 'Beta',
        component: 'bubble',
        requestedName: 'Beta',
        renamed: false,
        conflict: null,
        differences: [{ field: 'component', after: 'bubble' }],
      }],
    });
    expect(readFileSync(stateFile, 'utf8')).toBe(before);

    const concurrentSave = await fetch(`${baseUrl}/save-preset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Gamma', component: 'rain', options: {} }),
    });
    expect(concurrentSave.ok).toBe(true);
    await delay(60);
    const afterConcurrentSave = readFileSync(stateFile, 'utf8');
    expect(messages).toHaveLength(1);

    const staleImport = await fetch(`${baseUrl}/import-presets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundle, expectedRevision: preview.revision }),
    });
    expect(staleImport.status).toBe(409);
    await delay(60);
    expect(readFileSync(stateFile, 'utf8')).toBe(afterConcurrentSave);
    expect(messages).toHaveLength(1);

    const refreshedPreviewResponse = await fetch(`${baseUrl}/preview-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundle }),
    });
    const refreshedPreview = await refreshedPreviewResponse.json();
    const acceptedImport = await fetch(`${baseUrl}/import-presets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundle, expectedRevision: refreshedPreview.revision }),
    });
    expect(acceptedImport.ok).toBe(true);
    await delay(60);
    const finalState = await (await fetch(`${baseUrl}/state`)).json();
    expect(finalState.presets.map(({ id }) => id)).toEqual(['alpha', 'gamma', 'beta']);
    expect(messages.map((message) => JSON.parse(message).action)).toEqual(['saved', 'imported']);
    socket.close();
  } finally {
    child.kill();
    await child.exited;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('POST /event valide diffuse une fois sans toucher le fichier ; invalide → 400 sans diffusion', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-background-event-'));
  const stateFile = join(directory, 'state.json');
  const port = await reserveFreePort();
  const baseUrl = `http://localhost:${port}`;
  const child = Bun.spawn(['bun', 'dev/background-state-server.js'], {
    cwd: join(import.meta.dir, '..'),
    env: { ...process.env, BACKGROUND_STATE_PORT: String(port), BACKGROUND_STATE_FILE: stateFile },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  try {
    await waitForServer(baseUrl);
    const before = await (await fetch(`${baseUrl}/state`)).text();

    const messages = [];
    const socket = new WebSocket(`ws://localhost:${port}/event-ws`);
    socket.onmessage = (event) => messages.push(event.data);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

    const invalid = await fetch(`${baseUrl}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'donation' }),
    });
    expect(invalid.status).toBe(400);
    await delay(60);
    expect(messages).toEqual([]);

    const valid = await fetch(`${baseUrl}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'raid', username: 'z' }),
    });
    expect(valid.ok).toBe(true);
    await waitFor(() => messages.length === 1);
    expect(JSON.parse(messages[0])).toEqual({ type: 'raid', username: 'z' });

    const after = await (await fetch(`${baseUrl}/state`)).text();
    expect(after).toBe(before);
    socket.close();
  } finally {
    child.kill();
    await child.exited;
    rmSync(directory, { recursive: true, force: true });
  }
});

/**
 * Faux OBS : un vrai serveur WebSocket local qui rejoue le protocole v5 (HELLO → IDENTIFIED →
 * événement de scène). Sert à vérifier le branchement du serveur d'état sans OBS installé.
 */
function startFakeObs() {
  const connections = [];
  const server = Bun.serve({
    port: 0,
    fetch(req, srv) {
      if (srv.upgrade(req)) return undefined;
      return new Response('ws only', { status: 400 });
    },
    websocket: {
      open(ws) {
        connections.push(ws);
        ws.send(JSON.stringify({ op: 0, d: { rpcVersion: 1, authentication: { salt: 's==', challenge: 'c==' } } }));
      },
      message(ws, raw) {
        const message = JSON.parse(String(raw));
        if (message.op === 1) ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
        if (message.op === 6) {
          ws.send(JSON.stringify({
            op: 7,
            d: { requestId: message.d.requestId, responseData: { scenes: [{ sceneName: 'Discussion' }] } },
          }));
        }
      },
      close(ws) {
        const index = connections.indexOf(ws);
        if (index !== -1) connections.splice(index, 1);
      },
    },
  });
  return {
    url: `ws://127.0.0.1:${server.port}`,
    connections,
    changeScene(sceneName) {
      for (const ws of connections) {
        ws.send(JSON.stringify({ op: 5, d: { eventType: 'CurrentProgramSceneChanged', eventData: { sceneName } } }));
      }
    },
    stop() { server.stop(true); },
  };
}

/** Sans `id` : `/save-preset` crée le preset et dérive l'identifiant du nom (un `id` fourni
 * signifie « mettre à jour un preset existant » et échoue en 404 s'il n'existe pas). */
const PRESET_FOR_SCENE = {
  name: 'Ambiance nuit',
  component: 'stars-parallax',
  options: { count: 40 },
};

async function startStateServer({ stateFile, obsUrl, obsPassword, extraEnv = {} }) {
  const port = await reserveFreePort();
  const env = { ...process.env, BACKGROUND_STATE_PORT: String(port), BACKGROUND_STATE_FILE: stateFile };
  if (obsUrl !== undefined) env.OBS_WS_URL = obsUrl;
  env.OBS_WS_PASSWORD = obsPassword ?? '';
  Object.assign(env, extraEnv);
  const child = Bun.spawn(['bun', 'dev/background-state-server.js'], {
    cwd: join(import.meta.dir, '..'),
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const baseUrl = `http://localhost:${port}`;
  await waitForServer(baseUrl);
  return { child, baseUrl, port };
}

test('POST /scene-map refuse une table invalide et accepte une table valide', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-scene-map-'));
  const stateFile = join(directory, 'state.json');
  const { child, baseUrl } = await startStateServer({ stateFile });

  try {
    const invalid = await fetch(`${baseUrl}/scene-map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneMap: { Discussion: 42 } }),
    });
    expect(invalid.status).toBe(400);
    // Un refus n'écrit rien : le fichier peut ne pas exister encore, c'est le comportement attendu.
    expect(existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')).sceneMap ?? {} : {}).toEqual({});

    const valid = await fetch(`${baseUrl}/scene-map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneMap: { Discussion: 'ambiance-nuit' } }),
    });
    expect(valid.ok).toBe(true);
    expect(JSON.parse(readFileSync(stateFile, 'utf8')).sceneMap).toEqual({ Discussion: 'ambiance-nuit' });
  } finally {
    child.kill();
    await child.exited;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('sans mot de passe OBS, aucune connexion n’est tentée', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-scene-map-off-'));
  const stateFile = join(directory, 'state.json');
  const fakeObs = startFakeObs();
  const { child } = await startStateServer({ stateFile, obsUrl: fakeObs.url, obsPassword: '' });

  try {
    await delay(400);
    expect(fakeObs.connections.length).toBe(0);
  } finally {
    child.kill();
    await child.exited;
    fakeObs.stop();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('une scène associée applique son preset et le diffuse ; une scène inconnue ne change rien', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-scene-map-on-'));
  const stateFile = join(directory, 'state.json');
  const fakeObs = startFakeObs();
  const { child, baseUrl, port } = await startStateServer({
    stateFile,
    obsUrl: fakeObs.url,
    obsPassword: 'secret',
  });

  try {
    const saved = await fetch(`${baseUrl}/save-preset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(PRESET_FOR_SCENE),
    });
    expect(saved.ok).toBe(true);
    const mapped = await fetch(`${baseUrl}/scene-map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneMap: { Discussion: 'ambiance-nuit' } }),
    });
    expect(mapped.ok).toBe(true);

    const messages = [];
    const socket = new WebSocket(`ws://localhost:${port}/state-ws`);
    socket.onmessage = (event) => messages.push(JSON.parse(event.data));
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

    await waitFor(() => fakeObs.connections.length > 0, 3000);
    fakeObs.changeScene('Discussion');
    await waitFor(() => messages.length === 1, 3000);
    expect(messages[0].component).toBe('stars-parallax');
    expect(JSON.parse(readFileSync(stateFile, 'utf8')).current.layers[0].kind).toBe('stars-parallax');

    const before = readFileSync(stateFile, 'utf8');
    fakeObs.changeScene('Scene sans association');
    await delay(300);
    expect(messages.length).toBe(1);
    expect(readFileSync(stateFile, 'utf8')).toBe(before);
    socket.close();
  } finally {
    child.kill();
    await child.exited;
    fakeObs.stop();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('la transition d’un preset survit à l’enregistrement et aux mises à jour partielles', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-preset-transition-'));
  const stateFile = join(directory, 'state.json');
  const { child, baseUrl } = await startStateServer({ stateFile });

  try {
    const created = await fetch(`${baseUrl}/save-preset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Balayage',
        component: 'rain',
        options: {},
        transition: { type: 'wipe', durationMs: 400, direction: 'up' },
      }),
    });
    expect(created.ok).toBe(true);

    const afterCreate = await (await fetch(`${baseUrl}/state`)).json();
    expect(afterCreate.presets[0].transition).toEqual({ type: 'wipe', durationMs: 400, direction: 'up' });

    // Mise à jour qui ne parle pas de transition : elle doit être conservée, comme les tags.
    const updated = await fetch(`${baseUrl}/save-preset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: afterCreate.presets[0].id,
        name: 'Balayage',
        component: 'rain',
        options: { speed: 2 },
      }),
    });
    expect(updated.ok).toBe(true);

    const afterUpdate = await (await fetch(`${baseUrl}/state`)).json();
    expect(afterUpdate.presets[0].transition).toEqual({ type: 'wipe', durationMs: 400, direction: 'up' });
  } finally {
    child.kill();
    await child.exited;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('une transition invalide est refusée à l’enregistrement du preset', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-preset-transition-ko-'));
  const stateFile = join(directory, 'state.json');
  const { child, baseUrl } = await startStateServer({ stateFile });

  try {
    const response = await fetch(`${baseUrl}/save-preset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Cassé',
        component: 'rain',
        options: {},
        transition: { type: 'morph' },
      }),
    });
    expect(response.status).toBe(400);
  } finally {
    child.kill();
    await child.exited;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('une page web étrangère ne peut ni lire ni modifier l’état, ni ouvrir un WebSocket', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-background-state-'));
  const stateFile = join(directory, 'state.json');
  const port = await reserveFreePort();
  const baseUrl = `http://localhost:${port}`;
  const child = Bun.spawn(['bun', 'dev/background-state-server.js'], {
    cwd: join(import.meta.dir, '..'),
    env: { ...process.env, BACKGROUND_STATE_PORT: String(port), BACKGROUND_STATE_FILE: stateFile },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  try {
    await waitForServer(baseUrl);
    const foreign = { Origin: 'https://evil.example', 'Content-Type': 'application/json' };

    const write = await fetch(`${baseUrl}/save-preset`, {
      method: 'POST',
      headers: foreign,
      body: JSON.stringify({ name: 'Intrus', component: 'rain', options: {} }),
    });
    expect(write.status).toBe(403);

    const read = await fetch(`${baseUrl}/state`, { headers: { Origin: 'https://evil.example' } });
    expect(read.status).toBe(403);

    const rebinding = await fetch(`${baseUrl}/state`, { headers: { Host: 'evil.example' } });
    expect(rebinding.status).toBe(403);

    const socketOpened = await new Promise((resolve) => {
      const socket = new WebSocket(`ws://localhost:${port}/state-ws`, { headers: { Origin: 'https://evil.example' } });
      socket.onopen = () => { socket.close(); resolve(true); };
      socket.onerror = () => resolve(false);
    });
    expect(socketOpened).toBe(false);

    const local = await fetch(`${baseUrl}/state`, { headers: { Origin: 'http://localhost:5931' } });
    expect(local.status).toBe(200);
    expect((await local.json()).presets.some(({ name }) => name === 'Intrus')).toBe(false);
  } finally {
    child.kill();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('un fichier d’état version 1 est migré en version 4 et sauvegardé une seule fois avant toute écriture', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-background-state-'));
  const stateFile = join(directory, 'state.json');
  const original = JSON.stringify({
    current: { component: 'RainBackground', options: { audioReactive: 'Oui', speed: 1 } },
    presets: [{ id: 'calme', name: 'Calme', component: 'BubbleBackground', options: { audioReactive: 'Non' } }],
  }, null, 2);
  await Bun.write(stateFile, original);
  const port = await reserveFreePort();
  const baseUrl = `http://localhost:${port}`;
  const child = Bun.spawn(['bun', 'dev/background-state-server.js'], {
    cwd: join(import.meta.dir, '..'),
    env: { ...process.env, BACKGROUND_STATE_PORT: String(port), BACKGROUND_STATE_FILE: stateFile },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  try {
    await waitForServer(baseUrl);
    const state = await (await fetch(`${baseUrl}/state`)).json();
    expect(state.version).toBe(4);
    expect(state.current.options.audioReactive).toBe(true);
    expect(state.presets[0].options.audioReactive).toBe(false);

    const backup = `${stateFile}.pre-v4.bak`;
    expect(existsSync(backup)).toBe(true);
    expect(readFileSync(backup, 'utf8')).toBe(original);

    // Une écriture ultérieure ne doit jamais écraser la sauvegarde d'origine.
    await fetch(`${baseUrl}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current: { component: 'RainBackground', options: { speed: 3 } } }),
    });
    expect(readFileSync(backup, 'utf8')).toBe(original);
    const rewritten = JSON.parse(readFileSync(stateFile, 'utf8'));
    expect(rewritten.version).toBe(4);
    expect(rewritten.scenes.map((scene) => scene.id)).toEqual(['calme']);
    expect(rewritten.presets).toBeUndefined();
  } finally {
    child.kill();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('un client qui envoie encore l’ancien nom d’effet ou « Oui » est stocké sous la forme persistée', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-background-state-'));
  const stateFile = join(directory, 'state.json');
  const port = await reserveFreePort();
  const baseUrl = `http://localhost:${port}`;
  const child = Bun.spawn(['bun', 'dev/background-state-server.js'], {
    cwd: join(import.meta.dir, '..'),
    env: { ...process.env, BACKGROUND_STATE_PORT: String(port), BACKGROUND_STATE_FILE: stateFile },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  try {
    await waitForServer(baseUrl);
    const post = (path, body) => fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post('/state', { current: { component: 'RainBackground', options: { audioReactive: 'Oui' } } })).status).toBe(200);
    expect((await post('/save-preset', { name: 'Ancien', component: 'BubbleBackground', options: { audioReactive: 'Non' } })).status).toBe(200);
    const stored = JSON.parse(readFileSync(stateFile, 'utf8'));
    expect(stored.current.layers).toEqual([expect.objectContaining({ kind: 'rain', options: { audioReactive: true } }), expect.objectContaining({ kind: 'branding' })]);
    expect(stored.scenes[0].layers[0]).toMatchObject({ kind: 'bubble', options: { audioReactive: false } });
  } finally {
    child.kill();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('le serveur rejette un type d’option invalide et ramène un nombre hors bornes dans ses bornes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-background-state-'));
  const stateFile = join(directory, 'state.json');
  const port = await reserveFreePort();
  const baseUrl = `http://localhost:${port}`;
  const child = Bun.spawn(['bun', 'dev/background-state-server.js'], {
    cwd: join(import.meta.dir, '..'),
    env: { ...process.env, BACKGROUND_STATE_PORT: String(port), BACKGROUND_STATE_FILE: stateFile },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  try {
    await waitForServer(baseUrl);
    const post = (path, body) => fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    const rejected = await post('/state', { current: { component: 'rain', options: { speed: 'abc' } } });
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error).toContain('speed : nombre attendu');

    const saved = await post('/save-preset', { name: 'Trop', component: 'bubble', options: { count: 9999 } });
    expect(saved.status).toBe(200);
    expect(JSON.parse(readFileSync(stateFile, 'utf8')).scenes[0].layers[0].options.count).toBe(200);

    const rejectedPreset = await post('/save-preset', { name: 'Faux', component: 'bubble', options: { count: 'beaucoup' } });
    expect(rejectedPreset.status).toBe(400);
  } finally {
    child.kill();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('GET /live-status compte les pages de rendu connectées, pas les pages du Studio', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-background-state-'));
  const port = await reserveFreePort();
  const baseUrl = `http://localhost:${port}`;
  const child = Bun.spawn(['bun', 'dev/background-state-server.js'], {
    cwd: join(import.meta.dir, '..'),
    env: { ...process.env, BACKGROUND_STATE_PORT: String(port), BACKGROUND_STATE_FILE: join(directory, 'state.json') },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const open = (path) => new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${port}${path}`);
    socket.onopen = () => resolve(socket);
    socket.onerror = reject;
  });
  const renderPages = async () => (await (await fetch(`${baseUrl}/live-status`)).json()).renderPages;
  try {
    await waitForServer(baseUrl);
    expect(await renderPages()).toBe(0);

    const studio = await open('/state-ws');
    expect(await renderPages()).toBe(0);

    const render = await open('/state-ws?role=render');
    await open('/presets-ws?role=render');
    expect(await renderPages()).toBe(1);

    render.close();
    let remaining = await renderPages();
    for (let attempt = 0; attempt < 100 && remaining !== 0; attempt += 1) {
      await delay(30);
      remaining = await renderPages();
    }
    expect(remaining).toBe(0);
    studio.close();
  } finally {
    child.kill();
    await child.exited;
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('contrôle depuis le Studio (arrêt et redémarrage)', () => {
  async function startServer(extraEnv) {
    const directory = mkdtempSync(join(tmpdir(), 'overlay-background-state-'));
    const port = await reserveFreePort();
    const baseUrl = `http://localhost:${port}`;
    const child = Bun.spawn(['bun', 'dev/background-state-server.js'], {
      cwd: join(import.meta.dir, '..'),
      env: { ...process.env, BACKGROUND_STATE_PORT: String(port), BACKGROUND_STATE_FILE: join(directory, 'state.json'), ...extraEnv },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await waitForServer(baseUrl);
    const post = (path, headers = { 'X-Overlay-Control': '1' }) => fetch(`${baseUrl}${path}`, { method: 'POST', headers });
    const cleanup = () => { child.kill(); rmSync(directory, { recursive: true, force: true }); };
    return { child, post, baseUrl, cleanup };
  }

  test('supervisé : /control/stop répond 202 puis le serveur sort avec le code 0', async () => {
    const { child, post, cleanup } = await startServer({ OVERLAY_SUPERVISED: '1' });
    try {
      expect((await post('/control/stop')).status).toBe(202);
      expect(await child.exited).toBe(0);
    } finally { cleanup(); }
  });

  test('supervisé : /control/restart répond 202 puis le serveur sort avec le code 75', async () => {
    const { child, post, cleanup } = await startServer({ OVERLAY_SUPERVISED: '1' });
    try {
      expect((await post('/control/restart')).status).toBe(202);
      expect(await child.exited).toBe(75);
    } finally { cleanup(); }
  });

  test('sans l’en-tête de contrôle, la demande est refusée et le serveur reste en vie', async () => {
    const { child, post, cleanup } = await startServer({ OVERLAY_SUPERVISED: '1' });
    try {
      expect((await post('/control/stop', {})).status).toBe(400);
      await delay(400);
      expect(child.exitCode).toBeNull();
    } finally { cleanup(); }
  });

  test('hors lanceur : 501 et le serveur reste en vie (personne ne le relancerait)', async () => {
    const { child, post, cleanup } = await startServer({ OVERLAY_SUPERVISED: '' });
    try {
      expect((await post('/control/restart')).status).toBe(501);
      await delay(400);
      expect(child.exitCode).toBeNull();
    } finally { cleanup(); }
  });

  test('une page d’une autre origine ne peut pas arrêter le serveur', async () => {
    const { child, baseUrl, cleanup } = await startServer({ OVERLAY_SUPERVISED: '1' });
    try {
      const response = await fetch(`${baseUrl}/control/stop`, {
        method: 'POST',
        headers: { 'X-Overlay-Control': '1', Origin: 'https://evil.example' },
      });
      expect(response.status).toBe(403);
      await delay(400);
      expect(child.exitCode).toBeNull();
    } finally { cleanup(); }
  });
});

test('le mot de passe saisi dans le Studio est relu au démarrage : OBS se connecte sans variable d’environnement', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-connections-boot-'));
  const stateFile = join(directory, 'state.json');
  const fakeObs = startFakeObs();
  writeFileSync(`${stateFile}.connections.json`, JSON.stringify({ obs: { url: fakeObs.url, password: 'saisi-dans-le-studio' } }));
  const { child, baseUrl } = await startStateServer({ stateFile, obsPassword: '' });

  try {
    await waitFor(() => fakeObs.connections.length > 0, 3000);
    const view = (await (await fetch(`${baseUrl}/connections`)).json()).obs;
    expect(view).toMatchObject({ passwordSet: true, source: 'settings', url: fakeObs.url });
    expect(JSON.stringify(view)).not.toContain('saisi-dans-le-studio');
  } finally {
    child.kill();
    await child.exited;
    fakeObs.stop();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('POST /connections/obs reconnecte le serveur en marche sans le relancer', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-connections-live-'));
  const stateFile = join(directory, 'state.json');
  const fakeObs = startFakeObs();
  const { child, baseUrl } = await startStateServer({ stateFile, obsPassword: '' });

  try {
    await delay(300);
    expect(fakeObs.connections.length).toBe(0);
    const saved = await fetch(`${baseUrl}/connections/obs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Overlay-Control': '1' },
      body: JSON.stringify({ url: fakeObs.url, password: 'nouveau' }),
    });
    expect(saved.status).toBe(200);
    await waitFor(() => fakeObs.connections.length > 0, 3000);
    let connected = false;
    for (let attempt = 0; attempt < 100 && !connected; attempt += 1) {
      connected = (await (await fetch(`${baseUrl}/obs-status`)).json()).connected === true;
      if (!connected) await delay(30);
    }
    expect(connected).toBe(true);
    expect(JSON.parse(readFileSync(`${stateFile}.connections.json`, 'utf8')).obs.password).toBe('nouveau');
  } finally {
    child.kill();
    await child.exited;
    fakeObs.stop();
    rmSync(directory, { recursive: true, force: true });
  }
});

/** Un serveur d'état dont les trois adresses de Twitch pointent vers le faux Twitch, avec des jetons déjà rangés comme après une connexion antérieure. */
async function startWithStoredTwitch({ expiresInMs }) {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-twitch-boot-'));
  const stateFile = join(directory, 'state.json');
  const twitch = startFakeTwitch();
  const granted = twitch.grant();
  writeFileSync(`${stateFile}.connections.json`, JSON.stringify({
    twitch: { clientId: FAKE_CLIENT_ID, accessToken: granted.access_token, refreshToken: granted.refresh_token, expiresAt: Date.now() + expiresInMs, userId: '42', login: 'mozaik', scopes: ['moderator:read:followers', 'channel:read:subscriptions', 'bits:read'] },
  }));
  const server = await startStateServer({ stateFile, obsPassword: '', extraEnv: { TWITCH_ID_URL: twitch.idUrl, TWITCH_API_URL: twitch.apiUrl, TWITCH_EVENTSUB_URL: twitch.eventSubUrl } });
  const until = async (condition, attempts = 200) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (condition()) return true;
      await delay(25);
    }
    return false;
  };
  const cleanup = async () => {
    server.child.kill();
    await server.child.exited;
    twitch.stop();
    rmSync(directory, { recursive: true, force: true });
  };
  return { ...server, twitch, granted, stateFile, until, cleanup };
}

test('Twitch déjà connecté : au démarrage, le serveur rouvre la session EventSub sans nouvelle autorisation', async () => {
  const { baseUrl, twitch, granted, until, cleanup } = await startWithStoredTwitch({ expiresInMs: 4 * 3_600_000 });
  try {
    expect(await until(() => twitch.log.subscriptions.length === 6)).toBe(true);
    expect(twitch.log.subscriptions.every((entry) => entry.token === granted.access_token)).toBe(true);
    expect(twitch.log.refreshes).toHaveLength(0);
    expect(twitch.log.deviceRequests).toHaveLength(0);
    const view = (await (await fetch(`${baseUrl}/connections`)).json()).twitch;
    expect(view).toMatchObject({ loggedIn: true, login: 'mozaik', phase: 'connected', subscriptions: 6 });
    expect(JSON.stringify(view)).not.toContain(granted.access_token);
  } finally {
    await cleanup();
  }
});

test('Twitch : un jeton près d’expirer est rafraîchi au démarrage, avant la session, et le neuf est gardé dans le fichier', async () => {
  const { twitch, granted, stateFile, until, cleanup } = await startWithStoredTwitch({ expiresInMs: 60_000 });
  try {
    expect(await until(() => twitch.log.subscriptions.length === 6)).toBe(true);
    expect(twitch.log.refreshes).toHaveLength(1);
    expect(twitch.log.refreshes[0].refresh_token).toBe(granted.refresh_token);
    const stored = JSON.parse(readFileSync(`${stateFile}.connections.json`, 'utf8')).twitch;
    expect(stored.accessToken).not.toBe(granted.access_token);
    expect(twitch.log.subscriptions.every((entry) => entry.token === stored.accessToken)).toBe(true);
  } finally {
    await cleanup();
  }
});
