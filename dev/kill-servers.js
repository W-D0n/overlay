// @ts-check
/**
 * dev/kill-servers.js — Arrête les serveurs de dev/live du projet (`kill-servers.bat`).
 *
 * L'ordre compte (`dev/stop-servers.js`) : le lanceur qui supervise les serveurs les relance quand on les
 * tue ; on lui demande donc l'arrêt d'abord, on le tue lui-même à défaut, et seulement ensuite ses
 * enfants. Un port tenu par autre chose qu'un `bun.exe` n'est jamais touché : le détenteur est nommé.
 *
 * Lancement : `bun dev/kill-servers.js` (ou double-clic sur kill-servers.bat).
 */
import { isPortFree } from './port-check.js';
import { stopServers } from './stop-servers.js';
import { STATIC_PORT, BACKGROUND_STATE_PORT } from '../ports.config.js';

const staticPort = Number(process.env.STATIC_PORT ?? STATIC_PORT);
const statePort = Number(process.env.BACKGROUND_STATE_PORT ?? BACKGROUND_STATE_PORT);

/** @type {{ name: string, port: number }[]} */
const TARGETS = [
  { name: 'statique', port: staticPort },
  { name: 'background-state', port: statePort },
];

/** @param {string[]} command @returns {string} */
function run(command) {
  return Bun.spawnSync(command).stdout.toString();
}

/** @param {number} port @returns {number | null} */
function pidOnPort(port) {
  for (const line of run(['netstat', '-ano', '-p', 'TCP']).split('\n')) {
    const match = line.match(/^\s*TCP\s+\S*:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
    if (match && Number(match[1]) === port) return Number(match[2]);
  }
  return null;
}

/** @param {number} pid @returns {string | null} */
function processName(pid) {
  const match = run(['tasklist', '/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']).match(/^"([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * Lanceurs du projet (`start-stream.js`, `start-dev.js`) qui sont parents d'un des processus donnés.
 * @param {number[]} holderPids
 * @returns {number[]}
 */
function listLaunchers(holderPids) {
  const script = "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'bun.exe' } | ForEach-Object { \"$($_.ProcessId)|$($_.ParentProcessId)|$($_.CommandLine)\" }";
  const rows = run(['powershell', '-NoProfile', '-Command', script]).split('\n').map((line) => line.trim().split('|'));
  /** @type {Map<number, { parent: number, command: string }>} */
  const byPid = new Map(rows.filter((row) => row.length >= 3).map(([pid, parent, ...command]) => [Number(pid), { parent: Number(parent), command: command.join('|') }]));
  const launchers = new Set();
  for (const pid of holderPids) {
    const parent = byPid.get(pid)?.parent;
    const info = parent === undefined ? undefined : byPid.get(parent);
    if (info !== undefined && /start-(stream|dev)\.js/.test(info.command)) launchers.add(/** @type {number} */ (parent));
  }
  return [...launchers];
}

const report = await stopServers(TARGETS, {
  async requestStop() {
    const response = await fetch(`http://127.0.0.1:${statePort}/control/stop`, {
      method: 'POST',
      headers: { 'X-Overlay-Control': '1' },
      signal: AbortSignal.timeout(1500),
    });
    return response.status === 202;
  },
  isPortFree,
  listLaunchers,
  pidOnPort,
  processName,
  kill: (pid) => { Bun.spawnSync(['taskkill', '/F', '/PID', String(pid)]); },
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

for (const target of report.released) console.log(`[kill-servers] ${target.name} (port ${target.port}) — arrêté.`);
for (const holder of report.foreign) {
  console.error(
    `[kill-servers] ${holder.target.name} (port ${holder.target.port}) tenu par ${holder.processName ?? 'un processus inconnu'} ` +
    `(PID ${holder.pid}), qui n'est pas un serveur du projet — non touché. Ferme-le à la main si besoin.`,
  );
}
for (const target of report.stillBusy.filter(({ port }) => !report.foreign.some((holder) => holder.target.port === port))) {
  console.error(`[kill-servers] ${target.name} (port ${target.port}) est encore occupé après l'arrêt — réessaie, ou ferme-le à la main.`);
}
if (report.released.length === 0 && report.stillBusy.length === 0) {
  console.log('[kill-servers] rien à faire — aucun serveur du projet sur ses ports.');
}
