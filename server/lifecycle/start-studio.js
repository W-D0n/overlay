// @ts-check
/**
 * server/lifecycle/start-studio.js — Lance les serveurs du Studio en un seul process, puis ouvre le Studio dans le navigateur.
 *
 * Le Studio est la seule surface de création. Le live utilise `start-stream.js`, volontairement plus réduit.
 *
 * Un seul terminal, sortie préfixée par serveur, tous les enfants tués proprement à la fermeture
 * (Ctrl+C) : aucun process orphelin (voir docs/backlog-history.md).
 *
 * Lancement : `bun server/lifecycle/start-studio.js` (ou double-clic sur studio.bat à la racine).
 */
import { findBusyPorts, freeStaleBunPorts } from './port-check.js';
import { STATIC_PORT, BACKGROUND_STATE_PORT } from '../../ports.config.js';

const ROOT = `${import.meta.dir}/../..`;

/** @type {{ name: string, cmd: string[], port: number }[]} */
const SERVERS = [
  { name: 'statique',         cmd: ['bun', 'server/static-server.js'],           port: Number(process.env.STATIC_PORT ?? STATIC_PORT) },
  // Recharge les imports du validateur quand un nouvel effet rejoint le schéma. Sans `--watch`,
  // un tuner frais pouvait proposer un effet refusé par un vieux process encore en mémoire.
  { name: 'background-state', cmd: ['bun', '--watch', 'server/background-state-server.js'], port: Number(process.env.BACKGROUND_STATE_PORT ?? BACKGROUND_STATE_PORT) },
];

const freed = freeStaleBunPorts(SERVERS);
if (freed.length > 0) {
  console.log('[start-studio] instance précédente détectée — port(s) libéré(s) automatiquement :');
  for (const s of freed) console.log(`  - ${s.name} (port ${s.port})`);
}

const busy = findBusyPorts(SERVERS);
if (busy.length > 0) {
  console.error('[start-studio] ERREUR : port(s) occupé(s) par un process qui n\'est pas un de nos serveurs (bun.exe) :');
  for (const s of busy) console.error(`  - ${s.name} (port ${s.port})`);
  console.error('Ferme le process qui utilise ce port avant de relancer.');
  process.exit(1);
}

/** @type {ReturnType<typeof Bun.spawn>[]} */
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
  console.log(`[start-studio] ${name} lancé (pid ${proc.pid})`);
}

/** Tue tous les enfants proprement — appelé sur Ctrl+C/SIGTERM, jamais de process orphelin. */
function shutdown() {
  console.log('\n[start-studio] arrêt demandé — fermeture des serveurs...');
  for (const proc of children) proc.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

/** Ouvre le Studio dès que le serveur statique répond (jusqu'à 15 s), sans deviner un délai. */
async function openStudioWhenReady() {
  const staticPort = SERVERS.find((s) => s.name === 'statique')?.port;
  const url = `http://localhost:${staticPort}/studio/index.html`;
  for (let attempt = 0; attempt < 60; attempt++) {
    const answered = await fetch(url).then((response) => response.ok, () => false);
    if (answered) {
      Bun.spawn(['rundll32.exe', 'url.dll,FileProtocolHandler', url]);
      console.log(`[start-studio] Studio ouvert : ${url}`);
      return;
    }
    await Bun.sleep(250);
  }
  console.error(`[start-studio] le serveur statique n'a pas répondu : ouvre ${url} à la main.`);
}
openStudioWhenReady();

console.log('[start-studio] serveurs lancés dans ce terminal — Ctrl+C ici les arrête tous proprement.');
