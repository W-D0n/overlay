import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isPortFree } from './port-check.js';
import { STATIC_PORT, BACKGROUND_STATE_PORT } from '../ports.config.js';

// Cycle de vie réel : de vrais serveurs, supervisés par le vrai lanceur, arrêtés par les vrais scripts.
// Les doublures de stop-servers.test.js prouvent l'ordre des gestes ; ce fichier prouve que les ports
// sont réellement libérés, ce qui est la seule chose qui compte pour la personne qui lance kill-servers.
// Ports d'essai uniquement : le projet ne touche jamais aux serveurs de l'owner (5931/5932 par défaut).

const ROOT = join(import.meta.dir, '..');
const WINDOWS_ONLY = process.platform === 'win32';
const WAIT_STEP_MS = 200;

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {() => boolean | Promise<boolean>} condition @param {number} timeoutMs */
async function until(condition, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return true;
    await sleep(WAIT_STEP_MS);
  }
  return false;
}

/** @returns {number} un port libre attribué par le système, jamais un port du projet */
function freePort() {
  const probe = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
  const { port } = probe;
  probe.stop(true);
  return port;
}

/** @param {number} port @returns {number | null} */
function pidOnPort(port) {
  const out = Bun.spawnSync(['netstat', '-ano', '-p', 'TCP']).stdout.toString();
  for (const line of out.split('\n')) {
    const match = line.match(/^\s*TCP\s+\S*:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
    if (match && Number(match[1]) === port) return Number(match[2]);
  }
  return null;
}

/** @type {{ launcher: import('bun').Subprocess | null, dir: string | null }} */
const live = { launcher: null, dir: null };

afterEach(() => {
  live.launcher?.kill();
  live.launcher = null;
  if (live.dir !== null) rmSync(live.dir, { recursive: true, force: true });
  live.dir = null;
});

/** Lance `start-stream.js` sur des ports d'essai avec une copie jetable du fichier d'état. */
async function startLauncher() {
  const staticPort = freePort();
  const statePort = freePort();
  expect([staticPort, statePort]).not.toContain(STATIC_PORT);
  expect([staticPort, statePort]).not.toContain(BACKGROUND_STATE_PORT);
  live.dir = mkdtempSync(join(tmpdir(), 'overlay-lifecycle-'));
  const stateFile = join(live.dir, 'background-state.json');
  if (existsSync(join(ROOT, 'dev', 'data', 'background-state.json'))) copyFileSync(join(ROOT, 'dev', 'data', 'background-state.json'), stateFile);
  const env = {
    ...process.env,
    STATIC_PORT: String(staticPort),
    BACKGROUND_STATE_PORT: String(statePort),
    BACKGROUND_STATE_FILE: stateFile,
  };
  live.launcher = Bun.spawn(['bun', 'dev/start-stream.js'], { cwd: ROOT, env, stdout: 'ignore', stderr: 'ignore' });
  const up = await until(() => !isPortFree(staticPort) && !isPortFree(statePort), 15000);
  expect(up).toBe(true);
  return { env, staticPort, statePort };
}

/** @param {Record<string, string | undefined>} env */
function runKillServers(env) {
  return Bun.spawnSync(['bun', 'dev/kill-servers.js'], { cwd: ROOT, env, timeout: 30000 });
}

describe.skipIf(!WINDOWS_ONLY)('cycle de vie des serveurs (processus réels, ports d’essai)', () => {
  test('kill-servers libère les deux ports et le lanceur sort, sans que personne ne relance', async () => {
    const { env, staticPort, statePort } = await startLauncher();
    runKillServers(env);
    expect(await until(() => isPortFree(staticPort) && isPortFree(statePort), 10000)).toBe(true);
    expect(await until(() => live.launcher?.killed === true || live.launcher?.exitCode !== null, 5000)).toBe(true);
    await sleep(4000);
    expect(isPortFree(staticPort) && isPortFree(statePort)).toBe(true);
  }, 60000);

  test('un serveur tué à la main est relancé par le lanceur, et kill-servers libère quand même les ports', async () => {
    const { env, staticPort, statePort } = await startLauncher();
    const before = pidOnPort(staticPort);
    expect(before).not.toBeNull();
    Bun.spawnSync(['taskkill', '/F', '/PID', String(before)]);
    const relaunched = await until(() => {
      const now = pidOnPort(staticPort);
      return now !== null && now !== before;
    }, 15000);
    expect(relaunched).toBe(true);
    runKillServers(env);
    expect(await until(() => isPortFree(staticPort) && isPortFree(statePort), 10000)).toBe(true);
    await sleep(4000);
    expect(isPortFree(staticPort) && isPortFree(statePort)).toBe(true);
  }, 60000);

  test('POST /control/restart change les deux processus et rend les ports ; /control/stop les libère', async () => {
    const { staticPort, statePort } = await startLauncher();
    const beforeStatic = pidOnPort(staticPort);
    const beforeState = pidOnPort(statePort);
    const post = (action) => fetch(`http://127.0.0.1:${statePort}/control/${action}`, { method: 'POST', headers: { 'X-Overlay-Control': '1' } });
    expect((await post('restart')).status).toBe(202);
    const restarted = await until(() => {
      const a = pidOnPort(staticPort);
      const b = pidOnPort(statePort);
      return a !== null && b !== null && a !== beforeStatic && b !== beforeState;
    }, 20000);
    expect(restarted).toBe(true);
    expect((await post('stop')).status).toBe(202);
    expect(await until(() => isPortFree(staticPort) && isPortFree(statePort), 10000)).toBe(true);
  }, 60000);
});
