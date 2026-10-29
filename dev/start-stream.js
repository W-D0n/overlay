// @ts-check
/**
 * dev/start-stream.js — Lance les serveurs du live en un seul process
 * (remplace start-stream.bat multi-fenêtres, 2026-07-10).
 *
 * Restreint au strict nécessaire du mode background-only (owner, 2026-07-14) : statique
 * (sert background.html à la Browser Source) + background-state (état du fond, suivi live).
 *
 * Même architecture que dev/start-dev.js : un seul process Bun, sortie préfixée par serveur,
 * enfants liés au Job Object Windows du parent — fermeture du terminal (X ou Ctrl+C) tue les
 * enfants proprement, plus de port orphelin. `start "titre" cmd /k ...` (ancien start-stream.bat)
 * ouvrait des fenêtres détachées hors du Job Object, laissant `bun.exe` tourner après fermeture
 * (root cause de l'orphelin sur le port 5500 constaté le 2026-07-10, voir docs/backlog-history.md).
 *
 * Le lanceur supervise les serveurs par code de sortie (`dev/supervisor.js`) : le Studio peut demander
 * un arrêt (code 0) ou un redémarrage (code 75) via `POST /control/*` (docs/specs/controle-processus.md).
 *
 * Lancement : `bun dev/start-stream.js` (ou double-clic sur start-stream.bat).
 */
import { findBusyPorts } from './port-check.js';
import { STATIC_PORT, BACKGROUND_STATE_PORT } from '../ports.config.js';
import { createSupervisor, SUPERVISED_ENV } from './supervisor.js';

const ROOT = `${import.meta.dir}/..`;

/** @type {{ name: string, cmd: string[], port: number }[]} */
const SERVERS = [
  { name: 'statique',         cmd: ['bun', 'dev/static-server.js'],           port: Number(process.env.STATIC_PORT ?? STATIC_PORT) },
  // background-state en live : background.html (Browser Source fond seul) charge son état et suit
  // les réglages du tuner en direct. N'écrit qu'un JSON d'état, jamais de code source
  // (docs/specs/background-standalone.md §Intégration lancement).
  { name: 'background-state', cmd: ['bun', 'dev/background-state-server.js'], port: Number(process.env.BACKGROUND_STATE_PORT ?? BACKGROUND_STATE_PORT) },
];

const busy = findBusyPorts(SERVERS);
if (busy.length > 0) {
  console.error('[start-stream] ERREUR : port(s) déjà occupé(s) — une instance précédente tourne probablement encore :');
  for (const s of busy) console.error(`  - ${s.name} (port ${s.port})`);
  console.error('Ferme la fenêtre/l\'instance précédente avant de relancer, ou lance kill-servers.bat (tue uniquement un bun.exe orphelin, jamais un autre process).');
  process.exit(1);
}

/**
 * Lit un flux ligne par ligne et l'imprime préfixé par le nom du serveur.
 * @param {ReadableStream<Uint8Array> | null} stream
 * @param {string} name
 * @returns {Promise<void>}
 */
async function pipeWithPrefix(stream, name) {
  if (!stream) return;
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) console.log(`[${name}] ${line}`);
  }
  if (buffer) console.log(`[${name}] ${buffer}`);
}

const supervisor = createSupervisor({
  servers: SERVERS,
  spawn(server) {
    const proc = Bun.spawn(server.cmd, {
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, [SUPERVISED_ENV]: '1' },
    });
    pipeWithPrefix(proc.stdout, server.name);
    pipeWithPrefix(proc.stderr, server.name);
    return { pid: proc.pid, kill: () => proc.kill(), exited: proc.exited };
  },
  log: (message) => console.log(`[start-stream] ${message}`),
  onExit: (code) => process.exit(code),
});

/** Ctrl+C / SIGTERM : tous les enfants sont tués proprement, jamais de process orphelin. */
function shutdown() {
  console.log('\n[start-stream] arrêt demandé — fermeture des serveurs...');
  supervisor.stop();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

supervisor.start();
console.log('[start-stream] serveur statique + état du fond lancés dans ce terminal — Ctrl+C ici les arrête tous proprement.');
