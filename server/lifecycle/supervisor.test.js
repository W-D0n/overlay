import { describe, expect, test } from 'bun:test';
import { createSupervisor, EXIT_RESTART, EXIT_STOP } from './supervisor.js';

const SERVERS = [
  { name: 'statique', cmd: ['a'], port: 1 },
  { name: 'etat', cmd: ['b'], port: 2 },
];

function setup(options = {}) {
  /** @type {{ name: string, killed: boolean, exit: (code: number) => void }[]} */
  const processes = [];
  const exits = [];
  const logs = [];
  const supervisor = createSupervisor({
    servers: SERVERS,
    spawn: (server) => {
      let exit = () => {};
      const exited = new Promise((resolve) => { exit = resolve; });
      const child = { name: server.name, killed: false, exit, exited, kill() { this.killed = true; exit(137); } };
      processes.push(child);
      return child;
    },
    log: (message) => logs.push(message),
    onExit: (code) => exits.push(code),
    ...options,
  });
  const alive = () => processes.filter(({ killed }) => !killed);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { supervisor, processes, exits, logs, alive, settle };
}

describe('supervision par code de sortie', () => {
  test('tous les serveurs sont lancés au démarrage', () => {
    const { supervisor, processes } = setup();
    supervisor.start();
    expect(processes.map(({ name }) => name)).toEqual(['statique', 'etat']);
  });

  test('le code 0 arrête tous les serveurs et termine le lanceur sans relance', async () => {
    const { supervisor, processes, exits, settle } = setup();
    supervisor.start();
    processes[1].exit(EXIT_STOP);
    await settle();
    expect(exits).toEqual([0]);
    expect(processes[0].killed).toBe(true);
    expect(processes.length).toBe(2);
  });

  test('le code 75 relance tous les serveurs, sans terminer le lanceur', async () => {
    const { supervisor, processes, exits, settle } = setup();
    supervisor.start();
    processes[1].exit(EXIT_RESTART);
    await settle();
    expect(exits).toEqual([]);
    expect(processes.length).toBe(4);
    expect(processes[0].killed).toBe(true);
    expect(processes.slice(2).map(({ name, killed }) => [name, killed])).toEqual([['statique', false], ['etat', false]]);
  });

  test('la sortie provoquée par un redémarrage n’en déclenche pas un second', async () => {
    const { supervisor, processes, settle } = setup();
    supervisor.start();
    processes[1].exit(EXIT_RESTART);
    await settle();
    await settle();
    expect(processes.length).toBe(4);
  });

  test('un incident relance seulement le serveur concerné', async () => {
    const { supervisor, processes, exits, settle } = setup();
    supervisor.start();
    processes[0].exit(1);
    await settle();
    expect(exits).toEqual([]);
    expect(processes.map(({ name }) => name)).toEqual(['statique', 'etat', 'statique']);
    expect(processes[1].killed).toBe(false);
  });

  test('plus de trois incidents en une minute arrêtent tout : pas de boucle de relance en direct', async () => {
    let time = 0;
    const { supervisor, processes, exits, settle } = setup({ now: () => time });
    supervisor.start();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      time += 1000;
      processes[processes.findLastIndex(({ name }) => name === 'statique')].exit(1);
      await settle();
    }
    expect(exits).toEqual([1]);
    expect(processes.filter(({ name }) => name === 'statique').length).toBe(4);
  });

  test('des incidents espacés de plus d’une minute ne s’additionnent pas', async () => {
    let time = 0;
    const { supervisor, processes, exits, settle } = setup({ now: () => time });
    supervisor.start();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      time += 120_000;
      processes[processes.findLastIndex(({ name }) => name === 'statique')].exit(1);
      await settle();
    }
    expect(exits).toEqual([]);
  });

  test('stop() ne relance personne et ne signale la sortie qu’une fois', async () => {
    const { supervisor, processes, exits, settle } = setup();
    supervisor.start();
    supervisor.stop();
    await settle();
    supervisor.stop();
    expect(exits).toEqual([0]);
    expect(processes.every(({ killed }) => killed)).toBe(true);
    expect(processes.length).toBe(2);
  });
});
