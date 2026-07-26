// @ts-check
/**
 * dev/thumbnail-queue.js — File d'attente des captures de vignettes.
 *
 * Une vignette exige de faire tourner l'effet le temps de le photographier. Les monter tous en même
 * temps ferait tourner quinze animations d'un coup dans le Studio, pendant que l'aperçu plein écran
 * tourne déjà. La file en exécute une seule à la fois.
 * Voir docs/specs/background-preset-thumbnails.md.
 */

/**
 * @returns {{ push(task: () => Promise<void>): void, size(): number, idle(): boolean }}
 */
export function createThumbnailQueue() {
  /** @type {(() => Promise<void>)[]} */
  const pending = [];
  let running = false;

  async function drain() {
    if (running) return;
    running = true;
    while (pending.length > 0) {
      const task = /** @type {() => Promise<void>} */ (pending.shift());
      try {
        await task();
      } catch (error) {
        // Une vignette ratée n'empêche pas les suivantes : la liste reste utilisable sans image.
        console.warn('[thumbnail] capture abandonnée :', error);
      }
    }
    running = false;
  }

  return {
    push(task) {
      pending.push(task);
      drain();
    },
    size() {
      return pending.length;
    },
    idle() {
      return !running && pending.length === 0;
    },
  };
}
