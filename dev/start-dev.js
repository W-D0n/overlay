// @ts-check
/**
 * dev/start-dev.js — Lance les 5 serveurs de dev en un seul process (remplace l'ancien
 * start-dev.bat multi-fenêtres, 2026-07-05).
 *
 * Un seul terminal, sortie préfixée par serveur, tous les enfants tués proprement à la fermeture
 * (Ctrl+C). L'ancien script (`start "titre" cmd /k ...` × 5) ouvrait 5 fenêtres détachées, aucune
 * liée au processus parent : fermer/perdre de vue la fenêtre du `.bat` ne tuait rien, laissant des
 * process orphelins tourner pendant des heures, connectés en silence au relais (root cause d'un
 * bug production, voir docs/inbox.md) — cette architecture à process unique élimine la classe
 * entière de problème, pas seulement le symptôme observé.
 *
 * NE JAMAIS lancer pendant un live — écrit sur disque (tuner-server.js, placement-server.js,
 * scene-data-server.js). Pour streamer, utiliser start-stream.bat.
 *
 * Lancement : `bun dev/start-dev.js` (ou double-clic sur start-dev.bat).
 */
import { existsSync } from 'node:fs';

const ROOT = `${import.meta.dir}/..`;

if (!existsSync(`${ROOT}/.env`)) {
  console.error('[start-dev] ERREUR : fichier .env manquant.');
  console.error('Copier .env.example en .env et renseigner OBS_WS_PASSWORD + OVERLAY_RELAY_SECRET.');
  console.error('Voir docs/obs-setup.md pour les instructions complètes.');
  process.exit(1);
}

/** @type {{ name: string, cmd: string[] }[]} */
const SERVERS = [
  { name: 'statique',   cmd: ['bun', 'dev/static-server.js'] },
  { name: 'relais',     cmd: ['bun', 'relay/server.js'] },
  { name: 'tuner',      cmd: ['bun', 'dev/tuner-server.js'] },
  { name: 'placement',  cmd: ['bun', 'dev/placement-server.js'] },
  { name: 'scene-data', cmd: ['bun', 'dev/scene-data-server.js'] },
];

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
    'http://localhost:5500/?livereload=1',
    'http://localhost:5500/dev/dotgrid-tuner.html',
    'http://localhost:5500/dev/placement-panel.html',
  ];
  for (const url of urls) Bun.spawn(['cmd', '/c', 'start', '""', url]);
}, 2000);

console.log('[start-dev] 5 serveurs lancés dans ce terminal — Ctrl+C ici les arrête tous proprement.');
