// @ts-check
/**
 * dev/background-state-server.js — Serveur d'état du fond standalone (2026-07-14).
 *
 * Persiste l'état `{ current, presets }` de `background.html` (URL OBS background-only) dans
 * `dev/data/background-state.json` et diffuse chaque changement d'état courant en WebSocket.
 * Contrairement aux autres serveurs de dev, celui-ci tourne AUSSI pendant le live (lancé par
 * start-stream.js) : il n'écrit qu'un fichier d'état JSON, jamais de code source.
 * Voir docs/specs/background-standalone.md.
 *
 * Routes :
 *   GET  /state         — renvoie `{ current, presets }` (500 + erreurs si le fichier est invalide —
 *                          jamais de reset silencieux).
 *   POST /state         — `{ current }`, valide, persiste, diffuse `current` sur le WS.
 *   POST /save-preset   — `{ id?, name, component, options, tags? }`, crée ou met à jour.
 *   POST /rename-preset — `{ id, name }`, renomme sans casser l'URL OBS.
 *   POST /duplicate-preset — `{ id }`, crée une copie autonome.
 *   POST /preview-import — `{ bundle }`, calcule le plan et la révision sans écrire.
 *   POST /import-presets — `{ bundle, expectedRevision }`, fusionne si la révision est inchangée.
 *   POST /delete-preset — `{ id }`, supprime (404 si absent).
 *   WS   /state-ws      — diffuse le JSON de `current` à chaque POST /state réussi.
 *   WS   /presets-ws    — diffuse `{ id, name, action }` après chaque mutation de preset.
 *
 * Écritures sérialisées via `withStateLock` (dev/keyed-lock.js) — ce process est le seul écrivain
 * du fichier, la chaîne de promesses en mémoire suffit à éliminer les races read-modify-write.
 *
 * Lancement : `bun dev/background-state-server.js`
 */
import {
  defaultBackgroundFile,
  createPresetId,
  migrateBackgroundFile,
  validateBackgroundCurrent,
  validateBackgroundPreset,
  validateBackgroundFile,
  validatePresetName,
  upsertPreset,
  renamePreset,
  duplicatePreset,
  removePreset,
  readSceneMap,
} from './background-state-format.js';
import { createKeyedLock } from './keyed-lock.js';
import { CORS_HEADERS, jsonError } from './dev-server-shared.js';
import { validateBackgroundEvent } from './background-event-format.js';
import {
  backgroundPresetRevision,
  mergeBackgroundPresetImport,
  parseBackgroundPresetBundle,
} from './background-preset-library.js';
import { createObsSceneClient } from './obs-scene-client.js';
import { resolveSceneMapping, validateSceneMap } from '../obs-scene-mapping.js';

const PORT = Number(process.env.BACKGROUND_STATE_PORT ?? 4462);
const OBS_WS_URL = process.env.OBS_WS_URL ?? 'ws://127.0.0.1:4455';
const OBS_WS_PASSWORD = process.env.OBS_WS_PASSWORD ?? '';
const STATE_FILE = process.env.BACKGROUND_STATE_FILE ?? `${import.meta.dir}/data/background-state.json`;

const withStateLock = createKeyedLock();
const STATE_LOCK_KEY = 'background-state';

/** @typedef {{ channel: 'state'|'presets'|'event' }} BackgroundSocketData */

/** @type {Set<import('bun').ServerWebSocket<BackgroundSocketData>>} */
const stateClients = new Set();
/** @type {Set<import('bun').ServerWebSocket<BackgroundSocketData>>} */
const presetClients = new Set();
/** @type {Set<import('bun').ServerWebSocket<BackgroundSocketData>>} */
const eventClients = new Set();

/** @param {Record<string, unknown>} event */
function broadcastEvent(event) {
  const payload = JSON.stringify(event);
  eventClients.forEach((client) => client.send(payload));
}

/** @param {import('./background-state-format.js').BackgroundCurrent} current */
function broadcastCurrent(current) {
  const payload = JSON.stringify(current);
  stateClients.forEach((client) => client.send(payload));
}

/** @param {{id:string,name:string}} preset @param {'saved'|'renamed'|'duplicated'|'imported'|'deleted'} action */
function broadcastPresetChange(preset, action) {
  const payload = JSON.stringify({ id: preset.id, name: preset.name, action });
  presetClients.forEach((client) => client.send(payload));
}

/**
 * Lit le fichier d'état. Absent → état par défaut ; présent mais invalide → erreurs remontées
 * à l'appelant (qui en fait une réponse d'erreur), jamais de réparation silencieuse.
 * @returns {Promise<{ ok: true, file: import('./background-state-format.js').BackgroundFile } | { ok: false, errors: string[] }>}
 */
async function readStateFile() {
  const file = Bun.file(STATE_FILE);
  if (!(await file.exists())) return { ok: true, file: defaultBackgroundFile() };

  /** @type {unknown} */
  let raw;
  try {
    raw = await file.json();
  } catch (err) {
    return { ok: false, errors: [`JSON illisible : ${String(err)}`] };
  }

  const migration = migrateBackgroundFile(raw);
  const validation = validateBackgroundFile(migration.file);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  return { ok: true, file: /** @type {import('./background-state-format.js').BackgroundFile} */ (migration.file) };
}

/** @param {import('./background-state-format.js').BackgroundFile} file */
async function writeStateFile(file) {
  await Bun.write(STATE_FILE, `${JSON.stringify(file, null, 2)}\n`);
}

/**
 * Lecture + transformation + écriture sérialisées. `fn` reçoit le fichier courant et retourne
 * soit une Response d'erreur, soit le fichier à persister.
 * @param {(file: import('./background-state-format.js').BackgroundFile) => Response | import('./background-state-format.js').BackgroundFile} fn
 * @returns {Promise<Response>}
 */
function withStateUpdate(fn) {
  return withStateLock(STATE_LOCK_KEY, async () => {
    const read = await readStateFile();
    if (!read.ok) return jsonError(`fichier d'état invalide : ${read.errors.join(' ; ')}`, 500);

    const result = fn(read.file);
    if (result instanceof Response) return result;

    await writeStateFile(result);
    return new Response('ok', { headers: CORS_HEADERS });
  });
}

/**
 * Lecture sérialisée avec les écritures afin que la révision décrive un instant cohérent.
 * @param {(file: import('./background-state-format.js').BackgroundFile) => Response} fn
 */
function withStateRead(fn) {
  return withStateLock(STATE_LOCK_KEY, async () => {
    const read = await readStateFile();
    if (!read.ok) return jsonError(`fichier d'état invalide : ${read.errors.join(' ; ')}`, 500);
    return fn(read.file);
  });
}

/** @returns {Promise<Response>} */
async function handleGetState() {
  const read = await readStateFile();
  if (!read.ok) return jsonError(`fichier d'état invalide : ${read.errors.join(' ; ')}`, 500);
  return new Response(JSON.stringify(read.file), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/**
 * POST /state — `{ current }`.
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function handlePostState(req) {
  const body = /** @type {*} */ (await req.json());
  const validation = validateBackgroundCurrent(body?.current);
  if (!validation.ok) return jsonError(validation.errors.join(' ; '), 400);

  /** @type {import('./background-state-format.js').BackgroundCurrent} */
  const current = body.current;
  const response = await withStateUpdate((file) => ({ ...file, current }));
  if (response.ok) broadcastCurrent(current);
  return response;
}

/**
 * POST /save-preset — sans `id`, crée un preset ; avec `id`, met à jour le preset existant.
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function handleSavePreset(req) {
  const body = /** @type {*} */ (await req.json());
  /** @type {import('./background-state-format.js').BackgroundPreset | null} */
  let savedPreset = null;
  const response = await withStateUpdate((file) => {
    const requestedId = typeof body?.id === 'string' ? body.id : null;
    const existing = requestedId === null ? undefined : file.presets.find(({ id }) => id === requestedId);
    if (requestedId !== null && existing === undefined) return jsonError(`preset inconnu : ${requestedId}`, 404);

    const id = existing?.id ?? createPresetId(String(body?.name ?? ''), file.presets);
    const candidate = {
      id,
      name: body?.name,
      component: body?.component,
      options: body?.options,
      ...(body?.tags === undefined
        ? (existing?.tags === undefined ? {} : { tags: existing.tags })
        : { tags: body.tags }),
    };
    const validation = validateBackgroundPreset(candidate);
    if (!validation.ok) return jsonError(validation.errors.join(' ; '), 400);
    if (file.presets.some((preset) => preset.name === candidate.name && preset.id !== id)) {
      return jsonError(`preset en double : ${candidate.name}`, 409);
    }
    savedPreset = /** @type {import('./background-state-format.js').BackgroundPreset} */ (candidate);
    return { ...file, presets: upsertPreset(file.presets, savedPreset) };
  });
  if (response.ok && savedPreset !== null) broadcastPresetChange(savedPreset, 'saved');
  return response;
}

/**
 * POST /rename-preset — `{ id, name }`.
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function handleRenamePreset(req) {
  const body = /** @type {*} */ (await req.json());
  const { id, name } = body ?? {};
  if (typeof id !== 'string' || id.length === 0) return jsonError('id manquant', 400);
  const validation = validatePresetName(name);
  if (!validation.ok) return jsonError(validation.errors.join(' ; '), 400);

  /** @type {import('./background-state-format.js').BackgroundPreset | null} */
  let renamed = null;
  const response = await withStateUpdate((file) => {
    const preset = file.presets.find((candidate) => candidate.id === id);
    if (preset === undefined) return jsonError(`preset inconnu : ${id}`, 404);
    if (file.presets.some((candidate) => candidate.name === name && candidate.id !== id)) return jsonError(`preset en double : ${name}`, 409);
    renamed = { ...preset, name };
    return { ...file, presets: renamePreset(file.presets, id, name) };
  });
  if (response.ok && renamed !== null) broadcastPresetChange(renamed, 'renamed');
  return response;
}

/** @param {Request} req @returns {Promise<Response>} */
async function handleDuplicatePreset(req) {
  const body = /** @type {*} */ (await req.json());
  const id = body?.id;
  if (typeof id !== 'string' || id.length === 0) return jsonError('id manquant', 400);

  /** @type {import('./background-state-format.js').BackgroundPreset | null} */
  let copy = null;
  const response = await withStateUpdate((file) => {
    copy = duplicatePreset(file.presets, id);
    if (copy === null) return jsonError(`preset inconnu : ${id}`, 404);
    return { ...file, presets: [...file.presets, copy] };
  });
  if (response.ok && copy !== null) broadcastPresetChange(copy, 'duplicated');
  return response;
}

/** @param {Request} req @returns {Promise<Response>} */
async function handlePreviewImport(req) {
  const body = /** @type {*} */ (await req.json());
  const parsed = parseBackgroundPresetBundle(body?.bundle);
  if (!parsed.ok) return jsonError(parsed.errors.join(' ; '), 400);

  return withStateRead((file) => {
    const plan = mergeBackgroundPresetImport(file.presets, parsed.presets);
    return new Response(JSON.stringify({
      revision: backgroundPresetRevision(file.presets),
      created: plan.created,
      updated: plan.updated,
      renamed: plan.renamed,
      unchanged: plan.unchanged,
      changes: plan.changes,
    }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  });
}

/** @param {Request} req @returns {Promise<Response>} */
async function handleImportPresets(req) {
  const body = /** @type {*} */ (await req.json());
  const parsed = parseBackgroundPresetBundle(body?.bundle);
  if (!parsed.ok) return jsonError(parsed.errors.join(' ; '), 400);
  if (typeof body?.expectedRevision !== 'string') return jsonError('révision de presets manquante', 400);

  /** @type {import('./background-state-format.js').BackgroundPreset[]} */
  let importedPresets = [];
  const response = await withStateUpdate((file) => {
    if (backgroundPresetRevision(file.presets) !== body.expectedRevision) {
      return jsonError('bibliothèque modifiée depuis l’aperçu — recalcul nécessaire', 409);
    }
    const merged = mergeBackgroundPresetImport(file.presets, parsed.presets);
    const importedIds = new Set(parsed.presets.map(({ id }) => id));
    importedPresets = merged.presets.filter(({ id }) => importedIds.has(id));
    return { ...file, presets: merged.presets };
  });
  if (response.ok) importedPresets.forEach((preset) => broadcastPresetChange(preset, 'imported'));
  return response;
}

/** @param {Request} req @returns {Promise<Response>} */
async function handleDeletePreset(req) {
  const body = /** @type {*} */ (await req.json());
  const id = body?.id;
  if (typeof id !== 'string' || id.length === 0) return jsonError('id manquant', 400);

  /** @type {import('./background-state-format.js').BackgroundPreset | null} */
  let deleted = null;
  const response = await withStateUpdate((file) => {
    deleted = file.presets.find((preset) => preset.id === id) ?? null;
    if (deleted === null) return jsonError(`preset inconnu : ${id}`, 404);
    return { ...file, presets: removePreset(file.presets, id) };
  });
  if (response.ok && deleted !== null) broadcastPresetChange(deleted, 'deleted');
  return response;
}

/**
 * POST /event — événement de réaction éphémère : validé puis diffusé, jamais persisté.
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function handlePostEvent(req) {
  const body = /** @type {*} */ (await req.json());
  const validation = validateBackgroundEvent(body);
  if (!validation.ok) return jsonError(validation.errors.join(' ; '), 400);
  broadcastEvent(body);
  return new Response('ok', { headers: CORS_HEADERS });
}

/** @type {Record<string, (req: Request) => Promise<Response>>} */
/** @type {{ connected: boolean, reason: string | null, scenes: string[] }} */
const obsStatus = { connected: false, reason: null, scenes: [] };

/**
 * GET /obs-status — connexion OBS et scènes réelles, pour la section « Scènes OBS » du tuner.
 */
function handleGetObsStatus() {
  return Response.json({ ...obsStatus, configured: OBS_WS_PASSWORD !== '' }, { headers: CORS_HEADERS });
}

/**
 * POST /scene-map — `{ sceneMap }`. Remplace la table d'association scène OBS → preset.
 */
async function handlePostSceneMap(req) {
  const body = /** @type {*} */ (await req.json());
  const validation = validateSceneMap(body?.sceneMap);
  if (!validation.ok) return jsonError(validation.errors.join(' ; '), 400);

  return withStateUpdate((file) => ({ ...file, sceneMap: body.sceneMap }));
}

const POST_ROUTES = {
  '/scene-map': handlePostSceneMap,
  '/state': handlePostState,
  '/save-preset': handleSavePreset,
  '/rename-preset': handleRenamePreset,
  '/duplicate-preset': handleDuplicatePreset,
  '/preview-import': handlePreviewImport,
  '/import-presets': handleImportPresets,
  '/delete-preset': handleDeletePreset,
  '/event': handlePostEvent,
};

Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

    if (url.pathname === '/state-ws' || url.pathname === '/presets-ws' || url.pathname === '/event-ws') {
      const channel = url.pathname === '/state-ws' ? 'state' : url.pathname === '/presets-ws' ? 'presets' : 'event';
      const upgraded = server.upgrade(req, { data: { channel } });
      return upgraded ? undefined : new Response('upgrade failed', { status: 500 });
    }

    if (req.method === 'GET' && url.pathname === '/state') return handleGetState();
    if (req.method === 'GET' && url.pathname === '/obs-status') return handleGetObsStatus();

    const handler = req.method === 'POST' ? POST_ROUTES[url.pathname] : undefined;
    if (!handler) return jsonError('not found', 404);

    try {
      return await handler(req);
    } catch (err) {
      console.error(`[background-state-server] échec sur ${url.pathname} :`, err);
      return jsonError(String(err), 500);
    }
  },
  websocket: {
    open(ws) {
      if (ws.data.channel === 'state') stateClients.add(ws);
      else if (ws.data.channel === 'presets') presetClients.add(ws);
      else eventClients.add(ws);
    },
    close(ws) {
      stateClients.delete(ws);
      presetClients.delete(ws);
      eventClients.delete(ws);
    },
    message() {},
  },
});

console.info(`[background-state-server] écoute sur http://localhost:${PORT} — état dans ${STATE_FILE}`);

// ─── Client OBS (③) ────────────────────────────────────────────────────────────
// Démarre uniquement si un mot de passe est configuré : sans lui, ce serveur se comporte
// exactement comme avant ③ (docs/specs/obs-scene-preset-mapping.md).

/**
 * Applique le preset associé à une scène OBS. Une scène non associée ne change rien : on ne
 * remplace jamais un fond en direct sur un oubli de configuration.
 * @param {string} sceneName
 */
async function applySceneMapping(sceneName) {
  await withStateLock(STATE_LOCK_KEY, async () => {
    const read = await readStateFile();
    if (!read.ok) {
      console.error(`[background-state-server] mapping ignoré, état illisible : ${read.errors.join(' ; ')}`);
      return;
    }

    const { preset, reason } = resolveSceneMapping({
      sceneName,
      sceneMap: readSceneMap(read.file),
      presets: read.file.presets,
    });
    if (preset === null) {
      if (reason === 'missing-preset') {
        console.warn(`[background-state-server] scène "${sceneName}" : preset associé introuvable`);
      }
      return;
    }

    const current = { component: preset.component, options: preset.options };
    await writeStateFile({ ...read.file, current });
    broadcastCurrent(current);
    console.info(`[background-state-server] scène "${sceneName}" → preset "${preset.name}"`);
  });
}

if (OBS_WS_PASSWORD !== '') {
  createObsSceneClient({
    url: OBS_WS_URL,
    password: OBS_WS_PASSWORD,
    onSceneChange: (sceneName) => { applySceneMapping(sceneName); },
    onScenes: (scenes) => { obsStatus.scenes = scenes; },
    onStatus: ({ connected, reason }) => { obsStatus.connected = connected; obsStatus.reason = reason; },
  });
} else {
  obsStatus.reason = 'not-configured';
  console.info('[background-state-server] OBS_WS_PASSWORD absent — mapping scène → preset désactivé');
}
