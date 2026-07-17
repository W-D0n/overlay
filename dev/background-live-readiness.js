// @ts-check
import { backgroundCurrentUrl, backgroundPresetUrl } from '../background-selection.js';
import { COMPONENT_NAMES } from '../component-names.js';

/** @param {import('./background-state-format.js').BackgroundFile} file */
function stateReadyCheck(file) {
  return {
    id: 'state',
    status: 'ready',
    title: 'État du fond disponible',
    detail: `${file.presets.length} preset(s) personnel(s) relu(s) sans erreur.`,
  };
}

/** @param {{ fps: number | null, pixelRatio: number | null, paused: boolean }} runtime */
function runtimeCheck(runtime) {
  const measured = !runtime.paused
    && Number.isFinite(runtime.fps)
    && Number.isFinite(runtime.pixelRatio);
  return {
    id: 'runtime',
    status: measured ? 'ready' : 'attention',
    title: measured ? 'Mesure locale disponible' : 'Mesure en attente',
    detail: measured
      ? `${runtime.fps} FPS · DPR ${runtime.pixelRatio}. À confirmer dans OBS.`
      : 'Garde l’aperçu visible quelques secondes, puis relance le contrôle.',
  };
}

/** @param {{ reachable: boolean | null }} relay */
function relayCheck(relay) {
  return {
    id: 'relay',
    status: 'ready',
    title: 'Mode OBS autonome',
    detail: relay.reachable
      ? 'Le relais est détecté, mais cette URL de fond n’en dépend pas.'
      : 'Le relais n’est pas démarré, ce qui est normal pour une URL de fond autonome.',
  };
}

/** @param {{ status: string }[]} checks */
function reportStatus(checks) {
  if (checks.some(({ status }) => status === 'blocking')) return 'blocking';
  if (checks.some(({ status }) => status === 'attention')) return 'attention';
  return 'ready';
}

/**
 * Relit les services nécessaires au diagnostic. Toutes les requêtes sont des GET sans écriture.
 * L'absence du relais reste un constat informatif : le mode background-only n'en dépend pas.
 *
 * @param {{
 *   stateServer: string,
 *   relayUrl?: string,
 *   selection: { presetId: string | null, quality: 'auto' | 'performance' },
 *   runtime: { fps: number | null, pixelRatio: number | null, paused: boolean },
 *   fetchImpl?: typeof fetch,
 * }} input
 */
export async function collectBackgroundLiveReadiness(input) {
  const stateServer = input.stateServer.replace(/\/$/, '');
  const relayUrl = input.relayUrl ?? 'http://localhost:4456/';
  const fetchImpl = input.fetchImpl ?? fetch;
  const signal = AbortSignal.timeout(1500);

  const [stateResult, relayResult] = await Promise.allSettled([
    fetchImpl(`${stateServer}/state`, { method: 'GET', signal }).then(async (response) => {
      if (!response.ok) throw new Error(`GET /state → ${response.status}`);
      return response.json();
    }),
    fetchImpl(relayUrl, { method: 'GET', mode: 'no-cors', signal }),
  ]);

  const state = stateResult.status === 'fulfilled'
    ? { ok: true, file: stateResult.value }
    : { ok: false, error: String(stateResult.reason) };

  return evaluateBackgroundLiveReadiness({
    state,
    selection: input.selection,
    runtime: input.runtime,
    relay: { reachable: relayResult.status === 'fulfilled' },
  });
}

/**
 * Transforme les constats techniques du tuner en rapport lisible avant un live.
 * Cette fonction ne réalise aucune I/O et ne modifie ni l'état du fond ni OBS.
 *
 * @param {{
 *   state: { ok: true, file: import('./background-state-format.js').BackgroundFile } | { ok: false, error: string },
 *   selection: { presetId: string | null, quality: 'auto' | 'performance' },
 *   runtime: { fps: number | null, pixelRatio: number | null, paused: boolean },
 *   relay: { reachable: boolean | null },
 * }} input
 */
export function evaluateBackgroundLiveReadiness(input) {
  const runtime = runtimeCheck(input.runtime);
  const relay = relayCheck(input.relay);

  if (!input.state.ok) {
    const checks = [
      {
        id: 'state',
        status: 'blocking',
        title: 'Serveur d’état indisponible',
        detail: 'Le Studio ne peut pas relire le fond. Ferme puis relance start-dev.bat ou start-stream.bat.',
        action: { label: 'Réessayer', type: 'retry' },
      },
      {
        id: 'selection',
        status: 'attention',
        title: 'Sélection non vérifiable',
        detail: 'L’effet ou le preset pourra être contrôlé dès que le serveur d’état répondra.',
      },
      {
        id: 'url',
        status: 'blocking',
        title: 'URL OBS indisponible',
        detail: 'Relance le service d’état avant de préparer l’adresse de la Source Navigateur.',
        action: { label: 'Réessayer', type: 'retry' },
      },
      runtime,
      relay,
    ];
    return {
      status: reportStatus(checks),
      obsUrl: null,
      checks,
    };
  }

  const preset = input.state.file.presets.find(({ id }) => id === input.selection.presetId);
  if (input.selection.presetId !== null && preset === undefined) {
    const checks = [
      stateReadyCheck(input.state.file),
      {
        id: 'selection',
        status: 'blocking',
        title: 'Preset introuvable',
        detail: 'Le preset chargé n’existe plus dans la bibliothèque personnelle.',
        action: { label: 'Choisir un preset existant', type: 'focus-presets' },
      },
      {
        id: 'url',
        status: 'blocking',
        title: 'URL OBS non créée',
        detail: 'Choisis un preset existant avant de copier son adresse.',
        action: { label: 'Choisir un preset existant', type: 'focus-presets' },
      },
      runtime,
      relay,
    ];
    return {
      status: reportStatus(checks),
      obsUrl: null,
      checks,
    };
  }

  const selectedComponent = preset?.component ?? input.state.file.current.component;
  if (typeof selectedComponent === 'string' && !COMPONENT_NAMES.includes(selectedComponent)) {
    const checks = [
      stateReadyCheck(input.state.file),
      {
        id: 'selection',
        status: 'blocking',
        title: 'Effet inconnu',
        detail: `${selectedComponent} n’est pas disponible dans cette version du Studio.`,
        action: { label: 'Choisir un effet disponible', type: 'focus-effect' },
      },
      {
        id: 'url',
        status: 'blocking',
        title: 'URL OBS non créée',
        detail: 'Choisis un effet disponible avant de copier l’adresse.',
        action: { label: 'Choisir un effet disponible', type: 'focus-effect' },
      },
      runtime,
      relay,
    ];
    return {
      status: reportStatus(checks),
      obsUrl: null,
      checks,
    };
  }

  const obsUrl = preset === undefined
    ? backgroundCurrentUrl(
      undefined,
      { performance: input.selection.quality === 'performance' },
    )
    : backgroundPresetUrl(
      preset.id,
      undefined,
      { performance: input.selection.quality === 'performance' },
    );
  const selectionNeedsAttention = selectedComponent === null;
  const checks = [
    stateReadyCheck(input.state.file),
    {
      id: 'selection',
      status: selectionNeedsAttention ? 'attention' : 'ready',
      title: selectionNeedsAttention
        ? 'Aucun effet actif'
        : (preset === undefined ? 'Effet courant prêt' : 'Preset prêt'),
      detail: selectionNeedsAttention
        ? 'L’URL est valide, mais elle affichera volontairement un fond vide.'
        : (preset === undefined
          ? `${selectedComponent} est l’effet suivi en direct par le tuner.`
          : `${preset.name} utilise ${selectedComponent}.`),
      ...(selectionNeedsAttention
        ? { action: { label: 'Choisir un effet', type: 'focus-effect' } }
        : {}),
    },
    {
      id: 'url',
      status: 'ready',
      title: 'URL OBS prête',
      detail: preset === undefined
        ? 'Cette adresse suit l’effet courant du tuner.'
        : 'Cette adresse reste attachée à l’identifiant stable du preset.',
      action: { label: 'Copier l’URL OBS', value: obsUrl },
    },
    runtime,
    relay,
  ];

  return {
    status: reportStatus(checks),
    obsUrl,
    checks,
  };
}
