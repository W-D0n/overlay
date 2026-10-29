// @ts-check
/**
 * dev/background-draft.js — Brouillon du tuner : ce que l'aperçu montre et que l'antenne n'a pas encore.
 *
 * L'aperçu du tuner n'est plus l'antenne : un réglage, un effet choisi ou un preset essayé ouvre un
 * brouillon, que « Publier » envoie à l'URL OBS et que « Annuler » remplace par l'état en antenne.
 * Un état reçu de l'antenne pendant un brouillon ne l'écrase jamais.
 */
export function createDraftTracker() {
  let draft = false;
  let arrival = false;
  /** @type {*} */
  let onAir = null;

  return {
    isDraft: () => draft,
    /** Vrai tant que le brouillon vient de l'arrivée d'un preset : sa transition voyagera avec la publication. */
    hasArrival: () => arrival,
    /** Dernier état connu en antenne, ou `null` avant la première lecture. */
    published: () => onAir,
    edited() {
      draft = true;
    },
    arrived() {
      draft = true;
      arrival = true;
    },
    /** L'aperçu et l'antenne montrent le même état (lecture initiale, publication réussie, annulation). */
    synced(current) {
      onAir = current;
      draft = false;
      arrival = false;
    },
    /**
     * @param {*} next État reçu de l'antenne
     * @returns {boolean} Vrai si l'aperçu doit l'adopter
     */
    shouldApplyIncoming(next) {
      if (!draft) return true;
      onAir = next;
      return false;
    },
  };
}
