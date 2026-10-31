---
created: 2026-10-31
updated: 2026-10-31
---

# Spec — Connexions et alertes (OBS, Twitchat, Twitch)

Statut : **livré** (première version complète). Fait suite à une demande de l'owner (2026-10-31) : le terminal disait « mot de passe refusé par OBS — corrige
`OBS_WS_PASSWORD` puis relance le serveur » ; il fallait une saisie dans le produit. Et les alertes réelles manquaient : sans Twitch, les liaisons « alerte → valeur » et
les réactions du fond ne servaient qu'en test. Cadrage d'origine : `studio-cadrage.md` (« sources d'événements interchangeables », §Twitchat).

## 1. Décisions

| # | Décision | Raison |
|---|---|---|
| K1 | Les réglages de connexion sont des **secrets** dans un fichier à part, `<état>.connections.json` (dossier `dev/data`, ignoré par git, jamais servi, mode `0o600` là où le système le permet). | Jamais exportés avec les scènes (le fichier d'état s'exporte), jamais dans le dépôt, jamais servis. |
| K2 | **L'API ne renvoie jamais un secret** : mot de passe OBS (« enregistré », pas sa valeur), jetons Twitch. Le bouton Afficher / Masquer agit sur la **saisie en cours**. | Un secret relisible depuis l'API serait lisible par tout ce qui parle à `localhost`. |
| K3 | `.env` reste lu en repli ; **ce que le Studio enregistre passe devant**. | Une installation existante continue de marcher sans rien ressaisir. |
| K4 | Une écriture exige l'en-tête `X-Overlay-Control: 1`. | Il force une requête préalable CORS qu'une page étrangère ne passe pas (comme `/control/*`). |
| K5 | Un **point d'entrée unique des alertes** (`dev/event-intake.js`) : bouton de test, Twitchat et Twitch y arrivent ; il journalise (20 dernières, avec la source) et **limite les rafales** (20 alertes / 5 s). | Une seule règle de validation et de protection ; le Studio montre d'où vient chaque alerte. |
| K6 | Toute source externe passe par `normalizeAlert` : `{ type, username?, amount? }`, pseudo borné et nettoyé, montant entier borné, **champs inconnus écartés**. | Rien d'autre que ces trois champs n'atteint OBS (contrat des réactions, `CLAUDE.md` §6). |
| K7 | **Twitchat est client WebSocket** d'un serveur que nous exposons (`WebsocketTrigger`, dépôt Durss/Twitchat : l'action « ws » d'un trigger envoie le payload JSON de l'utilisateur) ; nous n'écoutons pas les `CustomEvent` d'OBS. | Aucun élargissement de la connexion OBS (qui reste en lecture seule et limitée aux scènes) ; aucun `RAID` dans l'API OBS de Twitchat ; le format est le nôtre, donc les quatre types sont couverts. |
| K8 | Twitch par **EventSub WebSocket** et **autorisation par code d'appareil** (client « Public » : aucun secret). | Aucun serveur public ni adresse de rappel ; l'owner tape un code, le Studio ne voit jamais son mot de passe Twitch. |

## 2. Réglages OBS (`dev/connection-*.js`, `dev/obs-connection.js`, `dev/settings-controller.js`)

- `GET /connections` : adresse, `passwordSet`, origine (`settings` | `env` | `none`), état. `POST /connections/obs` : `{ url?, password? }` ; `password: null` efface, `url: ''` revient au défaut ; valeurs validées
  (adresse `ws://` ou `wss://`, mot de passe 256 caractères au plus, aucun caractère de contrôle).
- `obs-connection.js` possède le client OBS : `restart()` le ferme et en ouvre un neuf avec les réglages du moment, **sans relancer le serveur** — y compris après « mot de passe refusé » (le client, lui, ne réessaie
  jamais seul un refus). Un redémarrage pendant que le précédent lit les réglages le remplace ; les retours d'un ancien client sont ignorés. Nouvel état : `connecting`.
- Fenêtre **Réglages** du bandeau d'antenne (et palette `Ctrl+K`) : adresse, mot de passe masqué (Afficher / Masquer, remasqué et vidé à l'enregistrement et à la fermeture), Enregistrer et connecter, Effacer ;
  la fenêtre relit l'état chaque seconde.
- Messages d'erreur d'OBS (client, diagnostic, antenne, association de scènes) : « corrige-le dans Réglages ».

## 3. Alertes : point d'entrée, journal, limiteur

`event-intake.js` : `publish(alerte, source)` diffuse sur le canal `event`, journalise, refuse au-delà de la rafale (les refus sont comptés et dits). `POST /event` (boutons de test) y passe aussi (429 au-delà de la rafale).
Le journal vit tant que le serveur tourne ; il n'est pas persisté.

## 4. Twitchat (`dev/twitchat-link.js`, `dev/twitchat-adapter.js`)

- Adresse : `ws://127.0.0.1:<port>/twitchat-ws?token=<jeton>` ; la racine `ws://127.0.0.1:<port>` accepte aussi Twitchat (hôte et port seuls, jeton dans chaque message).
- **Origine** : la page de Twitchat n'est pas locale. Ce canal est **la seule surface qui accepte une Origin hors boucle locale** ; le filtre est un **jeton** (24 octets du générateur système, 48 hexadécimaux), comparé sans court-circuit,
  dans l'adresse ou dans chaque message ; le **Host reste exigé local**. Jeton faux dans l'adresse : 401. Sans jeton valide, un message n'a aucun effet et la raison est dite (`lastError`).
- Messages bornés (4 Ko ; 64 Ko par connexion), au plus 5 connexions. Accusé par message (`{ ok, type }` ou `{ ok: false, error }`) ; Twitchat les ignore (pas de `topic`).
- Format : `{ "type": "follow" | "sub" | "raid" | "bits", "username": "…", "amount": … }`. Twitchat substitue ses placeholders par du **texte** : `"25"` est lu comme 25. Tolérés : casse du type, synonymes (`subscription`, `cheer`…), `user` / `login`
  pour le pseudo, `viewers` / `bits` pour le montant.
- Le Studio donne l'adresse (masquée, copiable), l'hôte et le port, un **modèle de message** par type (avec ou sans le jeton dans le message), et **régénère** le jeton (second appui ; les connexions sont coupées, code 4401).

## 5. Twitch (`dev/twitch-auth.js`, `twitch-eventsub.js`, `twitch-alerts.js`, `twitch-connection.js`)

Faits tenus de la documentation de Twitch (lue le 2026-10-31) :

- **Autorisation** : `POST /oauth2/device` (`client_id`, `scopes`) → code et adresse ; `POST /oauth2/token` en `device_code` (400 `authorization_pending` tant que non autorisé). Portées demandées :
  `moderator:read:followers`, `channel:read:subscriptions`, `bits:read` (le raid n'en exige aucune). Les portées accordées sont **vérifiées** (`GET /oauth2/validate`) : une autorisation partielle est refusée en disant ce qui manque.
- **Jetons** : accès 4 h, rafraîchi 5 minutes avant ; le jeton de rafraîchissement **ne sert qu'une fois** (le neuf est écrit dans le fichier **avant** tout autre usage ; deux rafraîchissements simultanés n'en font qu'un) ; il expire après 30 jours
  d'inactivité. Refusé : jetons effacés, le Studio demande de se reconnecter. Incident réseau : jetons gardés.
- **EventSub WebSocket** : `wss://eventsub.wss.twitch.tv/ws` → `session_welcome` → **dans les 10 s** un `POST /helix/eventsub/subscriptions` par type (**jeton utilisateur** obligatoire) ; six abonnements : `channel.follow` v2
  (condition : chaîne et modérateur), `channel.subscribe`, `channel.subscription.message`, `channel.subscription.gift`, `channel.cheer`, `channel.raid` (condition : chaîne qui **reçoit**, une seule clé).
- **Cycle** : `session_keepalive` / `notification` réarment une surveillance (délai annoncé + 3 s) ; sans message, la connexion est perdue et rouverte (reculs 2, 5, 15, 30 s) avec de **nouveaux** abonnements (ceux d'une session coupée
  sont désactivés, les événements manqués ne sont pas rejoués). `session_reconnect` : ouvrir l'adresse donnée **telle quelle**, garder l'ancienne jusqu'au `session_welcome` de la nouvelle, **sans** nouvel abonnement, puis fermer l'ancienne.
  `revocation` d'autorisation : arrêt net et reconnexion demandée, **jamais de boucle**. Le client **n'envoie rien** sur la socket (Twitch ferme sur 4001). Doublons dédoublonnés par identifiant de message.
- **Traduction** (`twitch-alerts.js`) : follow → `follow` ; nouvel abonnement → `sub` ; ré-abonnement → `sub` + mois cumulés ; abonnements offerts → **une** alerte `sub` (donateur, « Anonyme » si masqué, nombre offert) et **aucune** pour chaque bénéficiaire ;
  cheer → `bits` (sans pseudo si anonyme) ; raid → `raid` (qui raide, spectateurs).
- Adresses de Twitch redirigeables (`TWITCH_ID_URL`, `TWITCH_API_URL`, `TWITCH_EVENTSUB_URL`) : c'est ce qui permet aux essais de parler à un faux Twitch. La pile d'essais les pose toujours : **jamais le vrai Twitch**.

## 6. Vérification

- Tests : `connection-settings`, `connection-store`, `connection-routes`, `connection-view` (+ Twitch), `obs-connection`, `alert-event`, `event-intake`, `twitchat-adapter`, `twitchat-link`, `twitchat-host`, `twitch-auth`, `twitch-alerts`,
  `twitch-eventsub`, `twitch-connection`, démarrage du serveur (mot de passe relu, reconnexion à chaud, Twitch rouvert au démarrage, jeton proche de l'échéance rafraîchi).
- Essais de bout en bout (vrai Chrome, vrais serveurs) : `30-reglages-obs` (**faux OBS qui vérifie l'empreinte d'authentification** : mauvais mot de passe refusé en 4009, bon mot de passe connecté), `31-twitchat` (client WebSocket **depuis l'Origin de Twitchat**),
  `32-twitch` (**faux Twitch** appliquant jeton de rafraîchissement à usage unique, portées, session ; code, autorisation, alertes, reprise, coupure, jeton expiré, autorisation retirée, déconnexion) ; la fenêtre Réglages est auditée par `13-accessibilite`.
- Régressions réinjectées vues rouges : 95 mutations sur ces modules (jeton renvoyé par l'API, Origin libre partout, limiteur retiré, jeton de rafraîchissement réutilisé, reprise qui se réabonne, boucle sur autorisation retirée…). Les survivantes étaient équivalentes (le champ de l'adresse est masqué par deux mécanismes redondants, retirés ensemble : rouge) ou ont fait ajouter un test.
- Limite assumée : le faux Twitch applique les règles **documentées** ; il ne prouve pas que le vrai Twitch se comporte exactement ainsi. C'est la procédure de l'owner qui le vérifie (`procedures-owner.md` §1, §2).

## 7. Reste

- Twitchat : libellés et placeholders exacts de son interface (`{USER}`, `{BITS}`) à confirmer à l'écran ; le comportement des navigateurs récents face à une page web qui parle à l'ordinateur local (demande d'autorisation du « réseau local ») n'est pas vérifié.
- Twitch : points de chaîne, début et fin de live, hype train, nombre de viewers (sources de données des couches, piste 3 de l'inbox) ; plusieurs comptes ; abonnements par palier (tier) dans l'alerte.
- OBS : un OBS sans authentification (mot de passe vide) n'est pas géré (le client ne s'ouvre qu'avec un mot de passe, comme avant).
