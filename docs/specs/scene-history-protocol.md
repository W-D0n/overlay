---
feature: scene-history-protocol
created: 2026-07-05
updated: 2026-07-05
status: draft
---

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
| `dev/scene-data-server.js` | modifier | historique sur create/update, routes `/scene-history`, `/restore-scene` (AC-03 à AC-08) |
| `dev/placement-panel.html` | modifier | retrait boutons/confirmations, section Historique (AC-09 à AC-11) |

> Règle de cross-check (avant de déclarer "done") :
> - Chaque AC → implémenté et vérifiable
> - Chaque type défini → utilisé par au moins un fichier listé
> - Chaque fichier listé → existe ou est créé dans cette session

## Lacunes identifiées

- [ ] LAC-01 — Pas de diff visuel entre versions, juste un horodatage. Si le nombre de versions par
      scène devient grand en pratique, retrouver LA bonne version à restaurer par simple date/heure
      peut devenir difficile — pas anticipé maintenant (pas de besoin concret exprimé).
