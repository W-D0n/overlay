import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
      body: JSON.stringify({ name: 'Alpha', component: 'RainBackground', options: {} }),
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
      presets: [{ id: 'beta', name: 'Beta', component: 'BubbleBackground', options: {} }],
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
        component: 'BubbleBackground',
        requestedName: 'Beta',
        renamed: false,
        conflict: null,
        differences: [{ field: 'component', after: 'BubbleBackground' }],
      }],
    });
    expect(readFileSync(stateFile, 'utf8')).toBe(before);

    const concurrentSave = await fetch(`${baseUrl}/save-preset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Gamma', component: 'RainBackground', options: {} }),
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
  component: 'StarsParallaxBackground',
  options: { count: 40 },
};

async function startStateServer({ stateFile, obsUrl, obsPassword }) {
  const port = await reserveFreePort();
  const env = { ...process.env, BACKGROUND_STATE_PORT: String(port), BACKGROUND_STATE_FILE: stateFile };
  if (obsUrl !== undefined) env.OBS_WS_URL = obsUrl;
  env.OBS_WS_PASSWORD = obsPassword ?? '';
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
    expect(messages[0].component).toBe('StarsParallaxBackground');
    expect(JSON.parse(readFileSync(stateFile, 'utf8')).current.component).toBe('StarsParallaxBackground');

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
        component: 'RainBackground',
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
        component: 'RainBackground',
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
        component: 'RainBackground',
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
