// @ts-check
/**
 * dev/host.js — Hôte du serveur d'état : routage HTTP/WebSocket et domaine, sans rien démarrer.
 *
 * `createHost(deps)` reçoit tout ce dont il dépend (magasin, canaux, état d'OBS, contrôle du processus) et rend
 * `{ fetch, websocket, applySceneMapping }`, que `dev/background-state-server.js` branche sur `Bun.serve`. Rien n'est
 * lu dans l'environnement, aucun port n'est ouvert, aucun `process.exit` n'est appelé ici : chaque route se teste
 * en appelant `fetch` directement.
 *
 * Routes (les routes de presets sont dans `dev/preset-routes.js`) :
 *   GET  /state         — renvoie `{ current, presets, … }` (500 + erreurs si le fichier est invalide — jamais de
 *                          reset silencieux).
 *   POST /state         — `{ current }`, valide, persiste, diffuse `current` sur le canal `state` et range l'état
 *                          remplacé dans l'historique.
 *   GET  /history       — `{ history }` : les états qui ont quitté l'antenne, le plus récent d'abord.
 *   POST /rollback      — `{ at }`, remet à l'antenne l'état de l'historique daté `at` (404 s'il n'existe plus).
 *   GET  /drafts        — `{ drafts }` : les réglages non enregistrés, par identifiant de preset.
 *   POST /draft         — `{ presetId, state }`, range le brouillon d'un preset (jamais diffusé à l'antenne).
 *   POST /discard-draft — `{ presetId }`, abandonne le brouillon d'un preset.
 *   POST /branding      — `{ branding }`, contenu global de la couche d'identité.
 *   POST /event         — événement de réaction éphémère : validé puis diffusé, jamais persisté.
 *   POST /scene-map     — `{ sceneMap }`, table d'association scène OBS → preset.
 *   POST /control/restart | /control/stop — demande au lanceur de relancer ou d'arrêter les serveurs.
 *   GET  /obs-status, /live-status, /diagnostics — état d'OBS, pages de rendu, faits du diagnostic.
 *   WS   /state-ws, /presets-ws, /event-ws, /branding-ws — voir `dev/channels.js`.
 *
 * Voir docs/specs/background-standalone.md.
 */
import {
  canonicalBackgroundCurrent,
  validateBackgroundCurrent,
  readSceneMap,
  readBranding,
} from './background-state-format.js';
import { CORS_HEADERS, jsonError } from './dev-server-shared.js';
import { rejectNonLocalRequest } from './local-access-policy.js';
import { validateBackgroundEvent } from './background-event-format.js';
import { createPresetRoutes } from './preset-routes.js';
import { findEntry, recordReplaced } from './background-history.js';
import { withDraft, withDrafts, withoutDraft } from './preset-drafts.js';
import { channelForPath } from './channels.js';
import { EXIT_RESTART, EXIT_STOP } from './supervisor.js';
import { resolveSceneMapping, validateSceneMap } from '../obs-scene-mapping.js';
import { validateBranding } from '../branding-format.js';

/**
 * @typedef {import('./background-state-format.js').BackgroundFile} BackgroundFile
 * @typedef {{ connected: boolean, reason: string | null, scenes: string[], activeScene: string | null }} ObsStatus
 * @typedef {{
 *   store: ReturnType<typeof import('./state-store.js').createStateStore>,
 *   channels: ReturnType<typeof import('./channels.js').createChannels>,
 *   obs: { status: () => ObsStatus, configured: boolean, inspect: (() => Promise<import('./obs-inspector.js').ObsInspection>) | null },
 *   control: { supervised: boolean, exit: (code: number) => void },
 *   staticPort: number,
 *   now?: () => string,
 *   log?: Pick<Console, 'info' | 'warn' | 'error'>,
 * }} HostDeps
 */

/**
 * @param {HostDeps} deps
 */
export function createHost({ store, channels, obs, control, staticPort, now = () => new Date().toISOString(), log = console }) {
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

  /** @param {import('./background-state-format.js').BackgroundCurrent} current */
  const broadcastCurrent = (current) => channels.broadcast('state', current);

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
    const { history: _history, drafts: _drafts, ...state } = read.file;
    return new Response(JSON.stringify(state), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  /** @returns {Promise<Response>} */
  async function handleGetDrafts() {
    const read = await store.read();
    if (!read.ok) return jsonError(`fichier d'état invalide : ${read.errors.join(' ; ')}`, 500);
    return Response.json({ drafts: read.file.drafts ?? {} }, { headers: CORS_HEADERS });
  }

  /**
   * POST /draft — `{ presetId, state }`. Le brouillon n'est jamais diffusé : il appartient au Studio.
   * @param {Request} req
   * @returns {Promise<Response>}
   */
  async function handlePostDraft(req) {
    const body = /** @type {*} */ (await req.json());
    if (typeof body?.presetId !== 'string' || body.presetId === '') return jsonError('id de preset manquant', 400);
    const state = /** @type {import('./background-state-format.js').BackgroundCurrent} */ (canonicalBackgroundCurrent(body?.state));
    const validation = validateBackgroundCurrent(state);
    if (!validation.ok) return jsonError(validation.errors.join(' ; '), 400);
    if (state.component === null) return jsonError('un brouillon de preset a un effet', 400);

    return update((file) => {
      if (!file.presets.some((preset) => preset.id === body.presetId)) return jsonError(`preset inconnu : ${body.presetId}`, 404);
      return withDrafts(file, withDraft(file.drafts, body.presetId, state, now()));
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
    return Response.json({ history: read.file.history ?? [] }, { headers: CORS_HEADERS });
  }

  /**
   * POST /state — `{ current }`.
   * @param {Request} req
   * @returns {Promise<Response>}
   */
  async function handlePostState(req) {
    const body = /** @type {*} */ (await req.json());
    // Un client plus ancien peut encore envoyer l'ancien nom d'effet ou « Oui » : on stocke la forme persistée.
    const current = /** @type {import('./background-state-format.js').BackgroundCurrent} */ (canonicalBackgroundCurrent(body?.current));
    const validation = validateBackgroundCurrent(current);
    if (!validation.ok) return jsonError(validation.errors.join(' ; '), 400);

    const response = await update((file) => ({
      ...file,
      current,
      history: recordReplaced({ history: file.history ?? [], replaced: file.current, next: current, at: now() }),
    }));
    if (response.ok) broadcastCurrent(current);
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

    /** @type {import('./background-state-format.js').BackgroundCurrent | null} */
    let restored = null;
    const response = await update((file) => {
      const entry = findEntry(file.history ?? [], body.at);
      if (entry === null) return jsonError(`état inconnu dans l'historique : ${body.at}`, 404);
      restored = entry.current;
      return {
        ...file,
        current: entry.current,
        history: recordReplaced({ history: file.history ?? [], replaced: file.current, next: entry.current, at: now() }),
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
    channels.broadcast('event', body);
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

  /** GET /obs-status — connexion OBS et scènes réelles, pour la section « Scènes OBS » du tuner. */
  function handleGetObsStatus() {
    return Response.json({ ...obs.status(), configured: obs.configured }, { headers: CORS_HEADERS });
  }

  /**
   * GET /live-status — nombre de pages de rendu connectées (une par page : son canal `state`).
   * Seul moyen de savoir, depuis le Studio, qu'une source OBS affiche bien le fond.
   */
  function handleGetLiveStatus() {
    return Response.json({ renderPages: channels.count('state', 'render') }, { headers: CORS_HEADERS });
  }

  /**
   * GET /diagnostics — les faits dont le Studio tire son diagnostic (`dev/diagnostics.js`) : état d'OBS, photographie
   * de ses sources navigateur et scènes (lecture seule), pages de rendu, table scène → preset. À la demande, jamais en
   * boucle : l'inspection fait plusieurs requêtes à OBS.
   */
  async function handleGetDiagnostics() {
    /** @type {import('./obs-inspector.js').ObsInspection | null} */
    let inspection = null;
    /** @type {string | null} */
    let inspectionError = null;
    if (obs.status().connected && obs.inspect !== null) {
      try {
        inspection = await obs.inspect();
      } catch (error) {
        inspectionError = error instanceof Error ? error.message : String(error);
      }
    }
    const read = await store.read();
    return Response.json({
      obs: { ...obs.status(), configured: obs.configured },
      inspection,
      inspectionError,
      renderPages: channels.count('state', 'render'),
      sceneMap: read.ok ? readSceneMap(read.file) : {},
      staticPort,
    }, { headers: CORS_HEADERS });
  }

  /**
   * POST /control/restart | /control/stop — demande au lanceur (`dev/start-stream.js`) de relancer ou d'arrêter
   * les serveurs, par code de sortie (75 / 0). Un en-tête personnalisé est exigé : il force une requête
   * préalable CORS qu'une page étrangère ne passe pas. Hors lanceur, personne ne relancerait : refus.
   * Le serveur ne demande que sa propre sortie, jamais celle d'un autre processus.
   * @param {'restart' | 'stop'} action
   * @returns {(req: Request) => Promise<Response>}
   */
  function controlHandler(action) {
    return async (req) => {
      if (req.headers.get('X-Overlay-Control') !== '1') return jsonError('en-tête X-Overlay-Control requis', 400);
      if (!control.supervised) return jsonError('serveur non supervisé : lancé hors de start-stream', 501);
      setTimeout(() => control.exit(action === 'restart' ? EXIT_RESTART : EXIT_STOP), 100);
      return Response.json({ ok: true, action }, { status: 202, headers: CORS_HEADERS });
    };
  }

  /** @type {Record<string, (req: Request) => Promise<Response>>} */
  const postRoutes = {
    '/control/restart': controlHandler('restart'),
    '/control/stop': controlHandler('stop'),
    '/scene-map': handlePostSceneMap,
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
        presets: file.presets,
      });
      if (preset === null) {
        if (reason === 'missing-preset') {
          log.warn(`[background-state-server] scène "${sceneName}" : preset associé introuvable`);
        }
        return { abort: null };
      }

      // La transition du preset entrant voyage avec l'état : c'est elle qui dit à la page
      // d'animer plutôt que de remplacer sèchement (docs/specs/background-preset-transitions.md).
      const current = {
        component: preset.component,
        options: preset.options,
        ...(preset.transition === undefined ? {} : { transition: preset.transition }),
        ...(preset.showBranding === undefined ? {} : { showBranding: preset.showBranding }),
      };
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

  return {
    applySceneMapping,

    /**
     * @param {Request} req
     * @param {{ upgrade(req: Request, options: { data: import('./channels.js').SocketData }): boolean }} server
     * @returns {Promise<Response | undefined>}
     */
    async fetch(req, server) {
      const rejected = rejectNonLocalRequest(req);
      if (rejected !== null) return rejected;

      const url = new URL(req.url);

      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

      const channel = channelForPath(url.pathname);
      if (channel !== null) {
        const role = url.searchParams.get('role') === 'render' ? 'render' : 'studio';
        const upgraded = server.upgrade(req, { data: { channel, role } });
        return upgraded ? undefined : new Response('upgrade failed', { status: 500 });
      }

      if (req.method === 'GET' && url.pathname === '/state') return handleGetState();
      if (req.method === 'GET' && url.pathname === '/history') return handleGetHistory();
      if (req.method === 'GET' && url.pathname === '/drafts') return handleGetDrafts();
      if (req.method === 'GET' && url.pathname === '/obs-status') return handleGetObsStatus();
      if (req.method === 'GET' && url.pathname === '/live-status') return handleGetLiveStatus();
      if (req.method === 'GET' && url.pathname === '/diagnostics') return handleGetDiagnostics();

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
      /** @param {import('./channels.js').ChannelSocket} ws */
      open: (ws) => channels.add(ws),
      /** @param {import('./channels.js').ChannelSocket} ws */
      close: (ws) => channels.remove(ws),
      message() {},
    },
  };
}
