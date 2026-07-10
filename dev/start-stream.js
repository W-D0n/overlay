// @ts-check
/**
 * dev/start-stream.js — Lance le serveur statique + le relais OBS en un seul process
 * (remplace start-stream.bat multi-fenêtres, 2026-07-10).
 *
 * Même architecture que dev/start-dev.js : un seul process Bun, sortie préfixée par serveur,
 * enfants liés au Job Object Windows du parent — fermeture du terminal (X ou Ctrl+C) tue les
 * enfants proprement, plus de port orphelin. `start "titre" cmd /k ...` (ancien start-stream.bat)
 * ouvrait des fenêtres détachées hors du Job Object, laissant `bun.exe` tourner après fermeture
 * (root cause de l'orphelin sur le port 5500 constaté le 2026-07-10, voir docs/inbox.md).
 *
 * Lancement : `bun dev/start-stream.js` (ou double-clic sur start-stream.bat).
 */
import { existsSync } from 'node:fs';

const ROOT = `${import.meta.dir}/..`;

if (!existsSync(`${ROOT}/.env`)) {
  console.error('[start-stream] ERREUR : fichier .env manquant.');
  console.error('Copier .env.example en .env et renseigner OBS_WS_PASSWORD + OVERLAY_RELAY_SECRET.');
  console.error('Voir docs/obs-setup.md pour les instructions complètes.');
  process.exit(1);
}

/** @type {{ name: string, cmd: string[] }[]} */
const SERVERS = [
  { name: 'statique', cmd: ['bun', 'dev/static-server.js'] },
  { name: 'relais',   cmd: ['bun', 'relay/server.js'] },
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
  console.log(`[start-stream] ${name} lancé (pid ${proc.pid})`);
}

/** Tue tous les enfants proprement — appelé sur Ctrl+C/SIGTERM, jamais de process orphelin. */
function shutdown() {
  console.log('\n[start-stream] arrêt demandé — fermeture des serveurs...');
  for (const proc of children) proc.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('[start-stream] serveur statique + relais lancés dans ce terminal — Ctrl+C ici les arrête tous proprement.');
