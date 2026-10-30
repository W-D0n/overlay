// @ts-check
/**
 * dev/e2e/stack.js — Une pile de serveurs d'essai pour les essais de bout en bout : le vrai serveur statique et le vrai
 * serveur d'état, sur des ports attribués par le système et avec un fichier d'état jetable. Jamais les ports de l'owner
 * (5931/5932), jamais son fichier d'état.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..');

/** @returns {number} un port libre attribué par le système */
function freePort() {
  const probe = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
  const { port } = probe;
  probe.stop(true);
  return port;
}

/** @param {string} url @param {number} timeoutMs */
async function untilServing(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Pas encore à l'écoute.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`serveur d'essai injoignable : ${url}`);
}

export async function startStack() {
  const directory = mkdtempSync(join(tmpdir(), 'overlay-e2e-state-'));
  const staticPort = freePort();
  const statePort = freePort();
  const env = { ...process.env, STATIC_PORT: String(staticPort), BACKGROUND_STATE_PORT: String(statePort), BACKGROUND_STATE_FILE: join(directory, 'state.json') };
  const spawn = (/** @type {string} */ script) => Bun.spawn([process.execPath, join(ROOT, 'dev', script)], { env, cwd: ROOT, stdout: 'ignore', stderr: 'ignore' });
  const processes = [spawn('background-state-server.js'), spawn('static-server.js')];
  try {
    await untilServing(`http://localhost:${statePort}/state`, 15_000);
    await untilServing(`http://localhost:${staticPort}/dev/studio.html`, 15_000);
  } catch (error) {
    for (const child of processes) child.kill();
    throw error;
  }
  const base = `http://localhost:${statePort}`;

  return {
    staticPort,
    statePort,
    /** @param {string} path @param {unknown} [body] */
    async api(path, body) {
      const response = await fetch(`${base}${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return response.json().catch(() => ({}));
    },
    /** Remet le fichier d'état à son départ : le serveur le relit à chaque requête. */
    reset() {
      rmSync(join(directory, 'state.json'), { force: true });
      rmSync(join(directory, 'state.json.pre-v4.bak'), { force: true });
    },
    async stop() {
      for (const child of processes) child.kill();
      await Promise.all(processes.map((child) => child.exited));
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
