// @ts-check
/**
 * dev/scene-data-server.js — Serveur d'écriture des scènes dynamiques (S8 session 4/6, dev-only).
 *
 * NE JAMAIS lancer pendant le live — écrit sur disque dans `scenes/data/`, séparé du relais de
 * production (`relay/server.js`). Il possède aussi le placement : aucun proxy intermédiaire.
 *
 * Routes :
 *   POST /create-scene — `{ sceneConfig }`, crée `scenes/data/<id>.scene.json` + ajoute l'id au
 *                         manifeste. Rejette un id déjà pris (scène statique ou dynamique existante).
 *   POST /update-scene  — `{ sceneId, sceneConfig }`, réécrit une scène dynamique existante.
 *                         Rejette un id absent du manifeste, ou un `sceneConfig.id` qui ne
 *                         correspond pas à `sceneId` (review S8 session 4/6).
 *   POST /delete-scene  — `{ sceneId }`, archive le fichier (`scenes/data/archived/<id>.scene.json`,
 *                         S8 session 6/6) + retire l'id du manifeste. Rejette un id absent du
 *                         manifeste.
 *   WS   /reload-ws     — diffuse `reload` à chaque sauvegarde réussie (create/update/delete), même
 *                         mécanisme que `tuner-server.js`. `index.html?livereload=1`
 *                         s'y connecte automatiquement (LAC-03 résolu, 2026-07-05).
 *   GET  /scene-history?sceneId=X — liste des versions passées d'une scène (`[]` si aucune).
 *   POST /save-placement — `{ sceneId, layerName, placement }`, réécrit uniquement la valeur
 *                         `placement` de la couche ciblée + ajoute une entrée d'historique, les deux
 *                         dans la même opération sérialisée. Le panneau l'appelle directement :
 *                         ce process reste l'unique écrivain de `scenes/data/*.scene.json` ET de
 *                         son historique (2026-07-06, voir
 *                         docs/specs/scene-history-protocol.md §Concurrence d'accès — élimine la
 *                         race entre deux process Bun distincts écrivant le même fichier).
 *   POST /restore-scene — `{ sceneId, timestamp }`, réécrit la scène active avec le contenu de
 *                         cette version. N'ajoute PAS d'entrée d'historique (révisé 2026-07-05,
 *                         évite les doublons en cherchant la bonne version). Voir
 *                         docs/specs/scene-history-protocol.md.
 *   GET  /archived-scenes — liste des ids de scènes supprimées (archivées), 2026-07-05.
 *   POST /restore-archived-scene — `{ sceneId }`, remet une scène archivée en scène active. Rejette
 *                         si l'id est déjà pris par une scène active (409) ou si l'archive n'existe
 *                         pas (404). N'ajoute pas d'entrée d'historique — la scène restaurée
 *                         continue sa propre histoire, ce n'est pas une nouvelle scène.
 *
 * Logique de manifeste/historique testée séparément (AD-1) : voir `scene-data-format.js`.
 * Toutes les opérations qui touchent `manifest.json` ET/OU un fichier `scenes/data/<id>.scene.json`
 * passent par `withSceneDataLock` (dev/keyed-lock.js, clé unique `SCENE_DATA_LOCK_KEY`) — ce process
 * est le seul écrivain de ces fichiers, la sérialisation en mémoire suffit (pas de verrou fichier) à
 * éliminer toute race lecture-modification-écriture entre requêtes concurrentes, y compris entre
 * deux routes différentes qui toucheraient la même scène (review S8 session 4/6, étendu 2026-07-06
 * à `/restore-scene` et `/save-placement`, qui n'étaient pas couverts).
 *
 * Lancement : `bun dev/scene-data-server.js`
 */
import { validateSceneConfig } from '../protocol.js';
// Import depuis reserved-scene-ids.js (PAS scenes/registry.js, fix production 2026-07-05) :
// registry.js importe les 9 *.wire.js, qui importent store.js, dont le chargement du module ouvre
// une vraie connexion WebSocket au relais — ce process (Bun, sans navigateur) n'a pas de `document`
// et plantait sur chaque scene.set reçu. Voir scenes/reserved-scene-ids.js pour le détail.
import { STATIC_SCENE_IDS } from '../scenes/reserved-scene-ids.js';
import { addSceneToManifest, removeSceneFromManifest } from './scene-data-format.js';
import { readSceneHistory, appendSceneHistory, writeSceneHistory } from './scene-history-store.js';
import { applyPlacementToLayer } from './scene-placement-format.js';
import { createKeyedLock } from './keyed-lock.js';
import { CORS_HEADERS, jsonError } from './dev-server-shared.js';

const PORT = Number(process.env.SCENE_DATA_PORT ?? 4460);
const DATA_DIR = `${import.meta.dir}/../scenes/data`;
const ARCHIVE_DIR = `${DATA_DIR}/archived`;
const MANIFEST_FILE = `${DATA_DIR}/manifest.json`;

/** Évite l'accès à un fichier arbitraire via un `sceneId` malicieux (path traversal). */
const VALID_SCENE_ID = /^[a-z][a-z0-9-]*$/;

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
 * Sérialise toute opération touchant `manifest.json` et/ou `scenes/data/<id>.scene.json` sur une
 * chaîne de promesses en mémoire (dev/keyed-lock.js) — ce process est le seul écrivain de ces
 * fichiers, donc suffisant pour éliminer la race entre deux requêtes concurrentes. Clé unique
 * (pas une clé par scène) : simplicité délibérée pour un outil de dev mono-utilisateur — le
 * débit n'est jamais un problème ici, contrairement à la correction.
 */
const withSceneDataLock = createKeyedLock();
const SCENE_DATA_LOCK_KEY = 'scene-data';

/**
 * @template T
 * @param {(manifest: string[]) => Promise<T>} fn - Reçoit le manifeste courant, peut le muter/écrire
 * @returns {Promise<T>}
 */
function withManifestLock(fn) {
  return withSceneDataLock(SCENE_DATA_LOCK_KEY, () => readManifest().then(fn));
}

/** @param {unknown} body @returns {body is { sceneConfig: * }} */
function hasSceneConfig(body) {
  return typeof body === 'object' && body !== null && typeof (/** @type {*} */ (body).sceneConfig) === 'object';
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
    // Écriture directe (pas appendSceneHistory, qui lirait/prolongerait un historique préexistant).
    await writeSceneHistory(sceneConfig.id, [{ timestamp: Date.now(), sceneConfig }]);

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
    await appendSceneHistory(sceneId, sceneConfig);

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

  const history = await readSceneHistory(sceneId);
  return new Response(JSON.stringify(history), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

/**
 * POST /save-placement — `{ sceneId, layerName, placement }`. Voir
 * docs/specs/scene-history-protocol.md §Concurrence d'accès. Le panneau de drag & drop appelle
 * directement cette route. Lecture, application du placement et écriture (fichier de scène +
 * historique) dans une seule opération sérialisée : un
 * read-modify-write non protégé ici causait une perte silencieuse de placement sous requêtes
 * concurrentes (trouvé en vérification visuelle, 2026-07-06).
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function handleSavePlacement(req) {
  const body = await req.json();
  const sceneId = /** @type {*} */ (body).sceneId;
  const layerName = /** @type {*} */ (body).layerName;
  const placement = /** @type {*} */ (body).placement;

  if (typeof sceneId !== 'string' || !VALID_SCENE_ID.test(sceneId)) return jsonError('sceneId invalide', 400);
  if (typeof layerName !== 'string' || !layerName) return jsonError('layerName invalide', 400);

  return withSceneDataLock(SCENE_DATA_LOCK_KEY, async () => {
    const targetFile = `${DATA_DIR}/${sceneId}.scene.json`;
    const current = await Bun.file(targetFile).json();
    const updated = applyPlacementToLayer(current, layerName, placement);
    await Bun.write(targetFile, `${JSON.stringify(updated, null, 2)}\n`);
    await appendSceneHistory(sceneId, updated);

    console.info(`[scene-data-server] scenes/data/${sceneId}.scene.json — couche "${layerName}" mise à jour`);
    broadcastReload();
    return jsonOk();
  });
}

/**
 * POST /restore-scene — `{ sceneId, timestamp }`. Réécrit la scène active avec le contenu de la
 * version demandée. N'ajoute PAS d'entrée d'historique pour la restauration elle-même (owner,
 * 2026-07-05, révise la décision initiale de la spec) : restaurer plusieurs fois de suite en
 * cherchant la bonne version ne doit pas polluer la liste de doublons pile au moment où on essaie
 * d'y voir clair. L'historique ne grossit que sur une modification réelle (`/update-scene`).
 * Sérialisé via `withSceneDataLock` (2026-07-06) — sans ça, une restauration concurrente d'une
 * autre écriture sur la même scène pouvait écraser l'une des deux versions sans que rien ne le
 * signale (trouvé en revue d'architecture, pas encore observé en usage réel).
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

  return withSceneDataLock(SCENE_DATA_LOCK_KEY, async () => {
    const history = await readSceneHistory(sceneId);
    const target = history.find((h) => h.timestamp === timestamp);
    if (!target) return jsonError(`version introuvable : ${sceneId} @ ${timestamp}`, 404);

    const validation = validateSceneConfig(target.sceneConfig);
    if (!validation.ok) return jsonError(validation.errors.join(' ; '), 400);

    await Bun.write(`${DATA_DIR}/${sceneId}.scene.json`, `${JSON.stringify(target.sceneConfig, null, 2)}\n`);

    console.info(`[scene-data-server] scène restaurée — ${sceneId} @ ${timestamp}`);
    broadcastReload();
    return jsonOk();
  });
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

/**
 * GET /archived-scenes — liste les ids des scènes supprimées (archivées, `scenes/data/archived/`).
 * @returns {Promise<Response>}
 */
async function handleGetArchivedScenes() {
  const glob = new Bun.Glob('*.scene.json');
  /** @type {string[]} */
  const ids = [];
  for await (const file of glob.scan({ cwd: ARCHIVE_DIR })) {
    ids.push(file.replace(/\.scene\.json$/, ''));
  }
  return new Response(JSON.stringify(ids), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

/**
 * POST /restore-archived-scene — `{ sceneId }`. Remet une scène archivée en scène active : déplace
 * `scenes/data/archived/<id>.scene.json` vers `scenes/data/<id>.scene.json` + rajoute l'id au
 * manifeste. Rejette si une scène active porte déjà cet id (409) ou si aucune archive ne correspond
 * (404). L'historique existant (s'il y en a un) n'est PAS touché — la scène restaurée continue sa
 * propre histoire, ce n'est pas une nouvelle scène.
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function handleRestoreArchivedScene(req) {
  const body = await req.json();
  const sceneId = /** @type {*} */ (body).sceneId;
  if (typeof sceneId !== 'string') return jsonError('sceneId manquant', 400);

  const archivedPath = `${ARCHIVE_DIR}/${sceneId}.scene.json`;
  if (!(await Bun.file(archivedPath).exists())) return jsonError(`aucune archive pour : ${sceneId}`, 404);

  return withManifestLock(async (manifest) => {
    if (STATIC_SCENE_IDS.includes(sceneId) || manifest.includes(sceneId)) {
      return jsonError(`id déjà pris par une scène active : ${sceneId}`, 409);
    }

    const activePath = `${DATA_DIR}/${sceneId}.scene.json`;
    await Bun.write(activePath, await Bun.file(archivedPath).text());
    await Bun.file(archivedPath).delete();
    await writeManifest(addSceneToManifest(manifest, sceneId));

    console.info(`[scene-data-server] scène restaurée depuis les archives — ${sceneId}`);
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
  '/restore-archived-scene': handleRestoreArchivedScene,
  '/save-placement': handleSavePlacement,
};

/** @type {Record<string, (req: Request) => Promise<Response>>} */
const GET_ROUTES = {
  '/scene-history': handleGetSceneHistory,
  '/archived-scenes': handleGetArchivedScenes,
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
