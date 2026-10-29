import { describe, expect, test } from 'bun:test';
import { stopServers } from './stop-servers.js';

const TARGETS = [
  { name: 'statique', port: 5931 },
  { name: 'background-state', port: 5932 },
];

/**
 * Monde simulé : des ports tenus par des processus, un lanceur qui relance ses enfants tués, et un
 * journal de l'ordre des opérations.
 */
function createWorld({ launcher = true, honoursStop = true, foreignOnStatic = false } = {}) {
  const log = [];
  /** @type {Map<number, { pid: number, name: string }>} */
  const holders = new Map([
    [5931, { pid: foreignOnStatic ? 700 : 101, name: foreignOnStatic ? 'chrome.exe' : 'bun.exe' }],
    [5932, { pid: 102, name: 'bun.exe' }],
  ]);
  let launcherAlive = launcher;
  let nextPid = 200;

  const deps = {
    requestStop: async () => {
      log.push('requestStop');
      if (launcherAlive && honoursStop) { holders.clear(); launcherAlive = false; }
      return honoursStop;
    },
    isPortFree: (port) => !holders.has(port),
    listLaunchers: (holderPids) => (launcherAlive && holderPids.length > 0 ? [50] : []),
    pidOnPort: (port) => holders.get(port)?.pid ?? null,
    processName: (pid) => [...holders.values()].find((holder) => holder.pid === pid)?.name ?? null,
    kill: (pid) => {
      log.push(`kill ${pid}`);
      if (pid === 50) { launcherAlive = false; return; }
      for (const [port, holder] of holders) {
        if (holder.pid !== pid) continue;
        holders.delete(port);
        // Un lanceur encore vivant relance l'enfant tué : c'est ce que le kill manuel subissait.
        if (launcherAlive) holders.set(port, { pid: (nextPid += 1), name: 'bun.exe' });
      }
    },
    wait: async () => {},
  };
  return { deps, log, holders };
}

describe('arrêt des serveurs du projet', () => {
  test('rien à faire quand les ports sont libres : aucun kill, aucune requête', async () => {
    const { deps, log, holders } = createWorld();
    holders.clear();
    expect(await stopServers(TARGETS, deps)).toEqual({ released: [], foreign: [], stillBusy: [] });
    expect(log).toEqual([]);
  });

  test('le lanceur est d’abord prié de s’arrêter : aucun processus n’est tué', async () => {
    const { deps, log } = createWorld();
    const report = await stopServers(TARGETS, deps);
    expect(report.stillBusy).toEqual([]);
    expect(report.released).toEqual(TARGETS);
    expect(log).toEqual(['requestStop']);
  });

  test('sans réponse du lanceur, il est tué avant ses enfants, sinon il les relance', async () => {
    const { deps, log, holders } = createWorld({ honoursStop: false });
    const report = await stopServers(TARGETS, deps);
    expect(log.indexOf('kill 50')).toBeGreaterThan(-1);
    expect(log.indexOf('kill 50')).toBeLessThan(log.indexOf('kill 101'));
    expect(holders.size).toBe(0);
    expect(report.stillBusy).toEqual([]);
  });

  test('sans le tuer d’abord, tuer l’enfant le fait relancer : le port reste pris (cas rouge du kill manuel)', async () => {
    const { deps, holders } = createWorld({ honoursStop: false });
    deps.listLaunchers = () => [];
    deps.kill(101);
    expect(holders.get(5931)?.pid).not.toBe(101);
    expect(holders.has(5931)).toBe(true);
  });

  test('un port tenu par autre chose que bun.exe n’est pas touché et son détenteur est nommé', async () => {
    const { deps, log } = createWorld({ launcher: false, honoursStop: false, foreignOnStatic: true });
    const report = await stopServers(TARGETS, deps);
    expect(log).not.toContain('kill 700');
    expect(report.foreign).toEqual([{ target: TARGETS[0], pid: 700, processName: 'chrome.exe' }]);
    expect(report.stillBusy).toEqual([TARGETS[0]]);
    expect(report.released).toEqual([TARGETS[1]]);
  });

  test('un serveur orphelin sans lanceur est arrêté directement', async () => {
    const { deps, holders } = createWorld({ launcher: false, honoursStop: false });
    const report = await stopServers(TARGETS, deps);
    expect(holders.size).toBe(0);
    expect(report.released).toEqual(TARGETS);
  });
});
