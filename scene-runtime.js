// @ts-check
/**
 * scene-runtime.js — Orchestrateur DOM de l'overlay (S3, fond polymorphe Track B).
 *
 * Page unique : monte les scènes par couches (`data-layer`), applique le niveau de
 * visibilité, exécute les transitions (`cut` / `crossfade` / `slide` / `wipe` / `morph`).
 * `#bg-layer` héberge un effet de fond polymorphe (`SceneConfig.background`, un
 * `ComponentMount` comme un autre) — un seul actif à la fois, l'instance survit aux
 * changements de scène tant que le composant ne change pas (AD-B2, voir
 * docs/specs/background-effects-library.md).
 *
 * Consomme `overlay:scene-change` et `overlay:visibility-change` (produits par store.js).
 * Ne câble PAS `overlay:morph` (séquencé couche 3 — AD-7 / AC-36).
 *
 * Voir docs/specs/scene-runtime-engine.md §Comportements.
 */

import { store, onStateChange } from './store.js';
import { validateSceneConfig } from './protocol.js';
import { resolveTransition, isLayerVisible, toCssEasing } from './scene-resolve.js';
import { resolvePlacementStyle } from './placement-resolve.js';
import { resolveBoundValue, resolveBoundOptions, hasBoundOptions, resolveMissingRoles } from './scene-definition-resolve.js';
import { COMPONENT_REGISTRY } from './component-registry.js';
import { SCENE_CONFIGS, SCENE_WIRES, loadDynamicScenes } from './scenes/registry.js';

// ─── État du runtime ──────────────────────────────────────────────────────────

/** @type {import('./types.js').ComponentInstance | null} */ let currentBackground = null;
/** @type {import('./types.js').ComponentMount | null} */ let currentBackgroundMount = null;
/** @type {HTMLElement} */ let bgLayer;
/** @type {HTMLElement} */ let sceneRoot;
/** @type {import('./types.js').MountedScene | null} */ let current = null;
/** @type {import('./types.js').VisibilityLevel} */ let currentLevel = 'full';
/** Transition crossfade en cours, finalisable instantanément (garde double-fire). @type {(() => void) | null} */
let finalizePending = null;

// ─── Montage d'une scène ────────────────────────────────────────────────────────

/**
 * Monte une scène : valide la config, clone le template, monte les composants par
 * couche, câble l'état. Retourne `null` (sans monter) si la scène est inconnue ou invalide.
 *
 * @param {string} id
 * @returns {import('./types.js').MountedScene | null}
 */
function mountScene(id) {
  const config = SCENE_CONFIGS[id];
  if (!config) {
    console.warn(`[overlay] mount : scène inconnue — ${id}`);
    return null;
  }
  const validation = validateSceneConfig(config);
  if (!validation.ok) {
    validation.errors.forEach((e) => console.warn(`[overlay] mount : config invalide — ${e}`));
    return null;
  }

  const template = /** @type {HTMLTemplateElement | null} */ (document.querySelector(`template[data-scene="${id}"]`));
  const container = document.createElement('div');
  container.className = 'scene';
  container.dataset.scene = id;
  if (template) container.appendChild(template.content.cloneNode(true));
  // Pas de template : normal pour une scène entièrement composée de ComponentMount (S8) — les
  // couches manquantes sont synthétisées ci-dessous, pas d'avertissement dans ce cas.

  /** @type {Record<string, import('./types.js').ComponentInstance[]>} */
  const componentsByLayer = {};
  /** @type {Record<string, import('./types.js').ComponentInstance>} */
  const componentsByRole = {};
  /** @type {import('./types.js').ComponentInstance[]} */
  const allInstances = [];
  /** @type {{ instance: import('./types.js').ComponentInstance, mount: import('./types.js').ComponentMount }[]} */
  const boundMounts = [];

  for (const layer of config.layers) {
    let layerEl = container.querySelector(`[data-layer="${layer.name}"]`);
    if (!layerEl) {
      // Synthèse (S8) : une scène/couche sans <template> statique reçoit un conteneur généré —
      // condition nécessaire pour qu'une scène créée par l'éditeur (donnée pure, pas de fichier
      // HTML écrit à la main) puisse se monter.
      layerEl = document.createElement('div');
      layerEl.dataset.layer = layer.name;
      container.appendChild(layerEl);
    }
    if (layer.placement) {
      Object.assign(/** @type {HTMLElement} */ (layerEl).style, resolvePlacementStyle(layer.placement));
    }
    /** @type {import('./types.js').ComponentInstance[]} */
    const instances = [];
    for (const mount of layer.components) {
      const factory = COMPONENT_REGISTRY[mount.component];
      if (!factory) {
        console.warn(`[overlay] mount : composant inconnu — ${mount.component}`);
        continue;
      }
      const resolvedOptions = resolveBoundOptions(mount.options ?? {}, store);
      const instance = factory(resolvedOptions);
      if (mount.placement) {
        Object.assign(instance.el.style, resolvePlacementStyle(mount.placement));
      }
      layerEl.appendChild(instance.el);
      instances.push(instance);
      allInstances.push(instance);
      if (mount.role) componentsByRole[mount.role] = instance;
      if (hasBoundOptions(mount.options ?? {}) || mount.trigger) {
        boundMounts.push({ instance, mount });
      }
    }
    componentsByLayer[layer.name] = instances;
  }

  sceneRoot.appendChild(container);

  /** @type {import('./types.js').MountedScene} */
  const mounted = { id: /** @type {*} */ (id), root: container, componentsByLayer, componentsByRole, boundMounts, destroy: () => {} };
  // Le wire est optionnel (S8) : une scène entièrement déclarative (binding via $bind/trigger)
  // n'a pas besoin de *.wire.js écrit à la main.
  const wire = SCENE_WIRES[id];
  const missingRoles = resolveMissingRoles(wire?.REQUIRED_ROLES ?? [], componentsByRole);
  if (wire && missingRoles.length > 0) {
    console.error(`[overlay] mount : wire de la scène '${id}' désactivé — rôle(s) manquant(s) : ${missingRoles.join(', ')}`);
  }
  const cleanupWire = (wire && missingRoles.length === 0) ? wire(mounted) : (() => {});
  mounted.destroy = () => {
    cleanupWire();
    allInstances.forEach((instance) => instance.destroy?.());
    container.remove();
  };
  return mounted;
}

// ─── Visibilité ───────────────────────────────────────────────────────────────

/**
 * Affiche/masque chaque couche d'une scène selon le niveau de visibilité.
 * @param {import('./types.js').MountedScene} mounted
 * @param {import('./types.js').VisibilityLevel} level
 * @returns {void}
 */
function applyLayerVisibility(mounted, level) {
  const config = SCENE_CONFIGS[mounted.id];
  /** @type {Record<string, import('./types.js').LayerVisibility>} */
  const visibilityByName = {};
  for (const layer of config.layers) visibilityByName[layer.name] = layer.visibility;

  mounted.root.querySelectorAll('[data-layer]').forEach((el) => {
    const name = /** @type {HTMLElement} */ (el).dataset.layer ?? '';
    const visibility = visibilityByName[name];
    /** @type {HTMLElement} */ (el).style.display = visibility && isLayerVisible(visibility, level) ? '' : 'none';
  });
}

/**
 * Applique l'état global lié au niveau : effet de fond + transparence du body.
 * `#bg-layer` visible ⟺ niveau ≠ hidden ET un effet de fond est monté (AD-7).
 * @param {import('./types.js').VisibilityLevel} level
 * @returns {void}
 */
function applyGlobalVisibility(level) {
  bgLayer.style.display = level !== 'hidden' && currentBackground !== null ? '' : 'none';
  document.body.style.background = level === 'hidden' ? 'transparent' : '';
}

/**
 * Applique un niveau de visibilité à la scène courante + à l'état global.
 * @param {import('./types.js').VisibilityLevel} level
 * @returns {void}
 */
function applyVisibility(level) {
  currentLevel = level;
  if (current) applyLayerVisibility(current, level);
  applyGlobalVisibility(level);
}

// ─── Effet de fond (#bg-layer, polymorphe — Track B) ─────────────────────────────

/**
 * Monte/met à jour/démonte l'effet de fond courant (AD-B2, `docs/specs/background-effects-library.md`).
 * Même `component` qu'avant → `update()` sur l'instance existante, jamais de recréation (AC-02).
 * `component` différent (ou `null`) → démonte l'ancien, monte le nouveau si présent (AC-03/AC-04).
 * @param {import('./types.js').ComponentMount | null} mount
 * @returns {void}
 */
function applyBackground(mount) {
  const nextComponent = mount?.component ?? null;
  const prevComponent = currentBackgroundMount?.component ?? null;

  if (nextComponent !== null && nextComponent === prevComponent && currentBackground) {
    currentBackground.update?.(mount.options ?? {});
    currentBackgroundMount = mount;
    applyGlobalVisibility(currentLevel);
    return;
  }

  currentBackground?.destroy?.();
  currentBackground?.el.remove(); // le composant ne se retire pas lui-même (contrat des couches de
  // scène, où c'est le conteneur parent démonté qui l'entraîne — #bg-layer, lui, est permanent)
  currentBackground = null;
  currentBackgroundMount = null;

  if (nextComponent !== null) {
    const factory = COMPONENT_REGISTRY[nextComponent];
    if (!factory) {
      console.warn(`[overlay] background : composant inconnu — ${nextComponent}`);
    } else {
      currentBackground = factory(mount.options ?? {});
      currentBackgroundMount = mount;
      bgLayer.appendChild(currentBackground.el);
    }
  }
  applyGlobalVisibility(currentLevel);
}

// ─── Transition de scène ─────────────────────────────────────────────────────────

/**
 * Crossfade entre l'ancienne et la nouvelle scène, puis démonte l'ancienne.
 * Filet : `transitionend` OU timeout (le premier déclenché annule l'autre).
 * @param {import('./types.js').MountedScene} previous
 * @param {import('./types.js').MountedScene} next
 * @param {import('./types.js').SceneTransition} resolved
 * @returns {void}
 */
function crossfade(previous, next, resolved) {
  next.root.style.opacity = '0';
  void next.root.offsetHeight; // reflow : garantit l'état initial avant la transition
  const css = `opacity ${resolved.duration}ms ${toCssEasing(resolved.easing)}`;
  next.root.style.transition = css;
  previous.root.style.transition = css;
  next.root.style.opacity = '1';
  previous.root.style.opacity = '0';

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    next.root.removeEventListener('transitionend', finish);
    previous.destroy();
    if (finalizePending === finish) finalizePending = null;
  };
  next.root.addEventListener('transitionend', finish, { once: true });
  const timer = setTimeout(finish, resolved.duration + 100);
  finalizePending = finish;
}

/** Axe de translation `slide` selon la direction — gauche/droite = X, haut/bas = Y. */
const SLIDE_AXIS = { left: 'X', right: 'X', up: 'Y', down: 'Y' };
/** Position de départ de l'entrante `slide` selon la direction (sens du glissement). */
const SLIDE_ENTER_FROM = { right: '100%', left: '-100%', up: '-100%', down: '100%' };
/** Position d'arrivée de la sortante `slide` — toujours opposée à l'entrante. */
const SLIDE_EXIT_TO = { right: '-100%', left: '100%', up: '100%', down: '-100%' };

/**
 * Slide entre l'ancienne et la nouvelle scène (translateX/Y), puis démonte l'ancienne.
 * Même filet `transitionend`/timeout que `crossfade` (AC-06).
 * @param {import('./types.js').MountedScene} previous
 * @param {import('./types.js').MountedScene} next
 * @param {import('./types.js').SceneTransition} resolved
 * @returns {void}
 */
function slide(previous, next, resolved) {
  const direction = resolved.direction ?? 'right';
  const axis = SLIDE_AXIS[direction];

  next.root.style.transform = `translate${axis}(${SLIDE_ENTER_FROM[direction]})`;
  void next.root.offsetHeight; // reflow : garantit l'état initial avant la transition
  const css = `transform ${resolved.duration}ms ${toCssEasing(resolved.easing)}`;
  next.root.style.transition = css;
  previous.root.style.transition = css;
  next.root.style.transform = `translate${axis}(0)`;
  previous.root.style.transform = `translate${axis}(${SLIDE_EXIT_TO[direction]})`;

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    next.root.removeEventListener('transitionend', finish);
    next.root.style.transform = '';
    next.root.style.transition = '';
    previous.destroy();
    if (finalizePending === finish) finalizePending = null;
  };
  next.root.addEventListener('transitionend', finish, { once: true });
  const timer = setTimeout(finish, resolved.duration + 100);
  finalizePending = finish;
}

/** `clip-path: inset(...)` de l'entrante `wipe` pour un pourcentage restant à révéler. */
const WIPE_INSET = {
  right: (/** @type {number} */ pct) => `0 ${pct}% 0 0`,
  left: (/** @type {number} */ pct) => `0 0 0 ${pct}%`,
  down: (/** @type {number} */ pct) => `${pct}% 0 0 0`,
  up: (/** @type {number} */ pct) => `0 0 ${pct}% 0`,
};

/**
 * Wipe : révélation de la scène entrante via `clip-path` animé, sortante statique dessous.
 * Même filet `transitionend`/timeout que `crossfade` (AC-06).
 * @param {import('./types.js').MountedScene} previous
 * @param {import('./types.js').MountedScene} next
 * @param {import('./types.js').SceneTransition} resolved
 * @returns {void}
 */
function wipe(previous, next, resolved) {
  const direction = resolved.direction ?? 'right';
  const color = resolved.color ?? 'var(--color-gold)';
  const inset = WIPE_INSET[direction];

  next.root.style.opacity = '1';
  next.root.style.clipPath = inset ? `inset(${inset(100)})` : '';
  next.root.style.boxShadow = `0 0 0 2px ${color}`;
  void next.root.offsetHeight; // reflow : garantit l'état initial avant la transition
  next.root.style.transition = `clip-path ${resolved.duration}ms ${toCssEasing(resolved.easing)}`;
  next.root.style.clipPath = inset ? `inset(${inset(0)})` : '';

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    next.root.removeEventListener('transitionend', finish);
    next.root.style.clipPath = '';
    next.root.style.transition = '';
    next.root.style.boxShadow = '';
    previous.destroy();
    if (finalizePending === finish) finalizePending = null;
  };
  next.root.addEventListener('transitionend', finish, { once: true });
  const timer = setTimeout(finish, resolved.duration + 100);
  finalizePending = finish;
}

/**
 * Fond pour la transition `morph` (Track A, généralisé Track B — AD-B3). Même `component` des
 * deux côtés ET `morphTo` disponible sur l'instance → interpolation via `morphTo` (ex.
 * `DotGridBackground` depuis A3). Sinon (composant différent, absent des deux côtés, ou sans
 * `morphTo`) → un seul côté présent : fondu d'opacité générique de `#bg-layer` (composant-agnostique,
 * ne nécessite aucune connaissance des paramètres internes de l'effet, LAC-01 généralisé) ; les
 * deux côtés identiques en présence (présents des deux côtés mais composant différent, ou absents
 * des deux côtés) → dégrade en swap instantané (AC-06, rien à animer côté fond).
 * @param {import('./types.js').ComponentMount | null} previousMount
 * @param {import('./types.js').ComponentMount | null} enteringMount
 * @param {import('./types.js').SceneTransition} resolved
 * @returns {void}
 */
function morphBackground(previousMount, enteringMount, resolved) {
  const sameComponent = previousMount !== null && enteringMount !== null
    && previousMount.component === enteringMount.component;

  if (sameComponent && typeof currentBackground?.morphTo === 'function') {
    currentBackground.morphTo(enteringMount.options ?? {}, resolved.duration, resolved.easing);
    currentBackgroundMount = enteringMount;
    applyGlobalVisibility(currentLevel);
    return;
  }

  if (Boolean(previousMount) === Boolean(enteringMount)) {
    applyBackground(enteringMount); // même présence des deux côtés (différent ou absent) → rien à animer
    return;
  }

  const css = `opacity ${resolved.duration}ms ${toCssEasing(resolved.easing)}`;
  if (enteringMount !== null) {
    applyBackground(enteringMount);
    bgLayer.style.opacity = '0';
    void bgLayer.offsetHeight; // reflow : garantit l'état initial avant la transition
    bgLayer.style.transition = css;
    bgLayer.style.opacity = '1';
  } else {
    bgLayer.style.transition = css;
    bgLayer.style.opacity = '0';
  }
  setTimeout(() => {
    bgLayer.style.transition = '';
    bgLayer.style.opacity = '';
    if (enteringMount === null) applyBackground(null); // démonte réellement une fois le fondu terminé
  }, resolved.duration + 100);
}

/**
 * Traite un changement de scène (`overlay:scene-change`).
 * @param {{ scene?: string, transition?: unknown }} detail
 * @returns {void}
 */
function handleSceneChange(detail) {
  const scene = detail.scene;
  if (typeof scene !== 'string') return;
  if (current && scene === current.id) return; // garde défensive (filtré en amont par reduceMessage)

  const entering = SCENE_CONFIGS[scene];
  if (!entering) {
    console.warn(`[overlay] scene-change : scène inconnue — ${scene}`);
    return;
  }
  const resolved = resolveTransition(detail.transition, entering.transition);

  if (finalizePending) finalizePending(); // finalise une transition en cours avant d'en démarrer une autre

  const next = mountScene(scene);
  if (!next) return; // config invalide → l'ancienne scène reste

  applyLayerVisibility(next, currentLevel); // le niveau courant est ré-appliqué (AC-34)

  const previousMount = currentBackgroundMount;
  const enteringMount = entering.background ?? null;
  const previous = current;
  current = next;

  if (resolved.type === 'cut' || !previous) {
    applyBackground(enteringMount);
    next.root.style.opacity = '1';
    if (previous) previous.destroy();
    return;
  }

  if (resolved.type === 'morph') {
    morphBackground(previousMount, enteringMount, resolved);
    crossfade(previous, next, resolved); // morph ne change QUE le fond — contenu en crossfade standard
    return;
  }

  applyBackground(enteringMount);
  if (resolved.type === 'slide') return slide(previous, next, resolved);
  if (resolved.type === 'wipe') return wipe(previous, next, resolved);
  crossfade(previous, next, resolved); // 'crossfade'
}

// ─── Binding déclaratif (S8) ────────────────────────────────────────────────────

/** Dernière valeur `trigger.when` observée par instance — détecte les changements sans re-déclencher. */
const lastTriggerValues = new WeakMap();

/**
 * Ré-évalue les options liées (`$bind`) et les déclencheurs (`trigger`) de la scène montée,
 * appelé à chaque changement d'état. Voir docs/specs/scene-definition-v2.md.
 * @param {import('./types.js').StreamState} state
 * @returns {void}
 */
function applyBindings(state) {
  if (!current) return;
  for (const { instance, mount } of current.boundMounts) {
    if (mount.options && hasBoundOptions(mount.options)) {
      instance.update?.(resolveBoundOptions(mount.options, state));
    }
    if (mount.trigger) {
      const value = resolveBoundValue({ $bind: mount.trigger.when }, state);
      if (value !== lastTriggerValues.get(instance)) {
        lastTriggerValues.set(instance, value);
        /** @type {*} */ (instance)[mount.trigger.method]?.(value);
      }
    }
  }
}

// ─── Réactions du fond aux alertes (Couche 4 DotGrid) ───────────────────────────

/** Dernier `timestamp` de `state.latestAlert` transmis au fond — dédoublonne comme chaque `*.wire.js`
 * le fait déjà pour `AlertBanner.show()` (même pattern, une seule source ici plutôt que dupliquée
 * dans 9 fichiers). Voir docs/specs/dotgrid-event-triggers.md. */
let lastBackgroundAlertTimestamp = 0;

/**
 * Relaie `state.latestAlert` au composant de fond actif, s'il expose `trigger` (optionnel, comme
 * `morphTo` — AD-B3). No-op silencieux si le fond n'a pas de `trigger` (ex: `RainBackground`) ou
 * si aucune alerte nouvelle n'est arrivée.
 * @param {import('./types.js').StreamState} state
 * @returns {void}
 */
function applyBackgroundReactions(state) {
  if (!state.latestAlert || state.latestAlert.timestamp === lastBackgroundAlertTimestamp) return;
  lastBackgroundAlertTimestamp = state.latestAlert.timestamp;
  currentBackground?.trigger?.(state.latestAlert);
}

// ─── Montage initial ──────────────────────────────────────────────────────────

/**
 * Initialise le runtime au chargement de la page. Les listeners (scène/visibilité/binding) sont
 * enregistrés AVANT tout `await` réseau (S8 session 4/6, review) : le relais WS démarre sa propre
 * connexion indépendamment (`store.js`), un message peut donc arriver pendant `loadDynamicScenes()`
 * — s'il arrive avant que les listeners existent, il serait perdu silencieusement. Le montage
 * initial est protégé par `if (!current)` : si un `overlay:scene-change` a déjà monté une scène
 * pendant l'attente, on ne remonte pas par-dessus.
 * @returns {Promise<void>}
 */
async function init() {
  bgLayer = /** @type {HTMLElement} */ (document.getElementById('bg-layer'));
  sceneRoot = /** @type {HTMLElement} */ (document.getElementById('scene-root'));

  currentLevel = store.visibilityLevel;

  document.addEventListener('overlay:scene-change', (e) => handleSceneChange(/** @type {CustomEvent} */ (e).detail));
  document.addEventListener('overlay:visibility-change', (e) => applyVisibility(/** @type {CustomEvent} */ (e).detail.level));
  // overlay:morph NON câblé (AD-7 / AC-36)
  onStateChange(applyBindings); // binding déclaratif (S8) — indépendant des *.wire.js
  onStateChange(applyBackgroundReactions); // Couche 4 DotGrid — alertes → fond actif

  await loadDynamicScenes();

  if (current) return; // déjà monté par un overlay:scene-change reçu pendant l'attente ci-dessus

  let mounted = mountScene(store.currentScene);
  if (!mounted && store.currentScene !== 'brb') {
    console.warn(`[overlay] init : scène initiale indisponible (${store.currentScene}) — repli sur 'brb'`);
    mounted = mountScene('brb');
  }
  if (!mounted) console.warn("[overlay] init : aucune scène montable ('brb' absent)");
  current = mounted;

  const config = current ? SCENE_CONFIGS[current.id] : null;
  applyBackground(config?.background ?? null);

  if (current) {
    applyLayerVisibility(current, currentLevel);
    current.root.style.opacity = '1';
  }
  applyGlobalVisibility(currentLevel);
}

await init();
