// @ts-check
/**
 * dev/server-control.js — Messages des boutons « Redémarrer » et « Arrêter » du Studio (docs/specs/controle-processus.md).
 *
 * Pur : comment lire un refus ou un silence du serveur. Le message dit la cause réelle (code HTTP, texte du serveur ou
 * de la connexion) : un refus ne doit jamais se réduire à une phrase qui ne permet pas de savoir quoi corriger.
 */

/**
 * @param {number | null} status code HTTP, `null` si le serveur n'a pas répondu
 * @param {string} [detail] texte de l'erreur (réponse du serveur ou de la connexion)
 * @returns {string}
 */
export function controlFailure(status, detail = '') {
  if (status === 501) return 'Ce serveur n’a pas été lancé par start-stream : il ne peut pas être piloté d’ici.';
  if (status === 403) return 'Demande refusée : origine non autorisée.';
  if (status === 404) return 'Ce serveur est antérieur à cette fonction : relance-le une fois avec start-stream.bat.';
  const reason = detail === '' ? '' : ` : ${detail}`;
  if (status === null) return `Le serveur n’a pas répondu${reason}.`;
  return `Le serveur a refusé la demande (HTTP ${status})${reason}.`;
}
