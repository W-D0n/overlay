// @ts-check
/**
 * dev/ops-routes.js — The operating routes of the state server: what is connected and what the Studio needs to diagnose, and the launcher's restart and stop. No scene, no preset:
 * they read the process (OBS, the render pages, the media library) and the bench report, and ask the launcher to exit.
 *
 *   GET  /obs-status    — OBS connection and real scenes, for the « Scènes OBS » section of the tuner.
 *   GET  /live-status   — the number of render pages connected (one per page: its `state` channel).
 *   GET  /diagnostics   — the facts the Studio's diagnostic is made of (`dev/diagnostics.js`).
 *   GET|POST /bench-result — the last report of the OBS measuring bench (`dev/obs-bench.html`), kept next to the state file.
 *   POST /control/restart | /control/stop — asks the launcher (`dev/start-stream.js`) to restart or stop the servers.
 */
import { CORS_HEADERS, jsonError } from './dev-server-shared.js';
import { readSceneMap } from './background-state-format.js';
import { validateBenchReport } from './obs-bench.js';
import { collectAssetUsage } from './asset-format.js';
import { errorMessage } from './error-message.js';
import { EXIT_RESTART, EXIT_STOP } from './supervisor.js';

/**
 * @param {{
 *   store: ReturnType<typeof import('./state-store.js').createStateStore>,
 *   assets: ReturnType<typeof import('./asset-store.js').createAssetStore>,
 *   channels: ReturnType<typeof import('./channels.js').createChannels>,
 *   obs: { status: () => { connected: boolean, reason: string | null, scenes: string[], activeScene: string | null }, configured: boolean, inspect: (() => Promise<import('./obs-inspector.js').ObsInspection>) | null },
 *   control: { supervised: boolean, exit: (code: number) => void },
 *   staticPort: number,
 * }} deps
 * @returns {{ get: Record<string, () => Response | Promise<Response>>, post: Record<string, (req: Request) => Promise<Response>> }}
 */
export function createOpsRoutes({ store, assets, channels, obs, control, staticPort }) {
  /** GET /bench-result — le dernier rapport du banc de mesure OBS (404 tant qu'aucun n'a été envoyé). */
  async function handleGetBenchResult() {
    const file = Bun.file(`${store.path}.bench.json`);
    if (!(await file.exists())) return jsonError('aucun rapport du banc de mesure', 404);
    return new Response(await file.text(), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  /**
   * POST /bench-result — le rapport de la page `dev/obs-bench.html`, rangé à côté du fichier d'état.
   * @param {Request} req
   * @returns {Promise<Response>}
   */
  async function handlePostBenchResult(req) {
    const checked = validateBenchReport(await req.json());
    if (!checked.ok) return jsonError(checked.error, 400);
    await Bun.write(`${store.path}.bench.json`, `${JSON.stringify(checked.report, null, 2)}
`);
    return Response.json({ ok: true }, { headers: CORS_HEADERS });
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
   * Les images que les scènes utilisent (l'historique n'affiche rien à l'antenne : il ne compte pas) et combien manquent dans la
   * médiathèque.
   * @param {Awaited<ReturnType<typeof store.read>>} read
   * @returns {Promise<{ referenced: number, missing: number }>}
   */
  async function readAssetUse(read) {
    if (!read.ok) return { referenced: 0, missing: 0 };
    const { history: _history, ...live } = /** @type {Record<string, unknown>} */ (read.file);
    const referenced = [...collectAssetUsage(live).keys()];
    const present = new Set((await assets.list().catch(() => [])).map((asset) => asset.id));
    return { referenced: referenced.length, missing: referenced.filter((id) => !present.has(id)).length };
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
        inspectionError = errorMessage(error);
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
      assetUse: await readAssetUse(read),
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

  return {
    get: {
      '/bench-result': handleGetBenchResult,
      '/obs-status': handleGetObsStatus,
      '/live-status': handleGetLiveStatus,
      '/diagnostics': handleGetDiagnostics,
    },
    post: {
      '/control/restart': controlHandler('restart'),
      '/control/stop': controlHandler('stop'),
      '/bench-result': handlePostBenchResult,
    },
  };
}
