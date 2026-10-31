---
created: 2026-10-31
updated: 2026-10-31
---

# Procédures — ce que seul l'owner peut faire

Chaque point de [`inbox.md`](inbox.md) § « À faire par l'owner » a ici ses étapes, le **résultat attendu** et **ce qu'il faut me dire**. Ce que j'ai prouvé par des
essais (faux OBS, faux Twitch, vrai Chrome) n'est pas répété : ces procédures couvrent ce qu'**aucun essai ne peut montrer** (le vrai OBS, le vrai Twitch,
le vrai Twitchat, un regard humain). Quand je n'ai pas pu lire une étiquette d'interface chez un tiers (Twitch, Twitchat), je l'écris **« à vérifier à l'écran »**.

Ordre conseillé : 1 → 2 → 3 (les connexions), puis 4 à 9 (OBS), puis 10 à 14 (le reste).

---

## 1. Twitch : brancher les alertes réelles (EventSub)

**Pourquoi** : sans cela, les follows, subs, raids et bits ne viennent que des boutons de test.
**Durée** : 10 minutes, une seule fois.

1. Sur https://dev.twitch.tv/console/apps (compte du streamer ; Twitch demande en général la **double authentification** pour la console, *à vérifier à l'écran*), **Register Your Application**.
   - **Name** : un nom unique, par exemple `Overlay Studio D0n`.
   - **OAuth Redirect URLs** : `http://localhost` (le champ est obligatoire, ce flux ne s'en sert pas).
   - **Category** : au choix (par exemple *Application Integration*).
   - **Client Type** : **Public**. C'est essentiel : un client « Confidential » ne permet pas ce mode d'autorisation sans secret.
2. **Create**, puis rouvrez l'application (bouton **Manage**, *à vérifier*) et copiez le **Client ID** (30 caractères). Il n'est pas secret.
3. Dans le Studio : **Réglages › Twitch**, collez l'identifiant dans « Identifiant client de l'application », **Enregistrer**. L'état passe à « Prêt ».
4. **Connecter Twitch** : le Studio affiche un **code** (de la forme `WDJB-MJHT`) et un lien. Ouvrez le lien (il s'ouvre dans un autre onglet), connectez-vous à Twitch si besoin,
   **tapez le code**, puis **autorisez**. Twitch liste trois autorisations (suivre la chaîne en tant que modérateur, voir les abonnements, voir les bits ; *libellés exacts à vérifier à l'écran*) : acceptez-les **toutes**.
5. Revenez au Studio sans rien faire : en quelques secondes il passe à **« Connecté en tant que <votre compte> : 6 abonnements actifs »**.

**Résultat attendu** : le message ci-dessus. Le Studio se reconnecte ensuite tout seul (au démarrage, après une coupure réseau, quand Twitch demande de reprendre la session).

**Tester** :
- **Follow** : avec un second compte, suivez votre chaîne (puis ne plus suivre pour recommencer). L'alerte apparaît dans **Réglages › Alertes reçues** (source « Twitch »), et le fond d'OBS réagit.
- **Sub, bits, raid** : seuls de vrais événements le prouvent (un ami qui raide, un don de bits). Ils sont couverts par les essais contre un faux Twitch, pas contre le vrai ; **votre premier vrai raid ou sub est le vrai test**.
  Regardez alors « Alertes reçues ».

**Si ça ne va pas** (le Studio dit la raison, voici le sens) :

| Message | Cause | Remède |
|---|---|---|
| « identifiant client Twitch invalide » | Mauvaise copie | Recopier le Client ID, sans espace |
| « Twitch refuse la demande : invalid client … (application « Public ») » | Identifiant faux ou application « Confidential » | Recréer l'application en type **Public** |
| « autorisations incomplètes (manque : …) » | Une case refusée à l'étape 4 | **Reconnecter Twitch** et tout accepter |
| « Twitch refuse l'abonnement channel.… » | Le compte autorisé n'est pas le streamer, ou une portée manque | **Reconnecter Twitch** avec le compte de la chaîne |
| « Twitch a retiré l'autorisation… reconnectez Twitch » | Autorisation retirée sur Twitch, ou 30 jours sans lancer les serveurs | **Reconnecter Twitch** (même parcours) |
| « Connexion à Twitch perdue… » | Réseau coupé | Rien à faire : nouvelle tentative automatique (2, 5, 15, puis 30 s) |

**Me dire** : si l'étape 1 ou 4 ne ressemble pas à ce qui est écrit (Twitch change ses écrans), ce qui s'affiche ; le résultat du test de follow ; le premier raid / sub réel (reçu ou non).

---

## 2. Twitchat : relier ses triggers au Studio

**Pourquoi** : Twitchat connaît des événements que Twitch ne donne pas directement, et c'est votre outil de tous les jours. Il envoie ses alertes au Studio par WebSocket
(c'est Twitchat qui se connecte au Studio).
**Durée** : 10 minutes.

1. Dans le Studio : **Réglages › Twitchat** → **Copier** (l'adresse contient un jeton secret ; **Afficher** la montre).
2. Dans Twitchat (page web), ouvrez ses **paramètres** puis la rubrique des **connexions** et le réglage **WebSocket** *(libellés à vérifier à l'écran)*. Collez l'adresse et connectez.
   - Si Twitchat n'accepte qu'un **hôte et un port** : hôte `127.0.0.1`, port **celui que le Studio affiche** (5932 par défaut), **sans** connexion sécurisée. Dans ce cas, avant l'étape 4, cochez
     « jeton dans le message » dans le Studio.
3. Le Studio passe à **« Twitchat est connecté »**.
   - Si Chrome ou Edge demande l'autorisation d'**accéder au réseau local** (une page web qui parle à votre ordinateur), **autorisez**. *(Comportement des navigateurs récents ; non vérifié ici.)*
   - Safari peut refuser une connexion non sécurisée vers l'ordinateur local ; utilisez Chrome, Edge ou Firefox.
4. Créez **un trigger par alerte** dans Twitchat : l'événement (nouveau follow, abonnement, **raid reçu**, bits) + l'action **WebSocket** *(type « ws » dans Twitchat ; libellé à vérifier)*.
   Dans le Studio, choisissez le type, **Copier le modèle de message**, et collez-le comme contenu (payload) de l'action. Exemple pour un raid :
   `{"type":"raid","username":"{USER}","amount":"{VIEWERS}"}`.
   - `{VIEWERS}` est bien le nom du placeholder d'un raid chez Twitchat (vérifié dans son code). `{USER}` et `{BITS}` sont mes meilleures lectures : **utilisez le sélecteur de placeholders de
     Twitchat** et remplacez-les si les siens diffèrent. Un montant qui reste `"{VIEWERS}"` non remplacé est ignoré (l'alerte passe sans montant).
5. Utilisez le bouton de **test du trigger** dans Twitchat. L'alerte apparaît dans **Réglages › Alertes reçues** (source « Twitchat ») et le fond d'OBS réagit.

**Si ça ne va pas** : la ligne d'état du Studio dit « Dernier problème : … » (jeton manquant ou faux, JSON invalide, type d'alerte inconnu). **Régénérer le jeton** coupe Twitchat et invalide l'ancienne adresse :
recollez la nouvelle.

**Me dire** : les libellés réels de Twitchat (WebSocket, déclencheurs), si l'autorisation « réseau local » a été demandée, les placeholders qui ont fonctionné, et si Twitchat a bien envoyé les quatre types.

---

## 3. OBS : saisir le mot de passe dans le Studio

1. OBS → **Outils › Paramètres du serveur WebSocket** : cochez *Activer le serveur WebSocket*, **Afficher les informations de connexion**, copiez le **mot de passe** (port 4455 par défaut).
2. Studio → **Réglages › OBS** : collez le mot de passe (bouton **Afficher** pour vérifier votre saisie), **Enregistrer et connecter**.
3. Attendu : **« Connecté à OBS — N scène(s) détectée(s) »**, et le bandeau d'antenne montre la scène active d'OBS. Changez de scène dans OBS : le bandeau suit.
4. « Mot de passe refusé » : recopiez-le depuis OBS. « OBS injoignable » : OBS est-il ouvert, le serveur WebSocket activé, le port identique ?

Le mot de passe n'est plus relisible après l'enregistrement (c'est voulu). Le message d'erreur qui parlait de `.env` est remplacé par un renvoi vers Réglages.
**Me dire** : si la connexion se fait du premier coup, et ce que dit la fenêtre sinon.

---

## 4. Mode de fusion dans OBS

**Question** : une couche en mode « Produit » se mélange-t-elle avec la **vidéo d'OBS située dessous**, ou seulement avec le reste de la page ? *(Hypothèse non mesurée : la page ne voit pas les sources OBS.)*

1. Dans OBS : une source vidéo (caméra ou capture de jeu), et **au-dessus** la Browser Source du Studio.
2. Dans le Studio : une scène avec un effet bien visible, couche sélectionnée, réglage **Fusion** de l'inspecteur sur **Produit**, puis **Publier**.
3. Regardez dans OBS : l'effet **assombrit-il la vidéo dessous** (fusion avec la vidéo) ou se pose-t-il comme une couche ordinaire ?

**Me dire** : « fusionne avec la vidéo » ou « ne fusionne pas », et une capture d'écran. Si elle ne fusionne pas, je retirerai ou je préciserai ces modes dans l'éditeur.

---

## 5. Couches de contenu dans OBS (texte, forme, image, polices)

1. Studio → points de départ : **Début de live**, **Je reviens**, **Fin de live** → publier l'un d'eux. Dans OBS (Browser Source du Studio), vérifiez :
   - le **texte est net** à la résolution de la source (1920×1080) ;
   - une **police installée** (par exemple Bebas Neue, si vous l'avez) est bien trouvée par OBS ; sinon le texte retombe sur une police de secours et le Studio le dit.
2. **Médiathèque** : importez une vraie image (logo, affiche) et une police (WOFF2, WOFF, TTF ou OTF), posez-les dans une scène, publiez : l'image se charge dans OBS, la police importée s'applique au texte.
3. **Coût** : scène de 8 couches mêlant textes, images et effets : la pastille de coût du Studio, puis le banc (procédure 9). 60 i/s tenus ?

**Me dire** : netteté, police trouvée ou non, image chargée ou non, i/s.

---

## 6. Liaisons au son et aux alertes dans OBS

1. **Alerte → valeur** : un titre avec une liaison « alerte raid → opacité » ; déclenchez un raid avec **Tester une réaction › Raid** (ou un vrai raid, procédures 1 et 2). Le titre apparaît puis retombe selon la durée réglée.
2. **Son → valeur** : un logo avec une liaison « niveau sonore → échelle ». OBS doit avoir été lancé par le raccourci portant **`--enable-media-stream`** (sinon le micro n'est jamais demandé). Parlez : le logo réagit.
3. Vérifiez : la fluidité (60 i/s), la demande d'accès au micro, la retombée.

**Me dire** : fluide ou non, le micro a-t-il été demandé, la retombée est-elle bien celle réglée.

---

## 7. Alertes système (incidents d'antenne)

1. Dans le bandeau d'antenne, **Alertes système** : acceptez la demande de notification du navigateur.
2. Réduisez le Studio (ou changez de fenêtre), puis **fermez OBS** ou désactivez la Browser Source.
3. Attendu : une **notification du système** en moins de 20 s, et le titre de l'onglet porte « ⚠ ». Rétablissez : le retour à la normale est dit aussi.

**Me dire** : le délai réel, et si une **chute de FPS** (non couverte) mérite d'être remontée.

---

## 8. Timeline dans OBS

1. Studio : un titre avec une timeline (opacité 0 → 1 en 0,8 s), **publier**.
2. Dans OBS, changez de scène puis revenez : l'animation doit **rejouer à chaque arrivée**. Réglez la boucle et regardez-la tourner.
3. Vérifiez : la fluidité à 60 i/s, la boucle, le comportement **pendant une transition de scène** OBS.

**Me dire** : rejoue-t-elle à chaque arrivée, fluide ou non, comportement pendant la transition.

---

## 9. Relancer le banc de mesure

À refaire après tout changement de rendu (cette session en a fait : contenus, liaisons, timeline).

1. OBS : Browser Source `http://localhost:5931/dev/obs-bench.html`, à la **taille de votre canvas** (1920×1080).
2. Attendez ~75 s : dix scénarios s'enchaînent, le tableau se lit à l'écran avec un verdict par ligne (ok / à surveiller / trop coûteux).
3. Prenez une capture, puis vérifiez que le rapport est lu par le serveur : ouvrez `http://localhost:5932/bench-result` dans un navigateur (un JSON, pas une erreur 404).
4. Retirez la source de test.

**Me dire** : la capture (comme celle de la dernière fois) ; je la lis et je règle les limites si un scénario dérive.

---

## 10. Application de bureau (Tauri) : démarrage avec Windows

1. Ouvrez l'application de bureau, cochez **« Lancer l'application au démarrage de Windows »**.
2. Redémarrez Windows : l'application doit se lancer seule (et, si vous l'avez réglé ainsi, les serveurs).
3. Décochez-la pour revenir en arrière si besoin.

**Me dire** : si elle se relance après le redémarrage, et si la case garde son état.

---

## 11. Exécutable sans Bun : décision

Aujourd'hui, **Bun est requis** sur la machine. Voulez-vous qu'une version livre tout (un seul exécutable, sans installer Bun) ? C'est plus pratique à diffuser, plus lourd à produire et à mettre à jour.
**Me dire** : « oui » ou « non », et si le produit doit être utilisé par d'autres que vous.

---

## 12. `start-stream` : l'invite « remplacer ? »

Quand les serveurs tournent déjà, que doit faire `start-stream.bat` ? Aujourd'hui il s'arrête avec une erreur « port(s) déjà occupé(s) ».

1. Lancez `start-stream.bat`, laissez-le tourner, puis relancez-le dans un second terminal : lisez le message.
2. Choisissez : **(a)** garder l'erreur (sûr : jamais d'arrêt involontaire en plein live), **(b)** proposer « remplacer l'instance en cours ? » avec confirmation.

**Me dire** : a ou b. Je recommande **a** pendant un live, **b** seulement hors live.

---

## 13. Validations visuelles et QA OBS 1080p

- **ShapeMorph** : les cinq contours (pizza, étoile ninja, casque, carapace, masque) et leurs interpolations, dans le Studio en enchaînant les formes.
- **ColorDrops** : rendu, rythme, lisibilité des gouttes colorées.
- **Amplitude des réactions audio** (Rain, FloatingSymbols, ColorDrops, OrbitingShapes) : trop discrète ou trop forte ? (la mesure automatique sature ; seul un regard tranche).
- **QA OBS 1080p** : le protocole détaillé est dans `docs/inbox.md` (QA court puis protocole complet).

**Me dire** : un constat par ligne (« ShapeMorph : l'étoile est trop pointue », « amplitude Rain : trop forte à intensité 1 »), même brève.

---

## 14. Usage réel de l'éditeur → groupes de couches (6h)

Utilisez l'éditeur pour de vrais lives pendant quelque temps. Notez les moments où vous avez voulu **déplacer, masquer ou animer plusieurs couches ensemble**, ou retrouver une couche dans une longue pile.
**Me dire** : les gestes qui ont manqué, et si des **groupes de couches** les auraient résolus. C'est ce qui décide de 6h.

---

## En cas de problème pendant ces essais

- Le journal du serveur d'état (le terminal où tourne `start-stream.bat`) dit ce qu'il se passe côté connexions.
- **Réglages** montre l'état d'OBS, de Twitch et de Twitchat, et les dernières alertes reçues ; le **Diagnostic** du bandeau d'antenne vérifie la chaîne jusqu'à OBS.
- Ne jamais coller un mot de passe, un jeton Twitch ou l'adresse complète de Twitchat (elle contient un jeton) dans un message : décrivez ce que vous voyez. Si l'un d'eux a fuité, **Régénérer le jeton**
  (Twitchat), **Déconnecter** puis reconnecter (Twitch), ou changer le mot de passe dans OBS.
