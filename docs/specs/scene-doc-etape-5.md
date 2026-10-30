---
created: 2026-10-30
updated: 2026-10-30
---

# Spec — Décomposition du serveur d'état et brouillon / publication (étape 5)

Statut : **5a livrée, 5b à trancher**. Étape 5 de `docs/architecture-review.md` §5, après l'étape 4 (`scene-doc-etape-4.md`,
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

## 3. 5b — Brouillon et publication côté serveur (à trancher)

Question de fond : qu'ajoute un brouillon **serveur** à celui du Studio ? À lister avec l'owner avant toute écriture :

- **Persistance du brouillon** : aujourd'hui un rechargement du Studio le perd.
- **Séparation édité / en antenne** (C4) : `applySceneMapping` réécrit `current` ; avec un brouillon serveur il ne toucherait que l'antenne.
- **Retour à la version précédente en un clic** (cadrage) : suppose un historique des publications.
- **Scènes à plusieurs couches** : le serveur les refuse à la lecture tant qu'aucun éditeur n'existe (étape 6) ; le brouillon serveur est le lieu naturel de leur édition.
