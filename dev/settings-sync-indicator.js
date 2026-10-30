// @ts-check
/**
 * dev/settings-sync-indicator.js — Montre dans l'en-tête où en est l'enregistrement des réglages du Studio :
 * enregistrés sur le serveur, en cours d'envoi, ou hors ligne (modifications gardées dans le navigateur, retentées).
 *
 * @typedef {{ status(): 'synced' | 'saving' | 'offline', hasPending(): boolean, subscribe(listener: () => void): () => void }} SyncSource
 */

/** Le texte et l'état affichés pour ce que la synchronisation rapporte. @param {SyncSource} source */
export function describeSync(source) {
  const status = source.status();
  if (status === 'offline') return { state: 'offline', text: 'Réglages non enregistrés — nouvel essai en cours', title: 'Le serveur ne répond pas : vos réglages sont gardés dans ce navigateur et seront envoyés dès que possible.' };
  if (status === 'saving' || source.hasPending()) return { state: 'saving', text: 'Enregistrement des réglages…', title: 'Vos réglages sont en cours d’envoi au serveur.' };
  return { state: 'synced', text: 'Réglages enregistrés', title: 'Vos réglages sont sur le serveur : ils suivent dans tous vos navigateurs.' };
}

/**
 * @param {{ element: HTMLElement, source: SyncSource }} input
 */
export function createSettingsSyncIndicator({ element, source }) {
  function render() {
    const { state, text, title } = describeSync(source);
    element.dataset.state = state;
    element.textContent = text;
    element.title = title;
  }
  const unsubscribe = source.subscribe(render);
  render();
  return { render, destroy: unsubscribe };
}
