// @ts-check
/**
 * dev/host.js — Hôte du serveur d'état : routage HTTP/WebSocket et domaine, sans rien démarrer.
 *
 * `createHost(deps)` reçoit tout ce dont il dépend (magasin, canaux, état d'OBS, contrôle du processus) et rend
 * `{ fetch, websocket, applySceneMapping }`, que `dev/background-state-server.js` branche sur `Bun.serve`. Rien n'est
 * lu dans l'environnement, aucun port n'est ouvert, aucun `process.exit` n'est appelé ici : chaque route se teste
 * en appelant `fetch` directement.
 *
 * Routes (les routes de presets sont dans `dev/preset-routes.js`, celles d'exploitation dans `dev/ops-routes.js`) :
 *   GET  /state         — renvoie la scène en antenne et les scènes (`scene`, `scenes`) avec leur projection plate
 *                          (`current`, `presets`, voir `dev/state-wire.js`) ; 500 + erreurs si le fichier est invalide —
 *                          jamais de reset silencieux.
 *   POST /state         — `{ scene }` (scène complète) ou `{ current }` (forme plate), valide, persiste, diffuse sur le
 *                          canal `state` et range la scène remplacée dans l'historique.
 *   GET  /history       — `{ history }` : les scènes qui ont quitté l'antenne, la plus récente d'abord.
 *   POST /rollback      — `{ at }`, remet à l'antenne la scène de l'historique datée `at` (404 si elle n'existe plus).
 *   GET  /drafts        — `{ drafts }` : les réglages non enregistrés, par identifiant de preset.
 *   POST /draft         — `{ presetId, scene }` ou `{ presetId, state }`, range le brouillon d'un preset (jamais diffusé
 *                          à l'antenne).
 *   POST /discard-draft — `{ presetId }`, abandonne le brouillon d'un preset.
 *   POST /branding      — `{ branding }`, contenu global de la couche d'identité.
 *   POST /event         — événement de réaction éphémère : validé puis diffusé, jamais persisté ; 429 au-delà du limiteur de `dev/event-intake.js`.
 *   POST /scene-map     — `{ sceneMap }`, table d'association scène OBS → preset.
 *   GET  /studio-settings — `{ customCommands, preferences, templates }` : les réglages du Studio qui suivent l'utilisateur.
 *   POST /studio-settings — `{ customCommands?, preferences?, templates? }`, commandes et modèles remplacés en bloc, préférences fusionnées
 *                          (`null` retire une clé) ; diffusé sur le canal `studio`.
 *   GET|POST /versions, POST /versions/rename, DELETE /versions/<id> — les versions nommées d'une scène (voir `dev/version-routes.js`).
 *   GET|POST /assets, GET|DELETE /assets/<id> — la médiathèque d'images (voir `dev/asset-routes.js`).
 *   GET /connections, POST /connections/obs — les réglages de connexion du Studio, mot de passe OBS compris (voir `dev/connection-routes.js`).
 *   POST /control/restart | /control/stop — demande au lanceur de relancer ou d'arrêter les serveurs.
 *   GET  /obs-status, /live-status, /diagnostics — état d'OBS, pages de rendu, faits du diagnostic.
 *   WS   /state-ws, /presets-ws, /event-ws, /branding-ws, /studio-ws — voir `dev/channels.js`.
 *   WS   /twitchat-ws, et `/` — l'entrée des alertes de Twitchat, protégée par un jeton (voir `dev/twitchat-link.js`).
 *
 * Voir docs/specs/background-standalone.md.
 */
import { hasEffectLayer, readSceneMap, readBranding } from './background-state-format.js';
import { liveFromScene } from '../src/scene/scene-doc.js';
import { liveSceneFromWire, sceneFromWireCurrent, wireBroadcast, wireDrafts, wireHistory, wireState } from './state-wire.js';
import { CORS_HEADERS, jsonError } from './dev-server-shared.js';
import { rejectNonLocalRequest } from './local-access-policy.js';
import { validateBackgroundEvent } from './background-event-format.js';
import { createPresetRoutes } from './preset-routes.js';
import { findEntry, recordReplaced } from './background-history.js';
import { withDraft, withDrafts, withoutDraft } from './preset-drafts.js';
import { channelForPath } from './channels.js';
import { resolveSceneMapping, validateSceneMap } from '../src/obs/obs-scene-mapping.js';
import { validateBranding } from '../src/branding/branding-format.js';
import { applySettingsPatch, normalizeStudioSettings, validateSettingsPatch } from './studio-settings.js';
import { createAssetRoutes } from './asset-routes.js';
import { createVersionRoutes } from './version-routes.js';
import { createEventIntake } from './event-intake.js';
import { createOpsRoutes } from './ops-routes.js';

/** Le fichier d'un asset de la médiathèque : seule route qu'une page isolée (Origin `null`) peut lire. */
const ASSET_FILE_PATH = /^\/assets\/[0-9a-f]{32}$/;

/**
 * @typedef {import('./background-state-format.js').BackgroundFile} BackgroundFile
 * @typedef {{ connected: boolean, reason: string | null, scenes: string[], activeScene: string | null }} ObsStatus
 * @typedef {{
 *   store: ReturnType<typeof import('./state-store.js').createStateStore>,
 *   assets: ReturnType<typeof import('./asset-store.js').createAssetStore>,
 *   versions: ReturnType<typeof import('./version-store.js').createVersionStore>,
 *   channels: ReturnType<typeof import('./channels.js').createChannels>,
 *   obs: { status: () => ObsStatus, configured: boolean, inspect: (() => Promise<import('./obs-inspector.js').ObsInspection>) | null },
 *   control: { supervised: boolean, exit: (code: number) => void },
 *   connections?: ReturnType<typeof import('./connection-routes.js').createConnectionRoutes> | null,
 *   intake?: ReturnType<typeof import('./event-intake.js').createEventIntake>,
 *   twitchat?: ReturnType<typeof import('./twitchat-link.js').createTwitchatLink> | null,
 *   staticPort: number,
 *   now?: () => string,
 *   log?: Pick<Console, 'info' | 'warn' | 'error'>,
 * }} HostDeps
 */

/**
 * @param {HostDeps} deps
 */
export function createHost({ store, assets, versions, channels, obs, control, connections = null, intake = createEventIntake({ channels }), twitchat = null, staticPort, now = () => new Date().toISOString(), log = console }) {
  /**
   * Lecture + transformation + écriture. `decide` rend soit une Response d'erreur, soit le fichier à persister.
   * @param {(file: BackgroundFile) => Response | BackgroundFile} decide
   * @returns {Promise<Response>}
   */
  async function update(decide) {
    const result = await store.transact((file) => {
      const decision = decide(file);
      return decision instanceof Response ? { abort: decision } : { file: decision };
    });
    if (result.status === 'unreadable') return jsonError(`fichier d'état invalide : ${result.errors.join(' ; ')}`, 500);
    if (result.status === 'aborted') return /** @type {Response} */ (result.abort);
    return new Response('ok', { headers: CORS_HEADERS });
  }

  /**
   * Lecture sérialisée avec les écritures afin que la révision décrive un instant cohérent.
   * @param {(file: BackgroundFile) => Response} view
   * @returns {Promise<Response>}
   */
  async function inspect(view) {
    const result = await store.inspect(view);
    if (result.status === 'unreadable') return jsonError(`fichier d'état invalide : ${result.errors.join(' ; ')}`, 500);
    return result.value;
  }

  /** Diffuse la scène en antenne aux pages de rendu : la scène, et sa forme plate pour les pages non rechargées. @param {import('../src/scene/scene-doc.js').SceneDoc} scene */
  const broadcastCurrent = (scene) => channels.broadcast('state', wireBroadcast(scene));

  /**
   * La scène qu'un client veut mettre à l'antenne ou en brouillon : `scene` (complète) ou la forme plate `flat`.
   * @param {unknown} scene
   * @param {unknown} flat
   */
  const clientScene = (scene, flat) => {
    if (scene !== undefined && flat !== undefined) return /** @type {const} */ ({ ok: false, errors: ['scène et forme plate : l’une ou l’autre'] });
    return scene !== undefined ? liveSceneFromWire(scene) : sceneFromWireCurrent(flat);
  };

  const presetRoutes = createPresetRoutes({
    update,
    inspect,
    announce: (preset, action) => channels.broadcast('presets', { id: preset.id, name: preset.name, action }),
  });

  /** @returns {Promise<Response>} */
  async function handleGetState() {
    const read = await store.read();
    if (!read.ok) return jsonError(`fichier d'état invalide : ${read.errors.join(' ; ')}`, 500);
    // L'historique a sa route : les pages de rendu n'ont pas à le charger.
    return new Response(JSON.stringify(wireState(read.file)), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  /** @returns {Promise<Response>} */
  async function handleGetDrafts() {
    const read = await store.read();
    if (!read.ok) return jsonError(`fichier d'état invalide : ${read.errors.join(' ; ')}`, 500);
    return Response.json({ drafts: wireDrafts(read.file.drafts ?? {}) }, { headers: CORS_HEADERS });
  }

  /**
   * POST /draft — `{ presetId, state }`. Le brouillon n'est jamais diffusé : il appartient au Studio.
   * @param {Request} req
   * @returns {Promise<Response>}
   */
  async function handlePostDraft(req) {
    const body = /** @type {*} */ (await req.json());
    if (typeof body?.presetId !== 'string' || body.presetId === '') return jsonError('id de preset manquant', 400);
    const draft = clientScene(body?.scene, body?.state);
    if (!draft.ok) return jsonError(draft.errors.join(' ; '), 400);
    if (!hasEffectLayer(draft.scene)) return jsonError('un brouillon de preset a un effet', 400);

    return update((file) => {
      if (!file.scenes.some((scene) => scene.id === body.presetId)) return jsonError(`preset inconnu : ${body.presetId}`, 404);
      return withDrafts(file, withDraft(file.drafts, body.presetId, draft.scene, now()));
    });
  }

  /**
   * POST /discard-draft — `{ presetId }`. Sans effet si le preset n'a pas de brouillon.
   * @param {Request} req
   * @returns {Promise<Response>}
   */
  async function handleDiscardDraft(req) {
    const body = /** @type {*} */ (await req.json());
    if (typeof body?.presetId !== 'string' || body.presetId === '') return jsonError('id de preset manquant', 400);
    return update((file) => withDrafts(file, withoutDraft(file.drafts, body.presetId)));
  }

  /** @returns {Promise<Response>} */
  async function handleGetHistory() {
    const read = await store.read();
    if (!read.ok) return jsonError(`fichier d'état invalide : ${read.errors.join(' ; ')}`, 500);
    return Response.json({ history: wireHistory(read.file.history ?? []) }, { headers: CORS_HEADERS });
  }

  /**
   * POST /state — `{ current }`.
   * @param {Request} req
   * @returns {Promise<Response>}
   */
  async function handlePostState(req) {
    const body = /** @type {*} */ (await req.json());
    const published = clientScene(body?.scene, body?.current);
    if (!published.ok) return jsonError(published.errors.join(' ; '), 400);

    const response = await update((file) => ({
      ...file,
      current: published.scene,
      history: recordReplaced({ history: file.history ?? [], replaced: file.current, next: published.scene, at: now() }),
    }));
    if (response.ok) broadcastCurrent(published.scene);
    return response;
  }

  /**
   * POST /rollback — `{ at }`. Remet à l'antenne un état de l'historique ; l'état qu'il remplace entre à son tour dans
   * l'historique, un retour se défait donc comme une publication.
   * @param {Request} req
   * @returns {Promise<Response>}
   */
  async function handleRollback(req) {
    const body = /** @type {*} */ (await req.json());
    if (typeof body?.at !== 'string') return jsonError('instant manquant', 400);

    /** @type {import('../src/scene/scene-doc.js').SceneDoc | null} */
    let restored = null;
    const response = await update((file) => {
      const entry = findEntry(file.history ?? [], body.at);
      if (entry === null) return jsonError(`état inconnu dans l'historique : ${body.at}`, 404);
      restored = entry.scene;
      return {
        ...file,
        current: entry.scene,
        history: recordReplaced({ history: file.history ?? [], replaced: file.current, next: entry.scene, at: now() }),
      };
    });
    if (response.ok && restored !== null) broadcastCurrent(restored);
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
    const published = intake.publish(body, 'studio');
    if (!published.ok) return jsonError(published.error, 429);
    return new Response('ok', { headers: CORS_HEADERS });
  }

  /**
   * POST /branding — `{ branding }`. Contenu global de la couche d'identité.
   * @param {Request} req
   * @returns {Promise<Response>}
   */
  async function handlePostBranding(req) {
    const body = /** @type {*} */ (await req.json());
    const validation = validateBranding(body?.branding);
    if (!validation.ok) return jsonError(validation.errors.join(' ; '), 400);

    const response = await update((file) => ({ ...file, branding: body.branding }));
    if (response.ok) channels.broadcast('branding', readBranding({ branding: body.branding }));
    return response;
  }

  /**
   * POST /scene-map — `{ sceneMap }`. Remplace la table d'association scène OBS → preset.
   * @param {Request} req
   * @returns {Promise<Response>}
   */
  async function handlePostSceneMap(req) {
    const body = /** @type {*} */ (await req.json());
    const validation = validateSceneMap(body?.sceneMap);
    if (!validation.ok) return jsonError(validation.errors.join(' ; '), 400);

    return update((file) => ({ ...file, sceneMap: body.sceneMap }));
  }

  /** @returns {Promise<Response>} */
  async function handleGetStudioSettings() {
    const read = await store.read();
    if (!read.ok) return jsonError(`fichier d'état invalide : ${read.errors.join(' ; ')}`, 500);
    return Response.json(normalizeStudioSettings(read.file.studio), { headers: CORS_HEADERS });
  }

  /**
   * POST /studio-settings — `{ customCommands?, preferences?, templates? }`.
   * @param {Request} req
   * @returns {Promise<Response>}
   */
  async function handlePostStudioSettings(req) {
    const body = /** @type {*} */ (await req.json());
    const validation = validateSettingsPatch(body);
    if (!validation.ok) return jsonError(validation.errors.join(' ; '), 400);
    /** @type {import('./studio-settings.js').StudioSettings | null} */
    let next = null;
    const response = await update((file) => {
      next = applySettingsPatch(normalizeStudioSettings(file.studio), body);
      return { ...file, studio: next };
    });
    if (response.ok && next !== null) channels.broadcast('studio', next);
    return response;
  }

  const ops = createOpsRoutes({ store, assets, channels, obs, control, staticPort });

  /** @type {Record<string, () => Response | Promise<Response>>} */
  const getRoutes = {
    '/state': handleGetState,
    '/history': handleGetHistory,
    '/drafts': handleGetDrafts,
    '/studio-settings': handleGetStudioSettings,
    ...ops.get,
  };

  /** @type {Record<string, (req: Request) => Promise<Response>>} */
  const postRoutes = {
    ...ops.post,
    '/scene-map': handlePostSceneMap,
    '/studio-settings': handlePostStudioSettings,
    '/branding': handlePostBranding,
    '/state': handlePostState,
    '/rollback': handleRollback,
    '/draft': handlePostDraft,
    '/discard-draft': handleDiscardDraft,
    '/event': handlePostEvent,
    ...presetRoutes,
  };

  /**
   * Applique le preset associé à une scène OBS. Une scène non associée ne change rien : on ne
   * remplace jamais un fond en direct sur un oubli de configuration.
   * @param {string} sceneName
   */
  async function applySceneMapping(sceneName) {
    await store.transact((file) => {
      const { preset, reason } = resolveSceneMapping({
        sceneName,
        sceneMap: readSceneMap(file),
        presets: file.scenes,
      });
      if (preset === null) {
        if (reason === 'missing-preset') {
          log.warn(`[background-state-server] scène "${sceneName}" : preset associé introuvable`);
        }
        return { abort: null };
      }

      // La transition du preset entrant voyage avec la scène : c'est elle qui dit à la page
      // d'animer plutôt que de remplacer sèchement (docs/specs/background-preset-transitions.md).
      const current = liveFromScene(preset);
      return {
        file: { ...file, current },
        afterWrite() {
          broadcastCurrent(current);
          log.info(`[background-state-server] scène "${sceneName}" → preset "${preset.name}"`);
        },
      };
    }).then((result) => {
      if (result.status === 'unreadable') {
        log.error(`[background-state-server] mapping ignoré, état illisible : ${result.errors.join(' ; ')}`);
      }
    });
  }

  const assetRoutes = createAssetRoutes({ assets, store, log });
  const versionRoutes = createVersionRoutes({ versions, log });

  return {
    applySceneMapping,

    /**
     * @param {Request} req
     * @param {{ upgrade(req: Request, options: { data: import('./channels.js').SocketData }): boolean }} server
     * @returns {Promise<Response | undefined>}
     */
    async fetch(req, server) {
      const url = new URL(req.url);
      const viaTwitchat = twitchat !== null && twitchat.handles(req, url);
      // Une couche Code lit ses fichiers depuis une page isolée, dont l'Origin est `null` : cette lecture seule, d'un fichier de la médiathèque, l'accepte.
      const assetFileRead = req.method === 'GET' && ASSET_FILE_PATH.test(url.pathname);
      const rejected = rejectNonLocalRequest(req, { anyOrigin: viaTwitchat, opaqueOrigin: assetFileRead });
      if (rejected !== null) return rejected;
      if (viaTwitchat) return twitchat.accept(req, url, /** @type {*} */ (server));

      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

      if (assetRoutes.handles(url.pathname)) return assetRoutes.handle(req, url);
      if (versionRoutes.handles(url.pathname)) return versionRoutes.handle(req, url);
      if (connections !== null && connections.handles(url.pathname)) return connections.handle(req, url);

      const channel = channelForPath(url.pathname);
      if (channel !== null) {
        const role = url.searchParams.get('role') === 'render' ? 'render' : 'studio';
        const upgraded = server.upgrade(req, { data: { channel, role } });
        return upgraded ? undefined : new Response('upgrade failed', { status: 500 });
      }

      const read = req.method === 'GET' ? getRoutes[url.pathname] : undefined;
      if (read !== undefined) return read();

      const handler = req.method === 'POST' ? postRoutes[url.pathname] : undefined;
      if (!handler) return jsonError('not found', 404);

      try {
        return await handler(req);
      } catch (err) {
        log.error(`[background-state-server] échec sur ${url.pathname} :`, err);
        return jsonError(String(err), 500);
      }
    },

    websocket: {
      // Une alerte tient en quelques dizaines d'octets ; au-delà, la connexion est coupée avant d'être lue.
      maxPayloadLength: 64 * 1024,
      /** @param {import('./channels.js').ChannelSocket | import('./twitchat-link.js').TwitchatSocket} ws */
      open: (ws) => {
        if ('ingest' in ws.data) twitchat?.open(/** @type {import('./twitchat-link.js').TwitchatSocket} */ (ws));
        else channels.add(/** @type {import('./channels.js').ChannelSocket} */ (ws));
      },
      /** @param {import('./channels.js').ChannelSocket | import('./twitchat-link.js').TwitchatSocket} ws */
      close: (ws) => {
        if ('ingest' in ws.data) twitchat?.close(/** @type {import('./twitchat-link.js').TwitchatSocket} */ (ws));
        else channels.remove(/** @type {import('./channels.js').ChannelSocket} */ (ws));
      },
      /**
       * @param {import('./channels.js').ChannelSocket | import('./twitchat-link.js').TwitchatSocket} ws
       * @param {string | Uint8Array} raw
       */
      message: (ws, raw) => {
        if ('ingest' in ws.data) return twitchat?.message(/** @type {import('./twitchat-link.js').TwitchatSocket} */ (ws), raw);
        return undefined;
      },
    },
  };
}
