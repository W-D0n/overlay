// @ts-check
/**
 * Le lien avec Twitchat : le Studio donne l'adresse à coller dans Twitchat (masquée, jeton compris) et un modèle de message ; un vrai client
 * WebSocket (depuis l'Origin de Twitchat, comme la page web) envoie des alertes ; elles arrivent aux pages de rendu (canal `event`) et
 * dans le journal du Studio. Un jeton faux est refusé, un message invalide est dit, un jeton régénéré coupe l'ancien, une rafale est contenue.
 */
import { openStudio } from '../studio.js';

export const name = 'lien avec Twitchat';

/**
 * Un client WebSocket qui garde ce qu'il reçoit et comment il a fini.
 * @param {string} url
 * @param {Record<string, string>} [headers]
 */
function connect(url, headers = {}) {
  /** @type {any[]} */
  const messages = [];
  const state = { open: false, closed: /** @type {null | { code: number }} */ (null), failed: false };
  // `headers` est une extension de Bun : l'Origin d'une page web, que le navigateur impose et qu'un script de test doit poser lui-même.
  const ws = new WebSocket(url, /** @type {*} */ ({ headers }));
  ws.onopen = () => { state.open = true; };
  ws.onmessage = (event) => { messages.push(JSON.parse(String(event.data))); };
  ws.onclose = (event) => { state.closed = { code: event.code }; };
  ws.onerror = () => { state.failed = true; };
  /** @param {() => boolean} condition @param {number} [ms] */
  const until = async (condition, ms = 5000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (condition()) return true;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return false;
  };
  return {
    ws, messages, state, until,
    opened: () => until(() => state.open || state.failed || state.closed !== null),
    /** @param {unknown} message */
    send: (message) => ws.send(typeof message === 'string' ? message : JSON.stringify(message)),
    close: () => ws.close(),
  };
}

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  const TWITCHAT_ORIGIN = { Origin: 'https://twitchat.fr' };
  await openStudio({ page, stack });

  const text = (/** @type {string} */ id) => page.evaluate(`document.getElementById(${JSON.stringify(id)}).textContent`);
  const addressField = () => page.evaluate(`(() => { const f = document.getElementById('settings-twitchat-address'); return { type: f.type, value: f.value }; })()`);
  const alertsText = () => page.evaluate("[...document.querySelectorAll('#settings-alerts li')].map((li) => li.textContent)");
  const copied = () => page.evaluate('window.__copied ?? null');

  // Le presse-papiers d'un Chrome sans interface n'est pas un témoin fiable : on note ce que le Studio demande d'y mettre.
  await page.evaluate(`Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (text) => { window.__copied = text; } })`);

  // Un témoin de la page de rendu : il reçoit ce que reçoit OBS.
  const render = connect(`ws://127.0.0.1:${stack.statePort}/event-ws?role=render`);
  await render.opened();

  await page.click('#settings-open');
  await page.waitFor("document.getElementById('settings-dialog').open && document.getElementById('settings-twitchat-status').textContent !== ''", 8000);

  const startStatus = await text('settings-twitchat-status');
  const startAlerts = await alertsText();
  // Les suites partagent une pile : le journal peut déjà porter des alertes de test du Studio, jamais une alerte de Twitchat.
  check('au départ, on attend Twitchat et aucune alerte ne vient de lui', startStatus.includes('En attente de Twitchat') && !startAlerts.some((line) => line.includes('Twitchat')) ? true : [startStatus, startAlerts]);
  const address = await addressField();
  check('l’adresse à coller dans Twitchat porte le port du serveur et un jeton', address.value.startsWith(`ws://127.0.0.1:${stack.statePort}/twitchat-ws?token=`) && /token=[0-9a-f]{48}$/.test(address.value));
  check('et elle est masquée comme un mot de passe', address.type === 'password');
  await page.click('#settings-twitchat-reveal');
  check('« Afficher » la montre, et le bouton le dit', (await addressField()).type === 'text' && (await page.evaluate("document.getElementById('settings-twitchat-reveal').getAttribute('aria-label')")) === 'Masquer l’adresse de Twitchat');
  await page.click('#settings-twitchat-reveal');
  check('« Masquer » la cache de nouveau', (await addressField()).type === 'password');
  check('l’aide donne l’hôte et le port pour un Twitchat qui ne prend que ça', (await text('settings-twitchat-hostport')).includes(`127.0.0.1 — port ${stack.statePort}`));

  // Copier l'adresse puis s'y connecter avec : c'est exactement le geste de l'owner.
  await page.click('#settings-twitchat-copy');
  const copiedAddress = await copied();
  check('« Copier » met l’adresse complète dans le presse-papiers', copiedAddress === address.value);
  const twitchat = connect(copiedAddress, TWITCHAT_ORIGIN);
  await twitchat.opened();
  check('Twitchat (depuis son Origin, hors boucle locale) se connecte avec l’adresse copiée', twitchat.state.open);
  await page.waitFor("document.getElementById('settings-twitchat-status').textContent.includes('Twitchat est connecté')", 6000);
  check('le Studio dit « Twitchat est connecté »', (await text('settings-twitchat-status')).includes('Twitchat est connecté'));

  // Une alerte réelle, telle que le trigger la compose : le montant arrive en texte.
  twitchat.send({ type: 'raid', username: 'Zoé', amount: '25' });
  check('l’alerte est accusée', await twitchat.until(() => twitchat.messages.length === 1) && twitchat.messages[0].ok === true && twitchat.messages[0].type === 'raid');
  check('la page de rendu reçoit l’alerte normalisée (montant numérique)', await render.until(() => render.messages.length === 1) && JSON.stringify(render.messages[0]) === JSON.stringify({ type: 'raid', username: 'Zoé', amount: 25 }));
  await page.waitFor("[...document.querySelectorAll('#settings-alerts li')].some((li) => li.textContent.includes('Raid Zoé (25) — Twitchat'))", 6000);
  check('le journal du Studio la montre, avec sa source', (await alertsText()).some((line) => line.includes('Raid Zoé (25) — Twitchat')));
  check('et le statut dit quand', (await text('settings-twitchat-status')).includes('Dernière alerte : il y a'));

  // Un message invalide est dit, jamais avalé.
  twitchat.send('ceci n’est pas du JSON');
  check('un message invalide est refusé avec la raison', await twitchat.until(() => twitchat.messages.length === 2) && twitchat.messages[1].ok === false && twitchat.messages[1].error.includes('JSON'));
  twitchat.send({ type: 'MESSAGE_FIRST', username: 'x' });
  await twitchat.until(() => twitchat.messages.length === 3);
  check('un type inconnu est refusé et listé', twitchat.messages[2].ok === false && twitchat.messages[2].error.includes('message_first'));
  await page.waitFor("document.getElementById('settings-twitchat-status').textContent.includes('Dernier problème')", 6000);
  check('le Studio affiche le dernier problème (c’est ce qui guide une mauvaise configuration du trigger)', (await text('settings-twitchat-status')).includes('Dernier problème'));
  check('rien d’autre n’est parti vers le rendu', render.messages.length === 1);

  // Un jeton faux est refusé dès la connexion.
  const intruder = connect(`ws://127.0.0.1:${stack.statePort}/twitchat-ws?token=${'0'.repeat(48)}`, TWITCHAT_ORIGIN);
  await intruder.opened();
  check('un jeton faux dans l’adresse : connexion refusée', !intruder.state.open);
  const noToken = connect(`ws://127.0.0.1:${stack.statePort}/`, TWITCHAT_ORIGIN);
  await noToken.opened();
  noToken.send({ type: 'follow', username: 'sans jeton' });
  await noToken.until(() => noToken.messages.length === 1);
  check('sans jeton ni dans l’adresse ni dans le message : l’alerte est refusée', noToken.messages[0].ok === false && noToken.messages[0].error.includes('jeton') && render.messages.length === 1);

  // Le modèle de message, avec le jeton dedans, pour une adresse sans jeton (hôte et port seuls).
  await page.selectOption('#settings-twitchat-sample-type', 'raid');
  await page.click('#settings-twitchat-sample-token');
  await page.click('#settings-twitchat-sample');
  const sample = JSON.parse(await copied());
  check('le modèle copié est du JSON avec les placeholders de Twitchat et le jeton', sample.type === 'raid' && sample.username === '{USER}' && sample.amount === '{VIEWERS}' && /^[0-9a-f]{48}$/.test(sample.token));
  noToken.send({ ...sample, username: 'Léa', amount: '7' });
  await noToken.until(() => noToken.messages.length === 2);
  check('envoyé par une connexion sur la racine (hôte et port seuls), il est accepté', noToken.messages[1].ok === true && await render.until(() => render.messages.length === 2) && render.messages[1].username === 'Léa' && render.messages[1].amount === 7);
  check('le jeton ne va pas jusqu’à la page de rendu', !JSON.stringify(render.messages).includes(sample.token));

  // Le bouton de test du Studio passe par le même point d'entrée.
  await stack.api('/event', { type: 'follow', username: 'Test' });
  await page.waitFor("[...document.querySelectorAll('#settings-alerts li')].some((li) => li.textContent.includes('Follow Test — Studio (test)'))", 6000);
  const afterTest = await alertsText();
  check('une alerte de test du Studio est journalisée avec sa source', afterTest.some((line) => line.includes('Follow Test — Studio (test)')) ? true : afterTest);

  // Régénérer le jeton : deux appuis, l'ancien est coupé.
  await page.click('#settings-twitchat-regenerate');
  check('un premier appui demande confirmation', (await text('settings-twitchat-regenerate')).includes('Confirmer'));
  const oldToken = address.value.split('token=')[1];
  check('et ne change rien', (await copiedAddressOf(page)) === address.value && twitchat.state.closed === null);
  await page.click('#settings-twitchat-regenerate');
  check('le second appui coupe la connexion de Twitchat (code 4401)', await twitchat.until(() => twitchat.state.closed !== null) && twitchat.state.closed?.code === 4401);
  const fresh = (await addressField()).value;
  check('l’adresse affichée porte un jeton neuf', fresh !== address.value && fresh.includes('token=') && !fresh.includes(oldToken));
  const stale = connect(address.value, TWITCHAT_ORIGIN);
  await stale.opened();
  check('l’ancienne adresse ne marche plus', !stale.state.open);
  const renewed = connect(fresh, TWITCHAT_ORIGIN);
  await renewed.opened();
  renewed.send({ type: 'sub', username: 'Nina' });
  check('la nouvelle adresse marche', await renewed.until(() => renewed.messages.length === 1) && renewed.messages[0].ok === true);

  // Une rafale est contenue.
  for (let index = 0; index < 30; index += 1) renewed.send({ type: 'follow', username: `u${index}` });
  await renewed.until(() => renewed.messages.length === 31);
  const refused = renewed.messages.slice(1).filter((reply) => reply.ok === false && reply.error.includes('trop d’alertes'));
  check('une rafale est contenue : les alertes en trop sont refusées et dites', refused.length > 0 && refused.length < 30);
  await page.waitFor("[...document.querySelectorAll('#settings-alerts li')].some((li) => li.textContent.includes('ignorée(s) par la protection'))", 6000);
  check('le Studio dit combien ont été ignorées', (await alertsText()).some((line) => line.includes('ignorée(s) par la protection')));

  check('le jeton est stocké côté serveur, jamais dans l’état des scènes', !JSON.stringify(await stack.api('/state')).includes(fresh.split('token=')[1]));
  await page.press('Escape');
  check('Échap ferme la fenêtre', (await page.evaluate("document.getElementById('settings-dialog').open")) === false);

  for (const client of [render, twitchat, noToken, renewed, stale, intruder]) client.close();
  check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
}

/** Ce que « Copier » a mis en dernier (inchangé tant qu'on n'a pas recopié). @param {*} page */
async function copiedAddressOf(page) {
  return page.evaluate("document.getElementById('settings-twitchat-address').value");
}
