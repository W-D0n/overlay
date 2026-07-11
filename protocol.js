// @ts-check
/**
 * protocol.js — Logique pure du protocole `{ type, data }` (S2)
 *
 * AUCUN effet de bord : ni DOM, ni réseau, ni temps. Fonctions pures, déterministes.
 * Importable par le navigateur (via store.js) et par `bun test`.
 *
 * - `reduceMessage(state, message, context)` : décide quoi faire (patch/events/warnings/effects)
 *   sans rien exécuter. C'est store.js qui exécute la décision.
 * - `validateSceneConfig(config)` : vérifie algorithmiquement les invariants d'une SceneConfig.
 *
 * Voir docs/specs/scene-config-protocol.md
 */

import { COMPONENT_NAMES, isBackgroundComponent } from './component-names.js';

// ─── Constantes de repli (AD-3) ─────────────────────────────────────────────

/** Transition de repli — utilisée quand la résolution échoue ou est incomplète. */
export const DEFAULT_TRANSITION = { type: 'crossfade', duration: 400, easing: 'easeInOut' };

// ─── Domaines de valeurs valides ────────────────────────────────────────────

const VISIBILITY_LEVELS = ['full', 'minimal', 'hidden'];
const TRANSITION_TYPES = ['crossfade', 'cut', 'slide', 'wipe', 'morph'];

/**
 * `SceneId` est une chaîne ouverte depuis S8 (voir types.js) — la liste réelle des scènes valides
 * vit dans `scenes/registry.js`, pas ici (`protocol.js` reste découplé des modules de scène, AD-1).
 * `validateSceneConfig`/`reduceMessage` ne valident donc qu'une structure (chaîne non-vide) ;
 * l'existence réelle est vérifiée en aval par `scene-runtime.js` `mountScene()` (avertit et
 * n'affiche rien si l'id est inconnu du registry). Un `background` (Track B, `ComponentMount`)
 * réplie sur son mode par défaut en interne au composant lui-même (ex. `DotGridBackground`), pas ici.
 * @param {unknown} value
 * @returns {value is string}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

// ─── Helpers de construction de ReduceResult ────────────────────────────────

/** @returns {import('./types.js').ReduceResult} */
function emptyResult() {
  return { patch: null, events: [], warnings: [], effects: [] };
}

/**
 * @param {string} warning
 * @returns {import('./types.js').ReduceResult}
 */
function warnOnly(warning) {
  return { patch: null, events: [], warnings: [warning], effects: [] };
}

/**
 * @param {Partial<import('./types.js').StreamState>} patch
 * @returns {import('./types.js').ReduceResult}
 */
function patchOnly(patch) {
  return { patch, events: [], warnings: [], effects: [] };
}

/**
 * Coerce une valeur non fiable en objet exploitable (sinon objet vide).
 * @param {*} value
 * @returns {Record<string, *>}
 */
function asObject(value) {
  return (typeof value === 'object' && value !== null) ? value : {};
}

// ─── reduceMessage ──────────────────────────────────────────────────────────

/**
 * Réduit un message entrant en une décision pure.
 *
 * @param {import('./types.js').StreamState} state - État courant (lu, jamais muté)
 * @param {*} message - Message brut, potentiellement malformé
 * @param {import('./types.js').ReduceContext} [context] - Valeurs non-déterministes injectées
 * @returns {import('./types.js').ReduceResult}
 */
export function reduceMessage(state, message, context = { now: 0 }) {
  // Garde d'entrée : message malformé → résultat vide, jamais d'exception.
  if (typeof message !== 'object' || message === null || typeof message.type !== 'string') {
    return emptyResult();
  }

  const { type, data } = message;

  switch (type) {
    // ── Nouveaux types (S2) ──────────────────────────────────
    case 'scene.set':      return reduceSceneSet(state, data);
    case 'visibility.set': return reduceVisibilitySet(state, data);
    case 'morph.trigger':  return reduceMorphTrigger(data);

    // ── Types existants migrés (comportement identique au legacy) ──
    case 'stream.stats':
      return patchOnly({
        viewers:  asObject(data).viewers  ?? state.viewers,
        duration: asObject(data).duration ?? state.duration,
      });

    case 'chat.message':
      return patchOnly({ chatMessages: [data, ...state.chatMessages].slice(0, 20) });

    case 'alert.follow':
    case 'alert.sub':
    case 'alert.raid':
    case 'alert.bits':
      return reduceAlert(type, data, context);

    case 'poll.update': return patchOnly({ activePoll: data });
    case 'poll.end':    return patchOnly({ activePoll: null });
    case 'pomodoro.tick': return patchOnly({ pomodoro: data });

    case 'context.update': {
      const d = asObject(data);
      return patchOnly({
        currentActivity: d.activity ?? state.currentActivity,
        currentFile:     d.file     ?? state.currentFile,
        currentBranch:   d.branch   ?? state.currentBranch,
        currentTool:     d.tool     ?? state.currentTool,
        subjectLine:     d.subject  ?? state.subjectLine,
        currentSong:     d.song     ?? state.currentSong,
      });
    }

    case 'session.start':
      return {
        patch: { sessionId: asObject(data).id ?? state.sessionId },
        events: [],
        warnings: [],
        effects: ['reset-duration-timer'],
      };

    // ── Type inconnu : ignoré silencieusement ────────────────
    default:
      return emptyResult();
  }
}

/**
 * @param {import('./types.js').StreamState} state
 * @param {*} data
 * @returns {import('./types.js').ReduceResult}
 */
function reduceSceneSet(state, data) {
  if (typeof data !== 'object' || data === null) {
    return warnOnly('[overlay] scene.set : data manquant');
  }

  const scene = data.scene;
  if (!isNonEmptyString(scene)) {
    return warnOnly(`[overlay] scene.set : scène inconnue — ${String(scene)}`);
  }

  // Idempotence : changer pour la scène déjà active est un no-op.
  if (scene === state.currentScene) {
    return emptyResult();
  }

  /** @type {{ scene: string, transition?: object }} */
  const detail = { scene };
  const warnings = [];
  const override = data.transition;

  if (override !== undefined) {
    if (typeof override !== 'object' || override === null) {
      warnings.push(`[overlay] scene.set : transition invalide — ${String(override)}`);
    } else if (override.type !== undefined && !TRANSITION_TYPES.includes(override.type)) {
      warnings.push(`[overlay] scene.set : type de transition inconnu — ${String(override.type)}`);
    } else {
      // Seul `type` est validé ici ; duration/easing sont sanitisés à la résolution runtime.
      detail.transition = override;
    }
  }

  return {
    patch: { currentScene: /** @type {*} */ (scene) },
    events: [{ name: 'overlay:scene-change', detail }],
    warnings,
    effects: [],
  };
}

/**
 * @param {import('./types.js').StreamState} state
 * @param {*} data
 * @returns {import('./types.js').ReduceResult}
 */
function reduceVisibilitySet(state, data) {
  if (typeof data !== 'object' || data === null) {
    return warnOnly('[overlay] visibility.set : data manquant');
  }

  const level = data.level;
  if (typeof level !== 'string' || !VISIBILITY_LEVELS.includes(level)) {
    return warnOnly(`[overlay] visibility.set : niveau inconnu — ${String(level)}`);
  }

  if (level === state.visibilityLevel) {
    return emptyResult();
  }

  return {
    patch: { visibilityLevel: /** @type {*} */ (level) },
    events: [{ name: 'overlay:visibility-change', detail: { level } }],
    warnings: [],
    effects: [],
  };
}

/**
 * @param {*} data
 * @returns {import('./types.js').ReduceResult}
 */
function reduceMorphTrigger(data) {
  // data absent → relais avec detail vide, sans warning.
  if (data === undefined) {
    return { patch: null, events: [{ name: 'overlay:morph', detail: {} }], warnings: [], effects: [] };
  }
  // data présent mais non-objet → relais detail vide + warning.
  if (typeof data !== 'object' || data === null) {
    return {
      patch: null,
      events: [{ name: 'overlay:morph', detail: {} }],
      warnings: [`[overlay] morph.trigger : data invalide — ${String(data)}`],
      effects: [],
    };
  }
  // Nominal : relais tel quel. Pas d'idempotence (rejouer un morph est valide).
  return { patch: null, events: [{ name: 'overlay:morph', detail: data }], warnings: [], effects: [] };
}

/**
 * @param {string} type - 'alert.follow' | 'alert.sub' | 'alert.raid' | 'alert.bits'
 * @param {*} data
 * @param {import('./types.js').ReduceContext} context
 * @returns {import('./types.js').ReduceResult}
 */
function reduceAlert(type, data, context) {
  const d = asObject(data);
  return patchOnly({
    latestAlert: /** @type {*} */ ({
      type:      type.split('.')[1],
      username:  d.username ?? 'Anonyme',
      timestamp: context.now,
      amount:    d.amount,
    }),
  });
}

// ─── validateSceneConfig ────────────────────────────────────────────────────

/**
 * Vérifie algorithmiquement les invariants d'une SceneConfig.
 * Ne lève jamais — même sur un input structurellement corrompu.
 *
 * @param {*} config
 * @returns {import('./types.js').ValidationResult}
 */
export function validateSceneConfig(config) {
  /** @type {string[]} */
  const errors = [];

  // V0a — config est un objet non-null
  if (typeof config !== 'object' || config === null) {
    return { ok: false, errors: ['config absente ou non-objet'] };
  }
  // V0b — layers est un tableau
  if (!Array.isArray(config.layers)) {
    return { ok: false, errors: ['layers absent ou non-tableau'] };
  }
  // V0c — chaque couche est structurellement bien formée
  config.layers.forEach((/** @type {*} */ layer, /** @type {number} */ i) => {
    const wellFormed = typeof layer === 'object' && layer !== null
      && typeof layer.name === 'string'
      && typeof layer.visibility === 'object' && layer.visibility !== null
      && Array.isArray(layer.components);
    if (!wellFormed) errors.push(`couche malformée à l'index ${i}`);
  });

  // V1 — id est une chaîne non-vide (S8 : SceneId ouvert, existence vérifiée par scene-runtime.js)
  if (!isNonEmptyString(config.id)) errors.push(`id invalide : ${String(config.id)}`);

  // V2 — background est null ou un ComponentMount dont le composant est utilisable comme fond
  // (Track B : #bg-layer polymorphe, remplace dotgridMode). Restreint aux `*Background` — un
  // composant non prévu pour un fond (ex : StatBlock) était accepté par erreur avant la review
  // architecture 2026-07-11 (validation identique à V8, trop permissive pour ce cas précis).
  if (config.background !== null
      && (typeof config.background !== 'object' || config.background === null
          || !isBackgroundComponent(config.background.component))) {
    errors.push(`background invalide : ${String(config.background)}`);
  }

  // V3 — transition valide
  const t = config.transition;
  if (typeof t !== 'object' || t === null || !TRANSITION_TYPES.includes(t.type)
      || typeof t.duration !== 'number' || t.duration < 0) {
    errors.push('transition invalide');
  }

  // Pour V4→V9, n'opérer que sur les couches bien formées (évite tout accès qui plante).
  const layers = config.layers.filter((/** @type {*} */ l) =>
    typeof l === 'object' && l !== null
    && typeof l.name === 'string'
    && typeof l.visibility === 'object' && l.visibility !== null
    && Array.isArray(l.components));

  // V4 — exactement une couche goldbar
  const goldbars = layers.filter((/** @type {*} */ l) => l.name === 'goldbar');
  if (goldbars.length === 0) errors.push('goldbar manquante');
  else if (goldbars.length > 1) errors.push('goldbar dupliquée');

  // V5 — goldbar survit au niveau minimal
  for (const g of goldbars) {
    if (g.visibility.minimal !== true) errors.push('goldbar doit survivre au niveau minimal');
  }

  // V6 — noms de couches uniques
  const seen = new Set();
  for (const l of layers) {
    if (seen.has(l.name)) errors.push(`nom de couche dupliqué : ${l.name}`);
    seen.add(l.name);
  }

  // V7 — visibilité cohérente : hidden ⟹ minimal ⟹ full
  for (const l of layers) {
    const v = l.visibility;
    const coherent = (!v.hidden || v.minimal === true) && (!v.minimal || v.full === true);
    if (!coherent) errors.push(`visibilité incohérente sur ${l.name}`);
  }

  // V8 — chaque component ∈ ComponentName
  for (const l of layers) {
    for (const c of l.components) {
      if (typeof c !== 'object' || c === null || !COMPONENT_NAMES.includes(c.component)) {
        errors.push(`composant inconnu : ${String(c && c.component)}`);
      }
    }
  }

  // V9 — au moins une couche visible en full
  if (!layers.some((/** @type {*} */ l) => l.visibility.full === true)) {
    errors.push('aucune couche visible en full');
  }

  // V10 — placement de couche (optionnel, S7) : x/y finis, width/height finis positifs si fournis
  for (const l of layers) {
    if (l.placement === undefined) continue;
    validatePlacement(l.placement, l.name, errors);
  }

  // V11 — placement de composant individuel (optionnel, S8, voir docs/specs/scene-definition-v2.md)
  for (const l of layers) {
    l.components.forEach((/** @type {*} */ c, /** @type {number} */ i) => {
      if (c.placement === undefined) return;
      validatePlacement(c.placement, `composant ${c.component ?? '?'} (couche ${l.name}, index ${i})`, errors);
    });
  }

  // V12 — `role` unique par scène (optionnel, seam wire.js ↔ scene.json, voir docs/inbox.md)
  const seenRoles = new Set();
  for (const l of layers) {
    for (const c of l.components) {
      if (typeof c !== 'object' || c === null || c.role === undefined) continue;
      if (seenRoles.has(c.role)) errors.push(`role dupliqué : ${c.role}`);
      seenRoles.add(c.role);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Valider un `Placement` (couche ou composant) — pousse les erreurs dans `errors` (mutation
 * intentionnelle, même style que le reste de `validateSceneConfig`).
 * @param {*} p
 * @param {string} label - Décrit la cible dans le message d'erreur
 * @param {string[]} errors
 */
function validatePlacement(p, label, errors) {
  const validXY = typeof p === 'object' && p !== null && Number.isFinite(p.x) && Number.isFinite(p.y);
  if (!validXY) { errors.push(`placement invalide sur ${label} : x/y doivent être des nombres finis`); return; }
  if (p.width !== undefined && (!Number.isFinite(p.width) || p.width <= 0)) {
    errors.push(`placement invalide sur ${label} : width doit être un nombre fini strictement positif`);
  }
  if (p.height !== undefined && (!Number.isFinite(p.height) || p.height <= 0)) {
    errors.push(`placement invalide sur ${label} : height doit être un nombre fini strictement positif`);
  }
}
