// @ts-check
/**
 * Les incidents de la chaîne d'antenne : quand le serveur d'état cesse de répondre, le Studio le dit (ligne d'état, titre de l'onglet,
 * notification du système si elle est demandée et que la page est cachée) puis dit le rétablissement. Le bandeau lit toutes les 5 secondes et
 * confirme un changement sur deux relevés : l'essai attend donc de vrais relevés.
 */
import { openStudio, settingsSaved } from '../studio.js';

export const name = 'incidents d’antenne';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });

  // Un navigateur qui accorde les notifications, et un onglet qui n'est pas visible : on note ce que le système afficherait.
  await page.evaluate(`(() => {
    window.__notifications = [];
    class FakeNotification {
      static permission = 'default';
      static async requestPermission() { FakeNotification.permission = 'granted'; return 'granted'; }
      constructor(title, options) { window.__notifications.push({ title, ...options }); }
    }
    Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true });
    Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
  })()`);
  // Le bandeau doit d'abord avoir lu un état sain : seuls les changements sont des incidents.
  await page.waitFor("document.getElementById('antenna-items').textContent.includes('Serveur d’état · connecté')", 15_000);

  check('les alertes système sont éteintes au départ', (await page.evaluate("document.getElementById('antenna-alerts').getAttribute('aria-pressed')")) === 'false');
  await page.click('#antenna-alerts');
  await page.waitFor("document.getElementById('antenna-alerts').getAttribute('aria-pressed') === 'true'", 5000);
  check('les activer demande l’autorisation du navigateur, puis les allume', (await page.evaluate('window.Notification.permission')) === 'granted');
  await settingsSaved(page);
  check('le choix est gardé dans les réglages du serveur', (await stack.api('/studio-settings')).preferences?.['alerts.system'] === 'on');

  // Le serveur d'état cesse de répondre (du point de vue du Studio).
  await page.evaluate(`(() => {
    window.__realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = String(input?.url ?? input);
      return window.__blocked && url.includes('/obs-status') ? Promise.reject(new TypeError('Failed to fetch')) : window.__realFetch(input, init);
    };
    window.__blocked = true;
  })()`);
  const lost = await page.waitFor("document.getElementById('server-status').textContent.includes('ne répond plus')", 30_000);
  check('la perte est dite dans la ligne d’état', lost === true);
  check('le titre de l’onglet porte « ⚠ »', (await page.evaluate('document.title')).startsWith('⚠'));
  const notified = await page.evaluate('window.__notifications');
  check('une notification du système part, une seule, avec son tag', notified.length === 1 && notified[0].tag === 'overlay-server' && notified[0].title.includes('incident'));
  check('le bandeau, lui, dit « À corriger »', (await page.evaluate("document.getElementById('antenna-summary').textContent")) === 'À corriger');

  // Le serveur revient.
  await page.evaluate('window.__blocked = false');
  // La ligne d'état est aussitôt reprise par le « connecté » ordinaire du serveur : le rétablissement se constate à la notification et au titre.
  const recovered = await page.waitFor('window.__notifications.length === 2', 30_000);
  check('le rétablissement est dit', recovered === true);
  check('le titre retrouve son état normal', !(await page.evaluate('document.title')).startsWith('⚠'));
  const after = await page.evaluate('window.__notifications');
  check('et la notification de rétablissement remplace la précédente (même tag)', after.length === 2 && after[1].tag === 'overlay-server' && after[1].title.includes('rétabli'));

  // Éteintes, les alertes système se taisent ; la ligne d'état et le titre restent.
  await page.click('#antenna-alerts');
  check('éteindre les alertes système les éteint', (await page.evaluate("document.getElementById('antenna-alerts').getAttribute('aria-pressed')")) === 'false');

  check('aucune erreur inattendue dans la console', errors.filter((/** @type {string} */ message) => !message.includes('Failed to fetch') && !message.includes('obs-status')).length === 0 ? true : errors.slice());
}
