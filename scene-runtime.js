// @ts-check
/**
 * scene-runtime.js — Orchestrateur DOM de l'overlay (S3).
 *
 * Page unique : monte les scènes par couches (`data-layer`), applique le niveau de
 * visibilité, exécute les transitions (`cut` / `crossfade`). Le DotGrid est une couche
 * de fond permanente (`#bg-layer`) : une seule instance qui survit aux changements.
 *
 * Consomme `overlay:scene-change` et `overlay:visibility-change` (produits par store.js).
 * Ne câble PAS `overlay:morph` (séquencé couche 3 — AD-7 / AC-36).
 *
 * Voir docs/specs/scene-runtime-engine.md §Comportements.
 */

import { store, onStateChange } from './store.js';
import { validateSceneConfig } from './protocol.js';
import { resolveTransition, isLayerVisible, resolveDotgridMode, toCssEasing } from './scene-resolve.js';
import { resolvePlacementStyle } from './placement-resolve.js';
import { resolveBoundValue, resolveBoundOptions, hasBoundOptions } from './scene-definition-resolve.js';
import { COMPONENT_REGISTRY } from './component-registry.js';
import { SCENE_CONFIGS, SCENE_WIRES, loadDynamicScenes } from './scenes/registry.js';

// ─── État du runtime ──────────────────────────────────────────────────────────

/** @type {import('./types.js').ComponentInstance} */ let grid;
/** @type {HTMLElement} */ let bgLayer;
/** @type {HTMLElement} */ let sceneRoot;
/** @type {import('./types.js').MountedScene | null} */ let current = null;
/** @type {import('./types.js').VisibilityLevel} */ let currentLevel = 'full';
/** @type {import('./types.js').DotGridMode} */ let currentDotgridMode = null;
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
      if (hasBoundOptions(mount.options ?? {}) || mount.trigger) {
        boundMounts.push({ instance, mount });
      }
    }
    componentsByLayer[layer.name] = instances;
  }

  sceneRoot.appendChild(container);

  /** @type {import('./types.js').MountedScene} */
  const mounted = { id: /** @type {*} */ (id), root: container, componentsByLayer, boundMounts, destroy: () => {} };
  // Le wire est optionnel (S8) : une scène entièrement déclarative (binding via $bind/trigger)
  // n'a pas besoin de *.wire.js écrit à la main.
  const cleanupWire = SCENE_WIRES[id]?.(mounted) ?? (() => {});
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
 * Applique l'état global lié au niveau : fond DotGrid + transparence du body.
 * `#bg-layer` visible ⟺ niveau ≠ hidden ET mode DotGrid courant ≠ null (AD-7).
 * @param {import('./types.js').VisibilityLevel} level
 * @returns {void}
 */
function applyGlobalVisibility(level) {
  bgLayer.style.display = level !== 'hidden' && currentDotgridMode !== null ? '' : 'none';
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

// ─── Mode DotGrid ───────────────────────────────────────────────────────────────

/**
 * Résout le mode DotGrid d'une scène, l'applique (jamais `setMode(null)` — AC-22),
 * et reporte l'état global de visibilité du fond.
 * @param {import('./types.js').DotGridMode} mode
 * @returns {void}
 */
function applyDotgridMode(mode) {
  currentDotgridMode = mode;
  if (mode !== null) /** @type {*} */ (grid).setMode(mode);
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
  applyDotgridMode(resolveDotgridMode(entering.dotgridMode));

  const previous = current;
  current = next;

  if (resolved.type === 'cut' || !previous) {
    next.root.style.opacity = '1';
    if (previous) previous.destroy();
    return;
  }
  crossfade(previous, next, resolved);
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

  // DotGrid rejoint le modèle de composant standard (S8) — monté via le registry, toujours une
  // seule instance permanente dans #bg-layer (pas de système multi-animations).
  grid = COMPONENT_REGISTRY.DotGridBackground({});
  bgLayer.appendChild(grid.el);

  currentLevel = store.visibilityLevel;

  document.addEventListener('overlay:scene-change', (e) => handleSceneChange(/** @type {CustomEvent} */ (e).detail));
  document.addEventListener('overlay:visibility-change', (e) => applyVisibility(/** @type {CustomEvent} */ (e).detail.level));
  // overlay:morph NON câblé (AD-7 / AC-36)
  onStateChange(applyBindings); // binding déclaratif (S8) — indépendant des *.wire.js

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
  applyDotgridMode(config ? resolveDotgridMode(config.dotgridMode) : null);

  if (current) {
    applyLayerVisibility(current, currentLevel);
    current.root.style.opacity = '1';
  }
  applyGlobalVisibility(currentLevel);
}

await init();
