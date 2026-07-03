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

import { store } from './store.js';
import { validateSceneConfig } from './protocol.js';
import { resolveTransition, isLayerVisible, resolveDotgridMode, toCssEasing } from './scene-resolve.js';
import { resolvePlacementStyle } from './placement-resolve.js';
import { DotGridAnimated } from './components/DotGridAnimated.js';
import { COMPONENT_REGISTRY } from './component-registry.js';
import { SCENE_CONFIGS, SCENE_WIRES } from './scenes/registry.js';

// ─── État du runtime ──────────────────────────────────────────────────────────

/** @type {ReturnType<typeof DotGridAnimated>} */ let grid;
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
  else console.warn(`[overlay] mount : template absent — ${id}`);

  /** @type {Record<string, import('./types.js').ComponentInstance[]>} */
  const componentsByLayer = {};
  /** @type {import('./types.js').ComponentInstance[]} */
  const allInstances = [];

  for (const layer of config.layers) {
    const layerEl = container.querySelector(`[data-layer="${layer.name}"]`);
    if (!layerEl) {
      console.warn(`[overlay] mount : couche absente du template — ${layer.name}`);
      continue;
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
      const instance = factory(mount.options);
      layerEl.appendChild(instance.el);
      instances.push(instance);
      allInstances.push(instance);
    }
    componentsByLayer[layer.name] = instances;
  }

  sceneRoot.appendChild(container);

  /** @type {import('./types.js').MountedScene} */
  const mounted = { id: /** @type {*} */ (id), root: container, componentsByLayer, destroy: () => {} };
  const cleanup = SCENE_WIRES[id](mounted);
  mounted.destroy = () => {
    cleanup();
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
  if (mode !== null) grid.setMode(mode);
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

// ─── Montage initial ──────────────────────────────────────────────────────────

/**
 * Initialise le runtime au chargement de la page.
 * @returns {void}
 */
function init() {
  bgLayer = /** @type {HTMLElement} */ (document.getElementById('bg-layer'));
  sceneRoot = /** @type {HTMLElement} */ (document.getElementById('scene-root'));

  grid = DotGridAnimated();
  bgLayer.appendChild(grid.el);

  currentLevel = store.visibilityLevel;

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

  document.addEventListener('overlay:scene-change', (e) => handleSceneChange(/** @type {CustomEvent} */ (e).detail));
  document.addEventListener('overlay:visibility-change', (e) => applyVisibility(/** @type {CustomEvent} */ (e).detail.level));
  // overlay:morph NON câblé (AD-7 / AC-36)
}

init();
