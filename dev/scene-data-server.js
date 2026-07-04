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
 *   POST /delete-scene  — `{ sceneId }`, supprime le fichier + retire l'id du manifeste.
 *                         Rejette un id absent du manifeste.
 *
 * Logique de manifeste testée séparément (AD-1) : voir `scene-data-format.js`.
 * Toutes les opérations qui lisent-puis-écrivent le manifeste passent par `withManifestLock` —
 * ce process est le seul écrivain de `manifest.json`, la sérialisation en mémoire suffit (pas de
 * verrou fichier) à éliminer la race lecture-modification-écriture entre requêtes concurrentes
 * (review S8 session 4/6).
 * Hot-reload différé (LAC-03, voir docs/specs/scene-definition-v2.md §Session 4/6).
 *
 * Lancement : `bun dev/scene-data-server.js`
 */
import { validateSceneConfig } from '../protocol.js';
import { STATIC_SCENE_IDS } from '../scenes/registry.js';
import { addSceneToManifest, removeSceneFromManifest } from './scene-data-format.js';

const PORT = Number(process.env.SCENE_DATA_PORT ?? 4460);
const DATA_DIR = `${import.meta.dir}/../scenes/data`;
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

    console.info(`[scene-data-server] scène créée — ${sceneConfig.id}`);
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

    console.info(`[scene-data-server] scène mise à jour — ${sceneId}`);
    return jsonOk();
  });
}

/**
 * POST /delete-scene — `{ sceneId }`. Supprime le fichier AVANT de retirer l'id du manifeste
 * (review S8 session 4/6) : si la suppression du fichier échoue, le manifeste garde l'id — pire
 * cas un fichier orphelin visible et rechargeable, jamais un id fantôme sans fichier.
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function handleDeleteScene(req) {
  const body = await req.json();
  if (typeof (/** @type {*} */ (body).sceneId) !== 'string') return jsonError('sceneId manquant', 400);
  const { sceneId } = body;

  return withManifestLock(async (manifest) => {
    if (!manifest.includes(sceneId)) return jsonError(`scène dynamique inconnue : ${sceneId}`, 404);

    await Bun.file(`${DATA_DIR}/${sceneId}.scene.json`).delete();
    await writeManifest(removeSceneFromManifest(manifest, sceneId));

    console.info(`[scene-data-server] scène supprimée — ${sceneId}`);
    return jsonOk();
  });
}

/** @type {Record<string, (req: Request) => Promise<Response>>} */
const ROUTES = {
  '/create-scene': handleCreateScene,
  '/update-scene': handleUpdateScene,
  '/delete-scene': handleDeleteScene,
};

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (req.method !== 'POST') return jsonError('not found', 404);

    const handler = ROUTES[url.pathname];
    if (!handler) return jsonError('not found', 404);

    try {
      return await handler(req);
    } catch (err) {
      console.error(`[scene-data-server] échec sur ${url.pathname} :`, err);
      return jsonError(String(err), 500);
    }
  },
});

console.info(`[scene-data-server] écoute sur http://localhost:${PORT} — écrit dans scenes/data/`);
console.info('[scene-data-server] outil de DEV uniquement — ne pas lancer pendant le live');
