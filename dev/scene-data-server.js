// @ts-check
/**
 * dev/scene-data-server.js — Serveur d'écriture des scènes dynamiques (S8 session 4/6, dev-only).
 *
 * NE JAMAIS lancer pendant le live — écrit sur disque dans `scenes/data/`, séparé du relais de
 * production (`relay/server.js`). Même pattern que `dev/placement-server.js` (S7).
 *
 * Routes :
 *   POST /create-scene — `{ sceneConfig }`, crée `scenes/data/<id>.scene.json` + ajoute l'id au
 *                         manifeste. Rejette un id déjà pris (scène statique ou dynamique existante).
 *   POST /update-scene  — `{ sceneId, sceneConfig }`, réécrit une scène dynamique existante.
 *                         Rejette un id absent du manifeste, ou un `sceneConfig.id` qui ne
 *                         correspond pas à `sceneId` (review S8 session 4/6).
 *   POST /delete-scene  — `{ sceneId }`, archive le fichier (`scenes/data/archived/<id>.scene.json`,
 *                         S8 session 6/6) + retire l'id du manifeste. Rejette un id absent du
 *                         manifeste. Restauration manuelle (pas d'UI, voir docs/inbox.md).
 *   WS   /reload-ws     — diffuse `reload` à chaque sauvegarde réussie (create/update/delete), même
 *                         mécanisme que `tuner-server.js`/`placement-server.js`. `index.html?livereload=1`
 *                         s'y connecte automatiquement (LAC-03 résolu, 2026-07-05).
 *   GET  /scene-history?sceneId=X — liste des versions passées d'une scène (`[]` si aucune).
 *   POST /restore-scene — `{ sceneId, timestamp }`, réécrit la scène active avec le contenu de
 *                         cette version. La restauration elle-même devient une nouvelle entrée
 *                         d'historique (pas de cas spécial). Voir docs/specs/scene-history-protocol.md.
 *
 * Logique de manifeste/historique testée séparément (AD-1) : voir `scene-data-format.js`.
 * Toutes les opérations qui lisent-puis-écrivent le manifeste passent par `withManifestLock` —
 * ce process est le seul écrivain de `manifest.json`, la sérialisation en mémoire suffit (pas de
 * verrou fichier) à éliminer la race lecture-modification-écriture entre requêtes concurrentes
 * (review S8 session 4/6).
 *
 * Lancement : `bun dev/scene-data-server.js`
 */
import { validateSceneConfig } from '../protocol.js';
// Import depuis reserved-scene-ids.js (PAS scenes/registry.js, fix production 2026-07-05) :
// registry.js importe les 9 *.wire.js, qui importent store.js, dont le chargement du module ouvre
// une vraie connexion WebSocket au relais — ce process (Bun, sans navigateur) n'a pas de `document`
// et plantait sur chaque scene.set reçu. Voir scenes/reserved-scene-ids.js pour le détail.
import { STATIC_SCENE_IDS } from '../scenes/reserved-scene-ids.js';
import { addSceneToManifest, removeSceneFromManifest, pushHistoryEntry } from './scene-data-format.js';

const PORT = Number(process.env.SCENE_DATA_PORT ?? 4460);
const DATA_DIR = `${import.meta.dir}/../scenes/data`;
const ARCHIVE_DIR = `${DATA_DIR}/archived`;
const HISTORY_DIR = `${DATA_DIR}/.history`;
const MANIFEST_FILE = `${DATA_DIR}/manifest.json`;

/** Évite l'accès à un fichier arbitraire via un `sceneId` malicieux (path traversal). */
const VALID_SCENE_ID = /^[a-z][a-z0-9-]*$/;

/** CORS permissif — outil de dev local uniquement, jamais exposé. */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/** @returns {Promise<string[]>} */
async function readManifest() {
  const file = Bun.file(MANIFEST_FILE);
  if (!(await file.exists())) return [];
  return await file.json();
}

/** @param {string[]} manifest */
async function writeManifest(manifest) {
  await Bun.write(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Sérialise toute lecture-modification-écriture de `manifest.json` sur une chaîne de promesses en
 * mémoire — ce process est le seul écrivain, donc suffisant pour éliminer la race entre deux
 * requêtes concurrentes (chacune lisant le manifeste avant que l'autre n'ait écrit sa mise à jour).
 * @type {Promise<unknown>}
 */
let manifestLock = Promise.resolve();

/**
 * @template T
 * @param {(manifest: string[]) => Promise<T>} fn - Reçoit le manifeste courant, peut le muter/écrire
 * @returns {Promise<T>}
 */
function withManifestLock(fn) {
  const result = manifestLock.then(() => readManifest()).then(fn);
  manifestLock = result.catch(() => {}); // une requête en échec ne bloque pas la suivante
  return result;
}

/** @param {unknown} body @returns {body is { sceneConfig: * }} */
function hasSceneConfig(body) {
  return typeof body === 'object' && body !== null && typeof (/** @type {*} */ (body).sceneConfig) === 'object';
}

/**
 * @param {string} message
 * @param {number} status
 * @returns {Response}
 */
function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** @returns {Response} */
function jsonOk() {
  return new Response('ok', { headers: CORS_HEADERS });
}

/** @type {Set<import('bun').ServerWebSocket<unknown>>} */
const reloadClients = new Set();

function broadcastReload() {
  reloadClients.forEach((client) => client.send('reload'));
}

/**
 * @param {string} sceneId
 * @returns {Promise<{ timestamp: number, sceneConfig: import('../types.js').SceneConfig }[]>}
 */
async function readHistory(sceneId) {
  const file = Bun.file(`${HISTORY_DIR}/${sceneId}.json`);
  if (!(await file.exists())) return [];
  return await file.json();
}

/**
 * Ajoute une entrée à l'historique d'une scène (fenêtre glissante, voir `pushHistoryEntry`).
 * @param {string} sceneId
 * @param {import('../types.js').SceneConfig} sceneConfig
 * @returns {Promise<void>}
 */
async function appendHistory(sceneId, sceneConfig) {
  const history = await readHistory(sceneId);
  const updated = pushHistoryEntry(history, { timestamp: Date.now(), sceneConfig });
  await Bun.write(`${HISTORY_DIR}/${sceneId}.json`, `${JSON.stringify(updated, null, 2)}\n`);
}

/**
 * POST /create-scene — `{ sceneConfig }`.
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function handleCreateScene(req) {
  const body = await req.json();
  if (!hasSceneConfig(body)) return jsonError('sceneConfig manquant', 400);
  const { sceneConfig } = body;

  if (!VALID_SCENE_ID.test(String(sceneConfig.id))) return jsonError(`id invalide : ${sceneConfig.id}`, 400);

  const validation = validateSceneConfig(sceneConfig);
  if (!validation.ok) return jsonError(validation.errors.join(' ; '), 400);

  return withManifestLock(async (manifest) => {
    if (STATIC_SCENE_IDS.includes(sceneConfig.id) || manifest.includes(sceneConfig.id)) {
      return jsonError(`id déjà pris : ${sceneConfig.id}`, 409);
    }

    await Bun.write(`${DATA_DIR}/${sceneConfig.id}.scene.json`, `${JSON.stringify(sceneConfig, null, 2)}\n`);
    await writeManifest(addSceneToManifest(manifest, sceneConfig.id));
    // Nouvelle scène = historique repart de zéro (id réutilisé après suppression traité comme une
    // scène entièrement nouvelle, pas une continuation — voir docs/specs/scene-history-protocol.md).
    await Bun.write(`${HISTORY_DIR}/${sceneConfig.id}.json`, `${JSON.stringify([{ timestamp: Date.now(), sceneConfig }], null, 2)}\n`);

    console.info(`[scene-data-server] scène créée — ${sceneConfig.id}`);
    broadcastReload();
    return jsonOk();
  });
}

/**
 * POST /update-scene — `{ sceneId, sceneConfig }`.
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function handleUpdateScene(req) {
  const body = await req.json();
  if (!hasSceneConfig(body) || typeof (/** @type {*} */ (body).sceneId) !== 'string') {
    return jsonError('sceneId ou sceneConfig manquant', 400);
  }
  const { sceneId, sceneConfig } = body;

  if (sceneConfig.id !== sceneId) return jsonError(`sceneConfig.id (${sceneConfig.id}) ne correspond pas à sceneId (${sceneId})`, 400);

  const validation = validateSceneConfig(sceneConfig);
  if (!validation.ok) return jsonError(validation.errors.join(' ; '), 400);

  return withManifestLock(async (manifest) => {
    if (!manifest.includes(sceneId)) return jsonError(`scène dynamique inconnue : ${sceneId}`, 404);

    await Bun.write(`${DATA_DIR}/${sceneId}.scene.json`, `${JSON.stringify(sceneConfig, null, 2)}\n`);
    await appendHistory(sceneId, sceneConfig);

    console.info(`[scene-data-server] scène mise à jour — ${sceneId}`);
    broadcastReload();
    return jsonOk();
  });
}

/**
 * GET /scene-history?sceneId=X — liste des versions passées d'une scène.
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function handleGetSceneHistory(req) {
  const sceneId = new URL(req.url).searchParams.get('sceneId');
  if (typeof sceneId !== 'string' || !sceneId) return jsonError('sceneId manquant', 400);

  const history = await readHistory(sceneId);
  return new Response(JSON.stringify(history), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

/**
 * POST /restore-scene — `{ sceneId, timestamp }`. Réécrit la scène active avec le contenu de la
 * version demandée. N'ajoute PAS d'entrée d'historique pour la restauration elle-même (owner,
 * 2026-07-05, révise la décision initiale de la spec) : restaurer plusieurs fois de suite en
 * cherchant la bonne version ne doit pas polluer la liste de doublons pile au moment où on essaie
 * d'y voir clair. L'historique ne grossit que sur une modification réelle (`/update-scene`).
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function handleRestoreScene(req) {
  const body = await req.json();
  const sceneId = /** @type {*} */ (body).sceneId;
  const timestamp = /** @type {*} */ (body).timestamp;
  if (typeof sceneId !== 'string' || typeof timestamp !== 'number') {
    return jsonError('sceneId ou timestamp manquant', 400);
  }

  const history = await readHistory(sceneId);
  const target = history.find((h) => h.timestamp === timestamp);
  if (!target) return jsonError(`version introuvable : ${sceneId} @ ${timestamp}`, 404);

  const validation = validateSceneConfig(target.sceneConfig);
  if (!validation.ok) return jsonError(validation.errors.join(' ; '), 400);

  await Bun.write(`${DATA_DIR}/${sceneId}.scene.json`, `${JSON.stringify(target.sceneConfig, null, 2)}\n`);

  console.info(`[scene-data-server] scène restaurée — ${sceneId} @ ${timestamp}`);
  broadcastReload();
  return jsonOk();
}

/**
 * POST /delete-scene — `{ sceneId }`. Archive le fichier (déplace vers `scenes/data/archived/`,
 * S8 session 6/6 — récupérable sans passer par git) AVANT de retirer l'id du manifeste (même ordre
 * que la suppression simple en session 4/6) : si l'archivage échoue, le manifeste garde l'id — pire
 * cas un fichier actif orphelin, jamais un id fantôme sans fichier.
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function handleDeleteScene(req) {
  const body = await req.json();
  if (typeof (/** @type {*} */ (body).sceneId) !== 'string') return jsonError('sceneId manquant', 400);
  const { sceneId } = body;

  return withManifestLock(async (manifest) => {
    if (!manifest.includes(sceneId)) return jsonError(`scène dynamique inconnue : ${sceneId}`, 404);

    const activePath = `${DATA_DIR}/${sceneId}.scene.json`;
    const archivedPath = `${ARCHIVE_DIR}/${sceneId}.scene.json`;
    await Bun.write(archivedPath, await Bun.file(activePath).text());
    await Bun.file(activePath).delete();
    await writeManifest(removeSceneFromManifest(manifest, sceneId));

    console.info(`[scene-data-server] scène supprimée — ${sceneId}`);
    broadcastReload();
    return jsonOk();
  });
}

/** @type {Record<string, (req: Request) => Promise<Response>>} */
const POST_ROUTES = {
  '/create-scene': handleCreateScene,
  '/update-scene': handleUpdateScene,
  '/delete-scene': handleDeleteScene,
  '/restore-scene': handleRestoreScene,
};

/** @type {Record<string, (req: Request) => Promise<Response>>} */
const GET_ROUTES = {
  '/scene-history': handleGetSceneHistory,
};

Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

    if (url.pathname === '/reload-ws') {
      const upgraded = server.upgrade(req);
      return upgraded ? undefined : new Response('upgrade failed', { status: 500 });
    }

    const handler = req.method === 'GET' ? GET_ROUTES[url.pathname] : req.method === 'POST' ? POST_ROUTES[url.pathname] : undefined;
    if (!handler) return jsonError('not found', 404);

    try {
      return await handler(req);
    } catch (err) {
      console.error(`[scene-data-server] échec sur ${url.pathname} :`, err);
      return jsonError(String(err), 500);
    }
  },
  websocket: {
    open(ws) { reloadClients.add(ws); },
    close(ws) { reloadClients.delete(ws); },
    message() {},
  },
});

console.info(`[scene-data-server] écoute sur http://localhost:${PORT} — écrit dans scenes/data/`);
console.info('[scene-data-server] outil de DEV uniquement — ne pas lancer pendant le live');
