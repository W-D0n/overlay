---
feature: scene-history-protocol
created: 2026-07-05
updated: 2026-07-06
status: draft
---

<!-- Extension 2026-07-05 : historique partagé avec placement-server.js (drag & drop), voir
     §Inclus et AC-12/AC-13 en fin de document. -->
<!-- Extension 2026-07-06 : concurrence d'accès entre les deux process, voir §Concurrence d'accès
     et AC-14/AC-15/AC-16 en fin de document. -->

# Spec : scene-history-protocol

## Contexte

En testant le panneau de placement (S8), l'owner a supprimé plusieurs couches/composants de la
scène `discussion` via les boutons "Retirer" — sauvegarde immédiate, aucune confirmation à l'époque,
aucun moyen de revenir en arrière dans l'outil (récupéré manuellement depuis git). Décision owner
(2026-07-05) : remplacer le modèle "bouton Enregistrer par composant + confirmations ponctuelles"
par une **sauvegarde automatique partout**, avec un **historique navigable par horodatage** comme
filet de sécurité (au lieu de la confirmation avant action).

Ne remplace pas git (qui reste la mémoire profonde, antérieure à ce mécanisme) — ajoute une couche
de versions **par scène**, consultable et restaurable directement depuis le panneau, sans repasser
par des commandes git.

## Périmètre

**Inclus :**
- `scenes/data/.history/<id>.json` : tableau de versions `{ timestamp, sceneConfig }` par scène.
  Premier instantané jamais enregistré ("origine") **jamais purgé** ; au-delà, fenêtre glissante des
  100 versions les plus récentes (owner, 2026-07-05).
- `dev/scene-data-server.js` : chaque sauvegarde réussie (`/create-scene`, `/update-scene`) ajoute
  une entrée d'historique. Nouvelles routes : `GET /scene-history?sceneId=X` (liste des versions),
  `POST /restore-scene` (`{ sceneId, timestamp }`, réécrit la scène active avec le contenu de cette
  version). **Révisé (owner, 2026-07-05)** : la restauration N'ajoute PAS d'entrée d'historique —
  restaurer plusieurs fois de suite en cherchant la bonne version ne doit pas polluer la liste de
  doublons pile au moment où on essaie d'y voir clair. Décision initiale ("pas de cas spécial")
  abandonnée après retour d'usage réel.
- `dev/placement-panel.html` :
  - Retrait de tous les boutons "Enregistrer" — chaque modification de champ sauvegarde au `change`
    (perte de focus / validation), pas à chaque frappe (`input` reste pour le retour visuel
    immédiat dans le formulaire, sans déclencher de sauvegarde réseau).
  - Retrait des `window.confirm()` sur retrait de couche/composant (session précédente) — l'historique
    remplace la confirmation comme filet de sécurité pour ces actions courantes et réversibles.
  - Nouvelle section "Historique" par scène : liste des versions (date/heure formatées), bouton
    "Restaurer" par entrée.
  - `broadcastReload()` (déjà câblé, session précédente) continue de déclencher le rechargement de
    l'overlay après restauration comme après toute autre sauvegarde.
- **Extension (owner, 2026-07-05)** : `dev/scene-history-store.js` extrait la lecture/écriture de
  l'historique (déjà utilisées par `scene-data-server.js`) dans un module partagé, importé aussi par
  `dev/placement-server.js` — un déplacement de couche (drag & drop) ajoute désormais une entrée
  d'historique au même titre qu'une modification de composition. Comble le trou initialement
  documenté ("l'historique ne couvre que scene-data-server.js").
- **Extension (owner, 2026-07-06)** : correction d'une race condition découverte en vérification
  visuelle (voir §Concurrence d'accès) — `dev/placement-server.js` (port 4459) et
  `dev/scene-data-server.js` (port 4460) sont deux process Bun distincts qui écrivaient tous les deux
  directement `scenes/data/.history/<id>.json`, sans coordination. Effet observé : un
  `GET /scene-history` concurrent d'une écriture pouvait lire le fichier à moitié écrit
  (`SyntaxError: Unexpected end of JSON input`, 500 non géré) ; pire, deux écritures concurrentes
  (lecture de N entrées par les deux process avant que l'un des deux n'écrive) pouvaient se
  substituer l'une à l'autre et perdre silencieusement une entrée d'historique.

**Exclu :**
- Diff visuel entre deux versions (afficher *quoi* a changé) — la liste montre seulement date/heure,
  pas de comparaison. Pas demandé, coût d'implémentation nettement plus élevé (rendu de diff sur des
  structures imbriquées).
- Historique au niveau composant individuel (voir "quelles options ont changé sur CE composant") —
  l'historique est au niveau de la scène entière, pas plus fin.
- Confirmation conservée sur **suppression de scène entière** (`/delete-scene`) — action plus rare et
  plus lourde que retirer une couche/un composant, la friction existante (session 6/6) est gardée
  telle quelle, pas remplacée par l'historique ici.
- Purge/compaction manuelle de l'historique (bouton "vider l'historique") — pas de besoin concret
  exprimé, zero preemptive code.

## Concurrence d'accès (owner, 2026-07-06)

**Constat initial** : un `GET /scene-history` concurrent d'un `/update-scene` sur la même scène
provoquait une race entre deux process Bun distincts (`placement-server.js` et
`scene-data-server.js`) écrivant/lisant le même fichier `scenes/data/.history/<id>.json` sans
coordination (`SyntaxError: Unexpected end of JSON input`, 500 non géré, et pire, perte silencieuse
d'entrée d'historique possible). Rejeté volontairement : try/catch autour du parse JSON, ou
écriture atomique isolée (temp + rename) sans toucher au reste — ces deux options auraient
supprimé le symptôme visible sans supprimer la perte silencieuse sous écritures concurrentes.

**Revue d'architecture étendue** (owner, 2026-07-06, suite à un test de charge en vérification
visuelle) : le même défaut — read-modify-write non sérialisé sur un fichier partagé — existait
aussi sur `scenes/data/<id>.scene.json` lui-même, dans `dev/placement-server.js` (10 requêtes
`/save-placement` concurrentes reproduisent la même `SyntaxError`), et de façon latente dans
`dev/tuner-server.js` (`components/DotGridAnimated.js`, jamais déclenché mais même motif). Le
correctif retenu traite la classe de bug entière, pas seulement l'occurrence initialement
rapportée :

- **`dev/scene-data-server.js` devient l'unique propriétaire de `scenes/data/<id>.scene.json` ET de
  son historique.** `dev/placement-server.js` n'écrit plus aucun fichier lui-même — il devient un
  pur proxy HTTP : `POST /save-placement` reçu est relayé tel quel vers
  `POST http://localhost:4460/save-placement`, qui lit, applique le placement
  (`applyPlacementToLayer`), écrit le fichier de scène ET ajoute l'entrée d'historique dans une
  seule opération sérialisée. Remplace l'idée intermédiaire d'un endpoint dédié
  `/append-scene-history` (écarté : aurait laissé deux endpoints faire deux appels réseau non
  atomiques entre eux, pour un seul et même changement logique).
- **Sérialisation** : `dev/keyed-lock.js` (nouveau module, extrait après 3 occurrences
  indépendantes du même motif — manifest, historique, fichier de scène/tuner) expose
  `createKeyedLock()`, une file d'attente par clé (`Map<string, Promise<unknown>>`) : toute
  opération sur une même ressource s'enchaîne sur la précédente au lieu de s'exécuter en parallèle,
  même au sein d'un seul process (un `await` peut être interléavé par une autre requête sur la
  même ressource).
  - `scene-data-server.js` : une clé unique (`'scene-data'`) sérialise `manifest.json` ET tout
    fichier `scenes/data/<id>.scene.json` — `/create-scene`, `/update-scene`, `/delete-scene`,
    `/restore-archived-scene` (déjà protégés via `withManifestLock`), étendu à `/restore-scene`
    (pas protégé jusqu'ici — race non observée en usage réel, trouvée en revue) et au nouveau
    `/save-placement`. Clé unique plutôt qu'une clé par scène : simplicité délibérée pour un outil
    de dev mono-utilisateur, le débit n'est jamais un problème ici.
  - `scene-history-store.js` : une clé par `sceneId` (`withHistoryLock`), inchangé dans son
    principe, réimplémenté sur `createKeyedLock()`.
  - `tuner-server.js` : une clé unique (`'dotgrid-source'`) autour de son
    lecture-modification-écriture de `components/DotGridAnimated.js`.
- **Durabilité** (défense en profondeur, pas un substitut à la sérialisation) :
  `writeSceneHistory` écrit via fichier temporaire + rename plutôt que d'écraser le fichier cible
  directement — protège contre un crash du process en plein milieu de l'écriture.
- Si `placement-server.js` ne peut pas joindre `scene-data-server.js` (process non démarré, port
  fermé) : `/save-placement` répond 502 avec un message explicite — plus de sauvegarde locale de
  secours (l'ancienne idée de `historyWarning` est abandonnée : elle aurait réintroduit exactement
  la race qu'on élimine, en écrivant le fichier de scène depuis deux endroits différents).

## Acceptance Criteria

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-01 | `pushHistoryEntry(history, entry)` (logique pure) conserve toujours `history[0]` (origine) et limite le reste à 100 entrées (fenêtre glissante) | test |
| AC-02 | `pushHistoryEntry([], entry)` sur un historique vide retourne `[entry]` (la toute première sauvegarde devient l'origine) | test |
| AC-03 | `/create-scene` initialise `scenes/data/.history/<id>.json` avec une seule entrée (la config créée) | test |
| AC-04 | `/update-scene` réussi ajoute une entrée d'historique après écriture de la scène active | test |
| AC-05 | `GET /scene-history?sceneId=X` retourne le tableau de versions pour une scène existante, `[]` pour une scène sans historique (jamais 404/erreur) | test |
| AC-06 | `POST /restore-scene` réécrit la scène active avec le contenu de la version demandée (par `timestamp`), valide avec `validateSceneConfig` avant d'écrire | test |
| AC-07 | `POST /restore-scene` n'ajoute PAS d'entrée d'historique (révisé 2026-07-05) — l'historique de la scène est inchangé après une restauration | test |
| AC-08 | `POST /restore-scene` avec un `timestamp` introuvable dans l'historique de la scène → 404, aucune écriture | test |
| AC-09 | Le panneau n'affiche plus aucun bouton "Enregistrer" — chaque champ sauvegarde au `change` | visuel |
| AC-10 | Retirer une couche/un composant ne demande plus de confirmation — sauvegarde immédiate + entrée d'historique | visuel |
| AC-11 | La section "Historique" liste les versions d'une scène avec date/heure lisible, bouton "Restaurer" par entrée qui recharge l'overlay (broadcastReload) | visuel |
| AC-12 | `dev/placement-server.js` `/save-placement` réussi ajoute une entrée à l'historique de la scène (même fichier, même fenêtre glissante que `scene-data-server.js`) | test |
| AC-13 | Une entrée d'historique créée par `/save-placement` est listée par `GET /scene-history` au même titre qu'une entrée créée par `/update-scene` — un seul historique par scène, pas deux séparés | test |
| AC-14 | Deux appels concurrents (`Promise.all`) qui ajoutent chacun une entrée d'historique sur le même `sceneId` aboutissent à un historique contenant les DEUX entrées (aucune perte), quel que soit l'ordre d'arrivée | test |
| AC-15 | Un `GET /scene-history` déclenché pendant qu'une écriture est en cours sur le même `sceneId` attend la fin de l'écriture et retourne un JSON valide (jamais `SyntaxError`/500) | test |
| AC-16 | `dev/placement-server.js` ne contient plus aucune écriture disque directe (ni `scenes/data/*.scene.json`, ni son historique) — `/save-placement` est relayé tel quel vers `scene-data-server.js` | test |
| AC-17 | Dix appels concurrents (`Promise.all`) à `POST /save-placement` (serveurs réels lancés) sur le même `sceneId` aboutissent à un fichier de scène valide, aucune `SyntaxError` | manuel (test de charge, reproductible via `Promise.all` de 10 `fetch` dans la console) |
| AC-18 | `POST /restore-scene` concurrent d'un `POST /update-scene` sur le même `sceneId` ne produit jamais de fichier corrompu (JSON invalide) | manuel (même protocole qu'AC-17, appliqué à ces deux routes) |

> Règle : chaque AC est vérifiable de façon autonome. "Fonctionne correctement" n'est pas un AC.

## Format de données

```js
// scenes/data/.history/discussion.json
[
  { "timestamp": 1751702400000, "sceneConfig": { "id": "discussion", "...": "..." } },
  { "timestamp": 1751702415000, "sceneConfig": { "id": "discussion", "...": "..." } }
]
```

## Comportements

### Cas nominaux
1. Créer une scène → `.history/<id>.json` initialisé avec une entrée (l'origine).
2. Modifier un champ, ajouter/retirer un composant/une couche → sauvegarde immédiate, nouvelle
   entrée d'historique poussée (fenêtre glissante au-delà de l'origine + 100).
3. Ouvrir la section Historique d'une scène → liste des versions, cliquer "Restaurer" sur une
   entrée → la scène active devient cette version (l'historique n'est PAS modifié, révisé 2026-07-05),
   l'overlay se recharge automatiquement (déjà câblé).

### Cas d'erreur
- `GET /scene-history` sur une scène sans fichier d'historique → `[]`, jamais une erreur (scène
  statique jamais éditée depuis l'activation de ce mécanisme, ou fichier absent pour toute autre
  raison — dégradation cohérente avec `loadDynamicScenes`, AD-1).
- `POST /restore-scene` avec un `sceneId`/`timestamp` invalide ou introuvable → 404, message clair,
  aucune écriture.
- `placement-server.js` ne parvient pas à joindre `scene-data-server.js` (process non démarré, port
  fermé) → `POST /save-placement` répond 502 avec un message explicite, aucune écriture (plus de
  sauvegarde locale de secours, voir §Concurrence d'accès).

### Edge cases
- Scène supprimée (`/delete-scene`) : son fichier d'historique n'est **pas** supprimé (récupérable
  même après suppression/archivage de la scène elle-même) — cohérent avec l'archivage déjà en place.
- Recréer une scène avec un id déjà utilisé par le passé (scène supprimée puis recréée) : `/create-scene`
  écrase l'ancien historique par un nouveau (une seule entrée, l'origine) — traité comme une scène
  entièrement nouvelle, pas une continuation.

## Fichiers

| Fichier | Action | Notes |
|---|---|---|
| `dev/scene-data-format.js` | modifier | `pushHistoryEntry` (AC-01, AC-02) |
| `dev/scene-data-format.test.js` | modifier | tests AC-01, AC-02 |
| `dev/keyed-lock.js` | créer | `createKeyedLock()`, sérialisation générique par clé — extrait après 3 occurrences (manifest, historique, fichier de scène) |
| `dev/scene-history-store.js` | modifier | lecture/écriture disque de l'historique (AC-12, AC-13) ; sérialisation par `sceneId` via `createKeyedLock()` (AC-14, AC-15), écriture temp+rename |
| `dev/scene-history-store.test.js` | créer | tests AC-14, AC-15 (écritures concurrentes, lecture pendant écriture) |
| `dev/scene-data-server.js` | modifier | historique sur create/update, routes `/scene-history`, `/restore-scene` (AC-03 à AC-08) ; unique écrivain de `scenes/data/<id>.scene.json` via nouvelle route `POST /save-placement` (AC-16, AC-17) ; `/restore-scene` sérialisé (AC-18) |
| `dev/placement-server.js` | modifier | devient un pur proxy HTTP vers `scene-data-server.js` — plus aucune écriture disque directe (AC-16) |
| `dev/tuner-server.js` | modifier | sérialise son read-modify-write de `components/DotGridAnimated.js` via `createKeyedLock()` (même motif, latent, trouvé en revue) |
| `dev/placement-panel.html` | modifier | retrait boutons/confirmations, section Historique (AC-09 à AC-11) |

> Règle de cross-check (avant de déclarer "done") :
> - Chaque AC → implémenté et vérifiable
> - Chaque type défini → utilisé par au moins un fichier listé
> - Chaque fichier listé → existe ou est créé dans cette session

## Lacunes identifiées

- [ ] LAC-01 — Pas de diff visuel entre versions, juste un horodatage. Si le nombre de versions par
      scène devient grand en pratique, retrouver LA bonne version à restaurer par simple date/heure
      peut devenir difficile — pas anticipé maintenant (pas de besoin concret exprimé).
