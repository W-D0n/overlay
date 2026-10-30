---
created: 2026-10-30
updated: 2026-10-30
---

# Spec — Décomposition du serveur d'état et brouillon / publication (étape 5)

Statut : **5a, 5b-1 et 5b-2 livrées**. Étape 5 de `docs/architecture-review.md` §5, après l'étape 4 (`scene-doc-etape-4.md`,
livrée). Constats d'origine : F5 (le serveur cumule quatre responsabilités), C2 (module non importable sans démarrer un
serveur), C3 (ajouter un canal touche cinq endroits, un canal inconnu tombe silencieusement dans `event`), C4 (le champ
`current` sert à la fois à ce que le tuner édite et à ce qui est diffusé à l'antenne).

## 1. Ce qui existe déjà

- Le **brouillon côté Studio** : `dev/background-draft.js` (« Publier », « Annuler », un état reçu de l'antenne
  n'écrase jamais un brouillon). La constatation D1 de la revue (« Essayer » part à l'antenne) est donc traitée côté client.
- `dev/background-state-server.js` : 593 lignes, aucun export, démarre `Bun.serve`, lit l'environnement et lance le client
  OBS à l'import. Sa seule garde est `dev/background-state-server.test.js` (vrais processus, 17 tests).
- Le serveur ne connaît **qu'un état en antenne** (`current`). `applySceneMapping` le réécrit à chaque changement de scène OBS.

## 2. 5a — Décomposition (sans changement de comportement)

Cible : chaque responsabilité derrière une interface étroite, testable sans réseau ni processus.

| Module | Interface | Porte |
|---|---|---|
| `dev/state-store.js` | `createStateStore({ path })` → `read()`, `transact(fn)`, `inspect(fn)` | lecture/écriture du fichier d'état, verrou, migration et sauvegarde `pre-v3.bak` |
| `dev/channels.js` | `createChannels()` → `add(socket)`, `remove(socket)`, `broadcast(channel, value)`, `count(channel, role)` | les ensembles de clients WebSocket et la diffusion ; un canal inconnu est refusé, jamais rangé ailleurs |
| `dev/preset-routes.js` | `createPresetRoutes({ update, inspect, announce })` → table `chemin → gestionnaire` | enregistrer, renommer, dupliquer, supprimer, prévisualiser et importer des presets |
| `dev/host.js` | `createHost({ store, channels, obs, control, staticPort })` → `{ fetch, websocket, applySceneMapping }` | routage, état courant, branding, événements, table scène → preset, diagnostic, contrôle ; aucune lecture d'environnement, aucun `process.exit` direct |
| `dev/background-state-server.js` | (script) | composition : environnement, `Bun.serve`, client OBS |

Gardes : la suite d'intégration existante, inchangée ; des tests unitaires du magasin, des canaux et de l'hôte (appel direct
de `fetch`, sans port) ; chaque garde vue rouge sur une régression réinjectée.

## 3. 5b — Historique des publications et brouillon serveur

Périmètre retenu par l'owner (2026-10-30) : historique **et** brouillon serveur, en deux sous-étapes.

### 5b-1 — Historique et retour en arrière (livré)

- **Entrée** = un état qui vient de quitter l'antenne (`{ at, current }`, `at` = l'instant du remplacement). Chaque
  publication du Studio (`POST /state`) qui change l'état range l'état remplacé en tête ; republier le même état ne laisse
  aucune trace. La « version précédente » existe donc dès la première publication.
- **Retour** (`POST /rollback { at }`) : remet l'état daté `at` à l'antenne, le diffuse, et range à son tour l'état remplacé :
  un retour se défait comme une publication. Instant inconnu : 404.
- **Hors historique** : les changements de scène OBS (`applySceneMapping`), qui se déduisent des presets et de la table scène → preset.
- **Borne** : 20 états (`HISTORY_LIMIT`), les plus anciens sortent. `at` identifie l'entrée : décalé d'une milliseconde tant qu'il existe déjà.
- **Persistance** : clé optionnelle `history` du fichier d'état (comme `sceneMap` et `branding`), entrées en scènes (`{ at, scene }`,
  `scene: null` = aucun fond). Version 3 inchangée ; un fichier sans historique se lit comme avant. `GET /state` ne la renvoie pas :
  les pages de rendu n'ont pas à la charger ; `GET /history` la sert.
- Module pur : `dev/background-history.js`.
- **Studio** : bouton « Historique » dans la barre du haut, panneau sur le modèle du Diagnostic (`dev/history-controller.js`, présentation
  pure dans `dev/history-view.js`). Remettre à l'antenne agit en direct : le premier clic arme le bouton (« Confirmer : en direct »,
  4 s), le second applique. Un serveur sans la route (ancien code) affiche « Historique indisponible » au lieu d'échouer.

### 5b-2 — Un brouillon par preset (retenu par l'owner, 2026-10-30)

Un **brouillon** est l'ensemble des réglages non enregistrés d'un preset existant : effet, options, transition, visibilité du
branding. Il est rangé sur le serveur sous l'identifiant du preset, et survit au rechargement du Studio comme au passage
à un autre preset.

- **Écriture** : `POST /draft { presetId, state }` (404 si le preset n'existe pas, 400 si l'état est invalide ou sans effet).
  Le Studio l'envoie après chaque réglage, temporisé (600 ms), tant qu'un preset est actif.
- **Lecture** : `GET /drafts` → `{ drafts: { <presetId>: { at, state } } }`. `GET /state` ne les renvoie pas (les pages de rendu n'en ont pas l'usage).
- **Abandon** : `POST /discard-draft { presetId }` (sans effet si absent).
- **Fin de vie** : « Mettre à jour » (`/save-preset` avec `id`) et la suppression du preset retirent son brouillon dans la même
  transaction ; le renommage le conserve ; un import qui réécrit un preset ne touche pas à son brouillon (le travail de l'owner est conservé).
- **Persistance** : clé optionnelle `drafts` du fichier d'état, entrées en scènes (`{ at, scene }`), comme `history`. Un brouillon d'un
  preset inconnu fait refuser le fichier à la lecture (jamais de réparation silencieuse). Version 3 inchangée.
- **Hors périmètre, tranché ici** : les réglages qui ne se rattachent à aucun preset enregistré (« Créer », effet choisi dans le
  sélecteur, point de départ) restent en mémoire dans le Studio, comme aujourd'hui. Aucune diffusion d'un brouillon à d'autres
  onglets du Studio.
- **Antenne** : un brouillon n'est jamais diffusé. Il ne dépend ni de `applySceneMapping` ni de la publication : le constat C4
  (l'édité et l'antenne confondus dans `current`) est levé par la séparation de ces deux zones du fichier.
- **Studio** : la ligne d'un preset porte une rangée « brouillon » avec son bouton « Revenir à la version enregistrée » ; cliquer le
  preset restaure son brouillon. Envoi : `dev/preset-draft-sync.js` capture l'état au réglage (pas à l'échéance du délai), envoie tout de
  suite le brouillon du preset quitté, et signale une fois un serveur sans la route plutôt que d'échouer à chaque réglage.
- Limite connue : un brouillon redevenu identique au preset enregistré reste signalé « brouillon » jusqu'à son abandon ou à la mise à jour.
- Modules : `dev/preset-drafts.js` (pur, serveur), `dev/preset-draft-sync.js` (Studio).
