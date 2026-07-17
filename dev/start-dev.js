// @ts-check
/**
 * dev/start-dev.js — Lance les serveurs de dev en un seul process (remplace l'ancien
 * start-dev.bat multi-fenêtres, 2026-07-05).
 *
 * Lance le Studio qui réunit les deux surfaces de création : fonds autonomes et scènes complètes.
 * Le relais OBS et le tuner DotGrid qui réécrit le code source restent optionnels et se lancent
 * séparément. Le live utilise `start-stream.js`, volontairement plus réduit.
 *
 * Un seul terminal, sortie préfixée par serveur, tous les enfants tués proprement à la fermeture
 * (Ctrl+C). L'ancien script (`start "titre" cmd /k ...` multi-fenêtres) ouvrait des fenêtres
 * détachées, aucune liée au processus parent : fermer/perdre de vue la fenêtre du `.bat` ne tuait
 * rien, laissant des process orphelins tourner pendant des heures (root cause d'un bug production,
 * voir docs/inbox.md) — cette architecture à process unique élimine la classe entière de problème.
 *
 * Lancement : `bun dev/start-dev.js` (ou double-clic sur start-dev.bat).
 */
import { findBusyPorts, freeStaleBunPorts } from './port-check.js';

const ROOT = `${import.meta.dir}/..`;

/** @type {{ name: string, cmd: string[], port: number }[]} */
const SERVERS = [
  { name: 'statique',         cmd: ['bun', 'dev/static-server.js'],           port: Number(process.env.STATIC_PORT ?? 5500) },
  // Recharge les imports du validateur quand un nouvel effet rejoint le schéma. Sans `--watch`,
  // un tuner frais pouvait proposer un effet refusé par un vieux process encore en mémoire.
  { name: 'background-state', cmd: ['bun', '--watch', 'dev/background-state-server.js'], port: Number(process.env.BACKGROUND_STATE_PORT ?? 4462) },
  { name: 'scene-data',       cmd: ['bun', 'dev/scene-data-server.js'],       port: Number(process.env.SCENE_DATA_PORT ?? 4460) },
  { name: 'obs-scene-map',    cmd: ['bun', 'dev/obs-scene-map-server.js'],    port: Number(process.env.OBS_SCENE_MAP_PORT ?? 4461) },
];

const freed = freeStaleBunPorts(SERVERS);
if (freed.length > 0) {
  console.log('[start-dev] instance précédente détectée — port(s) libéré(s) automatiquement :');
  for (const s of freed) console.log(`  - ${s.name} (port ${s.port})`);
}

const busy = findBusyPorts(SERVERS);
if (busy.length > 0) {
  console.error('[start-dev] ERREUR : port(s) occupé(s) par un process qui n\'est pas un de nos serveurs (bun.exe) :');
  for (const s of busy) console.error(`  - ${s.name} (port ${s.port})`);
  console.error('Ferme le process qui utilise ce port avant de relancer.');
  process.exit(1);
}

/** @type {import('bun').Subprocess[]} */
const children = [];

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

for (const { name, cmd } of SERVERS) {
  const proc = Bun.spawn(cmd, { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
  children.push(proc);
  pipeWithPrefix(proc.stdout, name);
  pipeWithPrefix(proc.stderr, name);
  console.log(`[start-dev] ${name} lancé (pid ${proc.pid})`);
}

/** Tue tous les enfants proprement — appelé sur Ctrl+C/SIGTERM, jamais de process orphelin. */
function shutdown() {
  console.log('\n[start-dev] arrêt demandé — fermeture des serveurs...');
  for (const proc of children) proc.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

setTimeout(() => {
  const urls = [
    'http://localhost:5500/dev/studio.html',
    'http://localhost:5500/index.html?livereload=1',
  ];
  for (const url of urls) Bun.spawn(['rundll32.exe', 'url.dll,FileProtocolHandler', url]);
}, 2000);

console.log('[start-dev] serveurs lancés dans ce terminal — Ctrl+C ici les arrête tous proprement.');
