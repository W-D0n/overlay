import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

test('POST /import-presets invalide ne touche ni au fichier ni au WebSocket', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-background-state-'));
  const stateFile = join(directory, 'state.json');
  const port = 42000 + (process.pid % 10000);
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
    socket.close();
  } finally {
    child.kill();
    await child.exited;
    rmSync(directory, { recursive: true, force: true });
  }
});
