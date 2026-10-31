// @ts-check
/**
 * La connexion à Twitch : l'identifiant client, le code d'appareil, l'autorisation, la session EventSub et ses alertes, puis les accidents de la
 * vie réelle (réseau coupé, reprise annoncée par Twitch, jeton expiré, autorisation retirée) et la déconnexion. Le serveur d'état parle à un faux
 * Twitch (`dev/e2e/fake-twitch.js`) qui applique les règles documentées (jeton de rafraîchissement à usage unique, portées par abonnement,
 * abonnements liés à la session). Les jetons ne reviennent jamais du serveur.
 */
import { readFileSync } from 'node:fs';
import { FAKE_CLIENT_ID } from '../fake-twitch.js';
import { openStudio } from '../studio.js';

export const name = 'connexion à Twitch';

/** @param {string} url */
function listen(url) {
  /** @type {any[]} */
  const messages = [];
  const ws = new WebSocket(url);
  ws.onmessage = (event) => { messages.push(JSON.parse(String(event.data))); };
  return { ws, messages };
}

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  const fake = stack.twitch;
  await openStudio({ page, stack });

  const text = (/** @type {string} */ id) => page.evaluate(`document.getElementById(${JSON.stringify(id)}).textContent`);
  const alertsText = () => page.evaluate("[...document.querySelectorAll('#settings-alerts li')].map((li) => li.textContent)");
  const waitText = (/** @type {string} */ id, /** @type {string} */ needle, ms = 12_000) => page.waitFor(`document.getElementById(${JSON.stringify(id)}).textContent.includes(${JSON.stringify(needle)})`, ms);
  const connections = async () => (await fetch(`http://localhost:${stack.statePort}/connections`)).text();
  const sessionIds = () => [...new Set(fake.log.subscriptions.map((/** @type {*} */ entry) => entry.sessionId))];
  const subscriptionsOf = (/** @type {string} */ sessionId) => fake.log.subscriptions.filter((/** @type {*} */ entry) => entry.sessionId === sessionId);

  const render = listen(`ws://127.0.0.1:${stack.statePort}/event-ws?role=render`);
  await new Promise((resolve) => setTimeout(resolve, 200));

  await page.click('#settings-open');
  await page.waitFor("document.getElementById('settings-dialog').open && document.getElementById('settings-twitch-status').textContent !== ''", 8000);

  // 1. Configuration : l'identifiant client.
  check('au départ, rien n’est configuré et la connexion est impossible', (await text('settings-twitch-status')).includes('identifiant client') && (await page.evaluate("document.getElementById('settings-twitch-login').disabled")) === true);
  await page.fill('#settings-twitch-client', 'pas valide!');
  await page.click('#settings-twitch-client-save');
  await page.waitFor("document.getElementById('settings-status').textContent.includes('invalide')", 5000);
  check('un identifiant invalide est refusé avec la raison', (await text('settings-status')).includes('invalide') && (await page.evaluate("document.getElementById('settings-twitch-login').disabled")) === true);
  await page.fill('#settings-twitch-client', FAKE_CLIENT_ID);
  await page.click('#settings-twitch-client-save');
  await page.waitFor("document.getElementById('settings-twitch-login').disabled === false", 5000);
  check('un identifiant valide est gardé et débloque « Connecter Twitch »', (await text('settings-twitch-status')).includes('Prêt'));

  // 2. Le code d'appareil.
  await page.click('#settings-twitch-login');
  await page.waitFor("!document.getElementById('settings-twitch-code').hidden", 6000);
  check('Twitch donne un code à taper, et le Studio le montre', (await text('settings-twitch-usercode')) === 'WDJB-MJHT');
  const link = await page.evaluate("(() => { const a = document.getElementById('settings-twitch-link'); return { href: a.getAttribute('href'), target: a.target, rel: a.rel }; })()");
  check('avec l’adresse d’autorisation, qui s’ouvre dans un autre onglet sans donner la main à la page', link.href?.endsWith('/activate') === true && link.target === '_blank' && link.rel.includes('noopener'));
  check('et l’état dit qu’on attend l’autorisation', (await text('settings-twitch-status')).includes('En attente de votre autorisation'));
  check('le faux Twitch a reçu l’identifiant client et les trois portées', fake.log.deviceRequests[0]?.client_id === FAKE_CLIENT_ID && fake.log.deviceRequests[0]?.scopes === 'moderator:read:followers channel:read:subscriptions bits:read');
  check('« Connecter » est désactivé pendant l’attente', (await page.evaluate("document.getElementById('settings-twitch-login').disabled")) === true);
  await page.click('#settings-twitch-code-copy');
  // 3. L'owner tape le code sur Twitch.
  fake.authorize();
  await waitText('settings-twitch-status', 'Connecté en tant que mozaik', 15_000);
  check('une fois autorisé, le Studio passe seul à « connecté » avec le compte', (await text('settings-twitch-status')).includes('Connecté en tant que mozaik : 6 abonnements actifs'));
  check('le panneau du code disparaît', (await page.evaluate("document.getElementById('settings-twitch-code').hidden")) === true);
  check('le bouton propose maintenant de reconnecter, la déconnexion est possible', (await text('settings-twitch-login')) === 'Reconnecter Twitch' && (await page.evaluate("document.getElementById('settings-twitch-logout').disabled")) === false);

  // 4. Les abonnements, tels que Twitch les exige.
  const first = sessionIds()[0];
  const subs = subscriptionsOf(first);
  check('six abonnements ont été créés, un par type, sur la session de la connexion', subs.map((/** @type {*} */ s) => `${s.type}@${s.version}`).join() === 'channel.follow@2,channel.subscribe@1,channel.subscription.message@1,channel.subscription.gift@1,channel.cheer@1,channel.raid@1');
  check('avec le jeton utilisateur et l’identifiant client dans l’en-tête', subs.every((/** @type {*} */ s) => /^AT-\d+$/.test(s.token) && s.clientId === FAKE_CLIENT_ID));
  check('les conditions suivent la documentation (suivi : modérateur ; raid : chaîne qui reçoit)', JSON.stringify(subs[0].condition) === JSON.stringify({ broadcaster_user_id: '42', moderator_user_id: '42' }) && JSON.stringify(subs[5].condition) === JSON.stringify({ to_broadcaster_user_id: '42' }));
  check('aucune demande n’a été refusée', fake.log.rejectedSubscriptions.length === 0);

  // 5. Les alertes.
  fake.notify('channel.follow', { user_name: 'Zoé' }, 'n-follow');
  fake.notify('channel.raid', { from_broadcaster_user_name: 'Boss', viewers: 120 }, 'n-raid');
  fake.notify('channel.cheer', { user_name: 'Ana', bits: 300, is_anonymous: false }, 'n-cheer');
  fake.notify('channel.subscription.gift', { user_name: 'Gus', total: 5, is_anonymous: false }, 'n-gift');
  fake.notify('channel.subscribe', { user_name: 'Léa', is_gift: false }, 'n-sub');
  fake.notify('channel.subscribe', { user_name: 'Bénéficiaire', is_gift: true }, 'n-gifted');
  fake.notify('channel.follow', { user_name: 'Zoé' }, 'n-follow');
  await page.waitFor("[...document.querySelectorAll('#settings-alerts li')].some((li) => li.textContent.includes('Sub Léa'))", 8000);
  const types = render.messages.map((message) => JSON.stringify(message));
  check('la page de rendu reçoit les alertes normalisées', types.includes('{"type":"follow","username":"Zoé"}') && types.includes('{"type":"raid","username":"Boss","amount":120}') && types.includes('{"type":"bits","username":"Ana","amount":300}') && types.includes('{"type":"sub","username":"Gus","amount":5}') && types.includes('{"type":"sub","username":"Léa"}'));
  check('un abonnement offert reçu ne fait pas d’alerte (le donateur en a fait une)', !types.some((line) => line.includes('Bénéficiaire')));
  check('la même notification reçue deux fois ne fait qu’une alerte', render.messages.filter((message) => message.username === 'Zoé').length === 1);
  check('le journal montre la source « Twitch »', (await alertsText()).some((line) => line.includes('Raid Boss (120) — Twitch')));
  check('et l’état dit quand est venue la dernière', (await text('settings-twitch-status')).includes('Dernière alerte'));
  const before = render.messages.length;

  // 6. Reprise annoncée par Twitch : la session continue sans nouvel abonnement.
  fake.announceReconnect();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  check('une reprise annoncée ne recrée aucun abonnement', fake.log.subscriptions.length === 6);
  fake.notify('channel.follow', { user_name: 'Après-reprise' }, 'n-after-reconnect');
  await page.waitFor("[...document.querySelectorAll('#settings-alerts li')].some((li) => li.textContent.includes('Après-reprise'))", 8000);
  check('les alertes arrivent encore après la reprise, sans doublon', render.messages.length === before + 1 && render.messages.filter((message) => message.username === 'Après-reprise').length === 1);
  check('et l’ancienne connexion est fermée', fake.connections === 1);

  // 7. Réseau coupé : nouvelle session, nouveaux abonnements.
  fake.dropConnections();
  await waitText('settings-twitch-status', 'perdue', 8000);
  check('une connexion perdue est dite', (await text('settings-twitch-status')).includes('Connexion à Twitch perdue'));
  await waitText('settings-twitch-status', 'Connecté en tant que mozaik', 15_000);
  const second = sessionIds().at(-1);
  check('Studio se reconnecte seul, sur une session neuve avec ses six abonnements', second !== first && subscriptionsOf(second).length === 6);

  // 8. Jeton d'accès expiré : rafraîchi, l'abonnement retenté, le jeton de rafraîchissement n'a servi qu'une fois.
  const tokenBefore = subscriptionsOf(second)[0].token;
  fake.expireAccessTokens();
  fake.dropConnections();
  await waitText('settings-twitch-status', 'perdue', 8000);
  await waitText('settings-twitch-status', 'Connecté en tant que mozaik', 20_000);
  const third = sessionIds().at(-1);
  check('un jeton refusé (401) est rafraîchi puis l’abonnement réussit, sans demander de se reconnecter', third !== second && subscriptionsOf(third).length === 6 && fake.log.refreshes.length === 1);
  check('la nouvelle session utilise le jeton neuf', subscriptionsOf(third)[0].token !== tokenBefore && /^AT-\d+$/.test(subscriptionsOf(third)[0].token));
  check('le rafraîchissement ne porte aucun secret client (application publique)', !('client_secret' in fake.log.refreshes[0]) && fake.log.refreshes[0].grant_type === 'refresh_token');

  // 9. Jamais un jeton dans une réponse ni dans l'état des scènes.
  const body = await connections();
  const stateText = JSON.stringify(await stack.api('/state'));
  check('l’API ne renvoie ni jeton d’accès ni jeton de rafraîchissement', !/AT-\d|RT-\d/.test(body) && !/AT-\d|RT-\d/.test(stateText));
  const file = JSON.parse(readFileSync(`${stack.stateFile}.connections.json`, 'utf8'));
  check('ils sont dans le fichier des connexions du serveur', /^AT-\d+$/.test(file.twitch.accessToken) && /^RT-\d+$/.test(file.twitch.refreshToken) && file.twitch.userId === '42' && file.twitch.login === 'mozaik');

  // 10. L'owner retire l'autorisation sur Twitch.
  const socketsAtRevocation = fake.log.socketsOpened;
  fake.revokeAuthorization();
  await waitText('settings-twitch-status', 'retirée', 8000);
  check('une autorisation retirée sur Twitch est dite, avec la marche à suivre', (await text('settings-twitch-status')).includes('reconnectez Twitch'));
  check('et le bouton devient « Reconnecter Twitch »', (await text('settings-twitch-login')) === 'Reconnecter Twitch');
  await new Promise((resolve) => setTimeout(resolve, 2500));
  check('le Studio ne boucle pas sur une autorisation morte : aucune nouvelle connexion, aucun nouvel abonnement', fake.log.socketsOpened === socketsAtRevocation && fake.log.subscriptions.length === 18 && fake.connections === 0);

  // 11. Se reconnecter, puis se déconnecter.
  await page.click('#settings-twitch-login');
  await page.waitFor("!document.getElementById('settings-twitch-code').hidden", 6000);
  await waitText('settings-twitch-status', 'Connecté en tant que mozaik', 15_000);
  check('reconnecter repasse par le code et rétablit la session', (await text('settings-twitch-status')).includes('6 abonnements actifs'));
  const tokenToRevoke = JSON.parse(readFileSync(`${stack.stateFile}.connections.json`, 'utf8')).twitch.accessToken;
  await page.click('#settings-twitch-logout');
  await waitText('settings-twitch-status', 'Prêt', 8000);
  check('« Déconnecter » remet « prêt », sans oublier l’identifiant client', (await text('settings-twitch-status')).includes('Prêt') && (await page.evaluate("document.getElementById('settings-twitch-client').value")) === FAKE_CLIENT_ID);
  check('Twitch a été prié de révoquer le jeton', fake.log.revoked.includes(tokenToRevoke));
  const after = JSON.parse(readFileSync(`${stack.stateFile}.connections.json`, 'utf8'));
  check('le fichier ne garde plus de jeton, seulement l’identifiant client', after.twitch.accessToken === undefined && after.twitch.refreshToken === undefined && after.twitch.clientId === FAKE_CLIENT_ID);
  check('la session est coupée côté Twitch', fake.connections === 0);

  // 12. Annuler une autorisation en attente.
  await page.click('#settings-twitch-login');
  await page.waitFor("!document.getElementById('settings-twitch-code').hidden", 6000);
  await page.click('#settings-twitch-cancel');
  await page.waitFor("document.getElementById('settings-twitch-code').hidden", 5000);
  check('annuler une autorisation en attente referme le panneau et revient à « prêt »', (await text('settings-twitch-status')).includes('Prêt'));

  await page.press('Escape');
  render.ws.close();
  // Le refus de l'identifiant invalide (400, voulu au début de l'essai) est le seul message de la console attendu.
  const unexpected = errors.filter((/** @type {string} */ message) => !message.includes('/connections/twitch/client'));
  check('aucune erreur dans la console (hors le refus voulu de l’identifiant invalide)', unexpected.length === 0 ? true : unexpected);
}
