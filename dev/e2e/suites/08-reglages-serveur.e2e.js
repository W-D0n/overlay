// @ts-check
/**
 * Les réglages du Studio sur le serveur : l'indicateur d'enregistrement (enregistré / en cours / hors ligne), la reprise
 * des anciens réglages du navigateur, la reprise après une coupure, et le suivi d'une fenêtre à l'autre.
 */
import { openStudio } from '../studio.js';

export const name = 'réglages sur le serveur';

const SYNC = "document.getElementById('settings-sync')";

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  await openStudio({ page, stack });
  await stack.api('/studio-settings', { customCommands: [], preferences: { 'view.grid': null, 'view.rulers': null, 'view.snap': null, 'view.safe': null, 'placement.unit': null } });
  await page.evaluate('localStorage.clear()');
  await page.goto(`http://localhost:${stack.staticPort}/dev/studio.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.sleep(500);

  const indicator = () => page.evaluate(`({ state: ${SYNC}.dataset.state, text: ${SYNC}.textContent })`);
  const aria = (/** @type {string} */ id) => page.evaluate(`document.getElementById('${id}').getAttribute('aria-pressed')`);

  const idle = await indicator();
  check('au repos, l’indicateur dit que les réglages sont enregistrés', idle.state === 'synced' && idle.text === 'Réglages enregistrés');

  // Un changement passe par « en cours » puis revient à « enregistré », et le serveur le détient.
  await page.click('#view-grid');
  const pending = await indicator();
  check('juste après un changement, l’indicateur dit « en cours » (jamais « enregistré » avant l’envoi)', pending.state === 'saving');
  await page.waitFor(`${SYNC}.dataset.state === 'synced'`, 5000);
  check('puis revient à « enregistré »', (await indicator()).state === 'synced');
  check('et le serveur détient la grille', (await stack.api('/studio-settings')).preferences['view.grid'] === true);

  // Coupure : le serveur ne répond plus aux enregistrements ; rien n'est perdu, l'indicateur le dit.
  await page.evaluate(`(() => { window.__realFetch = window.fetch; window.fetch = (url, init) => String(url).includes('studio-settings') && init?.method === 'POST' ? Promise.reject(new TypeError('coupure simulée')) : window.__realFetch(url, init); })()`);
  await page.click('#view-rulers');
  await page.waitFor(`${SYNC}.dataset.state === 'offline'`, 5000);
  const offline = await indicator();
  check('serveur injoignable : l’indicateur passe « hors ligne » et dit que les réglages ne sont pas enregistrés', offline.state === 'offline' && offline.text.includes('non enregistrés'));
  check('le serveur n’a pas reçu les règles', (await stack.api('/studio-settings')).preferences['view.rulers'] !== true);
  check('l’interface a bien appliqué le changement malgré la coupure', (await aria('view-rulers')) === 'true');

  // Retour du serveur : l’envoi retenu repart seul (nouvel essai) et rattrape tout.
  await page.evaluate('window.fetch = window.__realFetch');
  await page.waitFor(`${SYNC}.dataset.state === 'synced'`, 9000);
  check('le serveur revenu, le changement retenu est envoyé sans rien refaire', (await stack.api('/studio-settings')).preferences['view.rulers'] === true);

  // Un autre client modifie les réglages : cette fenêtre le suit sans rechargement.
  await stack.api('/studio-settings', { preferences: { 'view.safe': true } });
  check('un réglage changé par un autre client apparaît ici sans recharger', await page.waitFor("document.getElementById('view-safe').getAttribute('aria-pressed') === 'true'", 5000));

  // Reprise : un navigateur qui avait ses réglages d’avant, un serveur vide.
  await stack.api('/studio-settings', { customCommands: [], preferences: { 'view.grid': null, 'view.rulers': null, 'view.snap': null, 'view.safe': null } });
  await page.evaluate(`(() => {
    localStorage.clear();
    localStorage.setItem('overlay.studio.placement-unit', 'pixel');
    localStorage.setItem('overlay.studio.view-aids', JSON.stringify({ snap: false, grid: true, rulers: false, safe: false }));
    localStorage.setItem('overlay.studio.custom-commands', JSON.stringify([{ id: 'custom.reprise', name: 'Reprise', steps: ['edit.copy'] }]));
  })()`);
  await page.evaluate("window.addEventListener('pagehide', () => {}, { once: true })");
  await page.goto(`http://localhost:${stack.staticPort}/dev/studio.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.waitFor(`${SYNC}.dataset.state === 'synced'`, 5000);
  await page.sleep(600);
  const migrated = await stack.api('/studio-settings');
  check('la reprise a envoyé au serveur les anciens réglages du navigateur (commande, unité, aides de vue)',
    migrated.customCommands.some((/** @type {*} */ c) => c.id === 'custom.reprise') && migrated.preferences['placement.unit'] === 'pixel' && migrated.preferences['view.grid'] === true && migrated.preferences['view.snap'] === false);
  check('et l’interface les applique', (await aria('view-grid')) === 'true' && (await aria('view-snap')) === 'false');

  // Le serveur déjà rempli n’est jamais écrasé par un navigateur qui a d’autres valeurs.
  await page.evaluate("localStorage.setItem('overlay.studio.placement-unit', 'percent')");
  await page.goto(`http://localhost:${stack.staticPort}/dev/studio.html`);
  await page.waitFor("(document.getElementById('server-status')?.textContent ?? '').includes('connecté')", 15_000);
  await page.sleep(600);
  check('un serveur qui a déjà des réglages n’est pas écrasé par le navigateur', (await stack.api('/studio-settings')).preferences['placement.unit'] === 'pixel');

  await stack.api('/studio-settings', { customCommands: [], preferences: { 'view.grid': null, 'view.rulers': null, 'view.snap': null, 'view.safe': null, 'placement.unit': null } });
  await page.evaluate('localStorage.clear()');
  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}
