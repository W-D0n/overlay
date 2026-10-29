// @ts-check
/**
 * dev/server-control.js — Textes et décisions du menu « Serveurs » du Studio (docs/specs/controle-processus.md).
 *
 * Pur : ce que dit la confirmation selon qu'une source OBS affiche le fond, et comment lire la réponse
 * du serveur. Le Studio ne peut pas redémarrer ce qu'il arrête : le message le dit.
 */

/**
 * @param {'restart' | 'stop'} action
 * @param {number | null} renderPages pages de rendu connectées (`null` : inconnu)
 * @returns {{ title: string, warning: string | null, confirmLabel: string }}
 */
export function controlPrompt(action, renderPages) {
  const live = renderPages !== null && renderPages > 0;
  if (action === 'restart') {
    return {
      title: 'Redémarrer les serveurs ?',
      warning: live
        ? 'Une source OBS affiche le fond : elle restera noire quelques secondes, puis se reconnectera seule.'
        : null,
      confirmLabel: 'Redémarrer',
    };
  }
  return {
    title: 'Arrêter les serveurs ?',
    warning: live
      ? 'Une source OBS affiche le fond : elle restera noire tant que les serveurs sont arrêtés. Le Studio ne peut pas les relancer : utilise start-stream.bat.'
      : 'Le Studio ne peut pas relancer les serveurs : utilise start-stream.bat.',
    confirmLabel: 'Arrêter',
  };
}

/**
 * Message à afficher quand le serveur refuse ou ne répond pas à la demande.
 * @param {number | null} status code HTTP, `null` si le serveur est injoignable
 * @returns {string}
 */
export function controlFailure(status) {
  if (status === 501) return 'Ce serveur n’a pas été lancé par start-stream : il ne peut pas être piloté d’ici.';
  if (status === 403) return 'Demande refusée : origine non autorisée.';
  if (status === 404) return 'Ce serveur est antérieur à cette fonction : relance-le une fois avec start-stream.bat.';
  return 'Le serveur n’a pas accepté la demande.';
}
