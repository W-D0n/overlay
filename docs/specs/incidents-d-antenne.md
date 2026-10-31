---
created: 2026-10-31
updated: 2026-10-31
---

# Spec — Incidents d'antenne (être prévenu quand la chaîne casse)

Statut : **livrée**. Le fond à l'antenne dégrade en silence **par conception** (geler la dernière image plutôt qu'afficher une erreur : correct pour
OBS). Conséquence : le streamer ne sait jamais qu'un problème est survenu. Le bandeau « Antenne » du Studio montre l'état, mais il ne **dit** rien
quand l'état change, et le Studio n'est pas sous les yeux pendant un live (OBS est devant). Cette spec comble ce trou **sans toucher à l'invariant** : le rendu
OBS ne change pas, c'est le Studio qui prévient.

## 1. Ce qui est surveillé (`dev/incident-watch.js`, pur)

Les trois points dont dépend le fond, lus par le bandeau (`antenna-status.js`) :

| Point | Perte | Rétablissement |
|---|---|---|
| Serveur d'état | « ne répond plus : le Studio et l'antenne ne sont plus synchronisés » | « répond de nouveau » |
| OBS | « n'est plus joignable depuis le Studio (…raison…) » | « de nouveau joignable » |
| Page de rendu | « plus aucune page de rendu : la source OBS n'affiche plus le fond » | « de nouveau connectée » |

**Règles :**
- On ne parle que des **changements**. Rien au premier relevé : ce qui est déjà cassé à l'ouverture est dans le bandeau.
- Un changement n'est retenu qu'après **deux relevés identiques de suite** (10 s) : un battement ne réveille personne.
- Un point qui n'est pas en jeu n'est jamais un incident : OBS non configuré, ou point non lu parce que le serveur est éteint. Un serveur éteint est
  **une** perte, pas trois ; à son retour, seul le serveur est « rétabli ».

## 2. Où l'incident est dit (`dev/incident-notifier.js`)

1. La **ligne d'état** du Studio (perte en erreur, rétablissement en succès ; le « connecté » ordinaire la reprend ensuite).
2. Le **titre de l'onglet**, préfixé « ⚠ » tant qu'un incident dure : visible depuis la barre des tâches.
3. Une **notification du système**, si l'utilisateur l'a demandée (bouton « Alertes système » du bandeau) **et** que le navigateur l'a accordée **et** que
   le Studio **n'est pas visible** (devant lui, le bandeau suffit ; une notification de plus serait du bruit). Une par point (`tag`) : la nouvelle remplace
   l'ancienne au lieu de s'empiler.

Activer demande l'autorisation du navigateur ; un refus laisse l'option éteinte et dit comment l'accorder. Le choix suit l'utilisateur (réglages du
serveur, `alerts.system`).

**Limite devenue fonction :** le bandeau ne lisait plus rien quand la page était cachée — exactement quand un incident passe inaperçu. Il lit désormais
**toutes les 5 secondes, page cachée comprise** (deux lectures locales : aucun coût).

## 3. Vérification

`dev/incidents.test.js` (15 tests : confirmations, battements, serveur éteint, OBS non configuré, titre, tag, autorisation), essai `27-incidents.e2e.js`
(vrai relevé toutes les 5 secondes, page « cachée », fausse notification : perte, titre, notification unique avec son tag, rétablissement, extinction).
9 mutations vues rouges (une 10e, équivalente, a fait simplifier le code).

## 4. Reste

- **Chute de FPS** : le Studio ne sait pas à quel rythme OBS dessine ; la page de rendu devrait le remonter par son canal d'état. À mesurer d'abord (`inbox.md`).
- Chrome peut ralentir les minuteurs d'un onglet caché depuis plus de 5 minutes (hypothèse, non mesurée) ; l'application de bureau n'est pas concernée.
- Son d'alerte, ou repli sur l'application de bureau (notification native Tauri) : à décider selon l'usage.
