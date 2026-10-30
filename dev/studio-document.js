// @ts-check
/**
 * dev/studio-document.js — Le document du Studio : ce qu'on édite, ce qui est en antenne, et l'écart entre les deux.
 *
 * Trois choses, un seul objet :
 *  - la **scène brouillon** (`editor`, `scene-editor.js`) : sélection, commandes, annulation ;
 *  - la **scène en antenne** telle que le serveur l'a diffusée en dernier ;
 *  - le **preset ouvert** (ou aucun : réglage libre).
 *
 * Le *brouillon* n'est pas un drapeau posé par chaque réglage, c'est un calcul : les couches de la scène brouillon diffèrent
 * de celles de l'antenne. Revenir à l'état de l'antenne par annulation efface donc le brouillon, et un préset essayé qui
 * donne les mêmes couches que l'antenne n'en ouvre pas. La transition d'arrivée n'entre pas dans cette comparaison : elle
 * se règle sur le preset et ne voyage avec une publication que si la scène vient d'être *ouverte* depuis un preset.
 *
 * Une antenne qui change pendant qu'on édite n'écrase jamais le brouillon ; hors brouillon, le document la suit.
 *
 * Aucun DOM, aucun réseau : testable seul.
 *
 * @typedef {import('../scene-doc.js').SceneDoc} SceneDoc
 * @typedef {{ scene: SceneDoc, onAir: SceneDoc, activePresetId: string | null, isDraft: boolean, hasArrival: boolean }} DocumentState
 */
import { liveFromScene } from '../scene-doc.js';
import { createSceneEditor } from './scene-editor.js';

/** @param {SceneDoc} scene @returns {string} les seules couches, dans l'ordre : ce qui se voit à l'antenne */
const contentKey = (scene) => JSON.stringify(scene.layers, (_key, value) => (value === undefined ? null : value));

/**
 * @param {{ scene: SceneDoc, now?: () => number, historyLimit?: number, coalesceMs?: number }} options scène en antenne au départ
 */
export function createStudioDocument({ scene: onAirAtStart, ...editorOptions }) {
  const editor = createSceneEditor({ scene: liveFromScene(onAirAtStart), ...editorOptions });
  let onAir = liveFromScene(onAirAtStart);
  /** @type {string | null} */
  let activePresetId = null;
  /** Vrai depuis l'ouverture d'un preset jusqu'à la prochaine synchronisation avec l'antenne. */
  let arrival = false;
  /** @type {Set<(state: DocumentState) => void>} */
  const listeners = new Set();
  /** @type {DocumentState | null} */
  let cached = null;

  function state() {
    if (cached === null || cached.scene !== editor.state().scene) {
      const { scene } = editor.state();
      cached = { scene, onAir, activePresetId, isDraft: contentKey(scene) !== contentKey(onAir), hasArrival: arrival };
    }
    return cached;
  }

  function notify() {
    cached = null;
    const snapshot = state();
    for (const listener of [...listeners]) listener(snapshot);
  }

  // Les commandes de l'éditeur (réglages, annulation…) changent le brouillon : le document se recalcule et prévient.
  editor.subscribe(() => notify());

  /** L'éditeur repart de `scene` : nouveau document, historique vidé. @param {SceneDoc} scene */
  function reload(scene) {
    editor.load(scene);
  }

  return {
    editor,
    state,

    /** @param {(state: DocumentState) => void} listener @returns {() => void} */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /**
     * Ouvre une scène dans l'éditeur. `asDraft` : un preset essayé — l'aperçu change, l'antenne attend « Publier », et
     * sa transition d'arrivée accompagnera la publication.
     * @param {SceneDoc} scene
     * @param {string | null} [presetId]
     * @param {boolean} [asDraft]
     */
    open(scene, presetId = null, asDraft = false) {
      activePresetId = presetId;
      arrival = asDraft;
      reload(scene);
      notify();
    },

    /** @param {string | null} presetId */
    setActivePresetId(presetId) {
      if (presetId === activePresetId) return;
      activePresetId = presetId;
      notify();
    },

    /**
     * La scène que le serveur vient de diffuser à l'antenne (ou que la lecture initiale a rendue).
     * @param {SceneDoc} incoming
     * @returns {boolean} vrai si le document l'a adoptée (il n'y avait pas de brouillon à protéger)
     */
    receive(incoming) {
      const live = liveFromScene(incoming);
      const wasDraft = state().isDraft;
      onAir = live;
      if (wasDraft) {
        notify();
        return false;
      }
      if (contentKey(editor.state().scene) !== contentKey(live)) {
        arrival = false;
        reload(live);
      } else {
        notify();
      }
      return true;
    },

    /**
     * La scène à envoyer à l'antenne : sous l'identité de l'antenne, avec la transition d'arrivée seulement si la scène
     * vient d'un preset ouvert (sinon un simple réglage ne ré-animerait pas, il remplacerait sèchement).
     * @returns {SceneDoc}
     */
    publishable() {
      const live = liveFromScene(editor.state().scene);
      if (arrival || live.transition === undefined) return live;
      const { transition: _transition, ...withoutTransition } = live;
      return withoutTransition;
    },

    /** La publication de `published` a réussi : le brouillon et l'antenne montrent la même chose. @param {SceneDoc} published */
    markPublished(published) {
      onAir = liveFromScene(published);
      arrival = false;
      editor.markSaved();
      notify();
    },

    /** Abandonne le brouillon : la scène brouillon redevient celle de l'antenne. */
    discard() {
      arrival = false;
      reload(onAir);
      notify();
    },
  };
}
