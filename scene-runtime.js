// @ts-check
import { COMPONENT_REGISTRY } from './component-registry.js';

/**
 * scene-runtime.js — Monte une scène (une pile de couches, `scene-doc.js`) dans un conteneur.
 *
 * Réconcilie la scène reçue avec ce qui est déjà monté, couche par couche et par identifiant :
 *   - même `id`, même `kind` → `update(options)`, jamais de recréation (l'effet garde son état) ;
 *   - même `id`, `kind` différent → l'effet est remplacé sur place, les autres couches ne bougent pas ;
 *   - `id` nouveau → montage ; `id` disparu → démontage ;
 *   - ordre → `z-index`, sans déplacer aucun nœud (déplacer un nœud redémarrerait ses animations CSS) ;
 *   - `visible`, `opacity`, `placement` → appliqués sur le calque de la couche, sans toucher à l'effet.
 *
 * Chaque couche vit dans son propre calque absolu ; `placement` est en fractions du conteneur, donc la scène
 * épouse la source OBS quelle que soit sa résolution. Un effet dessine sa composition de référence dans son
 * calque : un calque plus petit que le conteneur en montre une version réduite.
 *
 * Une couche qui échoue (type inconnu, fabrique ou `update` qui lève) est signalée par `onLayerError` et
 * n'arrête ni les autres couches ni la scène ; son montage est retenté à la scène suivante.
 *
 * Les transitions de scène et le routage audio / réactions ne sont pas ici (étapes 4d et 4e).
 *
 * @typedef {import('./scene-doc.js').SceneDoc} SceneDoc
 * @typedef {import('./scene-doc.js').Layer} Layer
 * @typedef {{ id: string, kind: string, instance: import('./types.js').ComponentInstance, visible: boolean }} MountedLayerInfo
 */

/**
 * @param {HTMLElement} container
 * @param {{
 *   registry?: Record<string, (options: any) => import('./types.js').ComponentInstance>,
 *   createCalque?: () => *,
 *   onLayerError?: (failure: { layerId: string, error: unknown }) => void,
 * }} [deps] points d'injection pour les tests (aucun DOM requis).
 */
export function createSceneRuntime(container, deps = {}) {
  const registry = deps.registry ?? COMPONENT_REGISTRY;
  const createCalque = deps.createCalque ?? defaultCreateCalque;
  const onLayerError = deps.onLayerError ?? ((failure) => console.error(`[scene-runtime] couche « ${failure.layerId} » : `, failure.error));

  /** @type {Map<string, { id: string, kind: string, instance: import('./types.js').ComponentInstance, calque: *, visible: boolean }>} */
  let mounted = new Map();

  /** @param {{ instance: import('./types.js').ComponentInstance, calque: * }} entry */
  function dispose(entry) {
    try {
      entry.instance.destroy?.();
    } catch (error) {
      onLayerError({ layerId: '(démontage)', error });
    }
    entry.calque.remove();
  }

  /** @param {Layer} layer */
  function mountLayer(layer) {
    const factory = Object.hasOwn(registry, layer.kind) ? registry[layer.kind] : undefined;
    if (factory === undefined) throw new Error(`type de couche inconnu : ${layer.kind}`);
    const instance = factory(layer.options);
    const calque = createCalque();
    calque.appendChild(instance.el);
    container.appendChild(calque);
    return { id: layer.id, kind: layer.kind, instance, calque, visible: layer.visible };
  }

  /** @param {*} calque @param {Layer} layer @param {number} index */
  function styleCalque(calque, layer, index) {
    const { x, y, width, height } = layer.placement;
    Object.assign(calque.style, {
      left: percent(x),
      top: percent(y),
      width: percent(width),
      height: percent(height),
      opacity: String(layer.opacity),
      display: layer.visible ? '' : 'none',
      zIndex: String(index),
    });
  }

  return {
    /** @param {SceneDoc} scene */
    apply(scene) {
      const wanted = new Set(scene.layers.map(({ id }) => id));
      for (const [id, entry] of mounted) {
        if (!wanted.has(id)) {
          dispose(entry);
          mounted.delete(id);
        }
      }

      /** @type {typeof mounted} */
      const next = new Map();
      scene.layers.forEach((layer, index) => {
        let entry = mounted.get(layer.id);
        if (entry !== undefined && entry.kind !== layer.kind) {
          dispose(entry);
          entry = undefined;
        }
        try {
          if (entry === undefined) entry = mountLayer(layer);
          else entry.instance.update?.(layer.options);
        } catch (error) {
          onLayerError({ layerId: layer.id, error });
          if (entry === undefined) return;
        }
        entry.visible = layer.visible;
        styleCalque(entry.calque, layer, index);
        next.set(layer.id, entry);
      });
      mounted = next;
    },

    /** Couches montées, dans l'ordre de la scène. @returns {MountedLayerInfo[]} */
    layers() {
      return [...mounted.values()].map(({ id, kind, instance, visible }) => ({ id, kind, instance, visible }));
    },

    destroy() {
      for (const entry of mounted.values()) dispose(entry);
      mounted = new Map();
    },
  };
}

/** @param {number} fraction @returns {string} */
function percent(fraction) {
  return `${Number((fraction * 100).toFixed(4))}%`;
}

/** Calque réel d'une couche. Isolé ici pour que les tests n'aient pas besoin d'un DOM. */
function defaultCreateCalque() {
  const calque = document.createElement('div');
  calque.style.cssText = 'position:absolute;overflow:hidden;pointer-events:none;';
  return calque;
}
