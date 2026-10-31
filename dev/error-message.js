// @ts-check
/**
 * dev/error-message.js — Le texte d'une erreur attrapée. Un `catch` reçoit `unknown` : tout peut être levé (une chaîne, un objet
 * sans `message`), et `error.message` donnerait alors « undefined » dans le message montré à l'utilisateur.
 */

/** @param {unknown} error @returns {string} */
export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
