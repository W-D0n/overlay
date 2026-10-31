// @ts-check
/**
 * dev/incident-notifier.js — Dire un incident (`incident-watch.js`) là où l'utilisateur le verra, même si le Studio n'est pas devant lui.
 *
 * Trois voies, de la plus discrète à la plus voyante :
 *   - la ligne d'état du Studio (`report`) : « perdu » en erreur, « rétabli » en succès ;
 *   - le **titre de l'onglet**, préfixé « ⚠ » tant qu'un incident dure : visible depuis la barre des tâches ;
 *   - une **notification du système**, si l'utilisateur l'a demandée et que le navigateur l'a accordée, et **seulement quand le Studio n'est pas
 *     visible** (devant lui, le bandeau suffit ; une notification de plus serait du bruit).
 * Activer les notifications demande l'autorisation du navigateur ; un refus laisse l'option éteinte et le dit.
 *
 * @param {{
 *   report: { ok: (message?: string) => void, error: (message: string) => void },
 *   isEnabled: () => boolean,
 *   setEnabled: (enabled: boolean) => void,
 *   documentRef?: Document,
 *   NotificationImpl?: { permission: string, requestPermission: () => Promise<string>, new (title: string, options?: { body?: string, tag?: string }): unknown } | null,
 * }} input
 */
export function createIncidentNotifier(input) {
  const documentRef = input.documentRef ?? document;
  /** Résolue à chaque usage : l'état de l'autorisation et la classe elle-même sont ceux du moment. */
  const notification = () => (input.NotificationImpl === undefined ? /** @type {*} */ (globalThis).Notification ?? null : input.NotificationImpl);
  const baseTitle = documentRef.title;
  /** @type {Set<string>} */
  const down = new Set();

  return {
    /** @param {readonly import('./incident-watch.js').Incident[]} incidents */
    deliver(incidents) {
      for (const incident of incidents) {
        if (incident.kind === 'lost') {
          down.add(incident.id);
          input.report.error(incident.message);
        } else {
          down.delete(incident.id);
          input.report.ok(incident.message);
        }
        const NotificationImpl = notification();
        if (input.isEnabled() && documentRef.hidden && NotificationImpl !== null && NotificationImpl.permission === 'granted') {
          // Une notification par point : la nouvelle remplace l'ancienne au lieu de s'empiler (`tag`).
          new NotificationImpl(incident.kind === 'lost' ? 'Overlay Studio — incident' : 'Overlay Studio — rétabli', { body: incident.message, tag: `overlay-${incident.id}` });
        }
      }
      if (incidents.length > 0) documentRef.title = down.size > 0 ? `⚠ ${baseTitle}` : baseTitle;
    },

    /** Vrai tant qu'au moins un incident dure. */
    hasIncident: () => down.size > 0,

    /**
     * Allume ou éteint les notifications du système. Allumer demande l'autorisation au navigateur.
     * @returns {Promise<boolean>} l'état final
     */
    async toggle() {
      if (input.isEnabled()) {
        input.setEnabled(false);
        return false;
      }
      const NotificationImpl = notification();
      if (NotificationImpl === null) {
        input.report.error('ce navigateur ne sait pas afficher de notifications');
        return false;
      }
      const permission = NotificationImpl.permission === 'default' ? await NotificationImpl.requestPermission() : NotificationImpl.permission;
      if (permission !== 'granted') {
        input.report.error('notifications refusées par le navigateur : autorisez-les pour ce site dans ses réglages');
        return false;
      }
      input.setEnabled(true);
      return true;
    },
  };
}
