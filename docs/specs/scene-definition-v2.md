---
feature: scene-definition-v2
created: 2026-07-04
updated: 2026-07-04
status: draft
---

<!-- Session 4/6 (persistance) ajoutée le 2026-07-04 — voir §Session 4/6 en fin de document. -->

# Spec : scene-definition-v2 (S8 — moteur de scène dynamique, 6 sessions)

## Contexte

Jalon 2 de l'éditeur (`docs/inbox.md`) : l'owner veut composer/modifier les composants de chaque
scène et créer/modifier/supprimer des scènes entières, **à la manière de Figma** — une collection de
composants qu'on ajoute/positionne/retire individuellement, pas des blocs de CSS/HTML bespoke par
scène.

L'architecture actuelle ne le permet pas :
- `SceneId` est un type fermé (union figée dans `types.js`, `SCENE_IDS` dans `protocol.js`) —
  ajouter une scène demande d'éditer du code, pas d'écrire une donnée.
- Le contenu visuel de chaque scène vit dans des `<template data-scene="X">` statiques +
  ~20 classes CSS bespoke par scène (`.disc-cam`, `.brb-tag`, `.int-fiche`…) — pas des instances
  d'une bibliothèque de composants réutilisable.
- Le binding aux données live (`state.subjectLine` → texte affiché) est écrit à la main dans 9
  fichiers `*.wire.js` — pas déclaratif, un éditeur ne peut pas le générer/modifier.
- S7 a posé `Placement` **par couche** (toute la couche bouge comme un bloc) — insuffisant pour le
  modèle Figma où chaque élément est indépendamment positionnable.

Cette spec **étend** `SceneConfig`/`LayerConfig`/`ComponentMount` (pas de type parallèle à faire
cohabiter puis retirer — même pattern additif et rétrocompatible que `Placement` en S7) et pose le
contrat de binding déclaratif. Elle ne migre pas encore les 9 scènes (session 3/6) ni ne construit
le moteur runtime (session 2/6) — format et contrat seulement, base pour tout le reste.

**Correction de cap (session 2/6) :** le plan initial envisageait un nouveau type `SceneDefinition`
séparé de `SceneConfig`, avec une session "cutover" pour retirer l'ancien système (plan initial à
7 sessions). En y regardant de plus près, ce n'est pas nécessaire — les extensions (placement par
composant, binding déclaratif, `SceneId` ouvert) s'ajoutent à `SceneConfig` existant sans rien
casser, exactement comme S7 a ajouté `placement` à `LayerConfig`. La session "cutover" est donc
retirée (plan à 6 sessions) — pas de double système, donc rien à retirer plus tard.
`SceneDefinition`/`LayerDefinition` ci-dessous doivent se lire comme `SceneConfig`/`LayerConfig`
étendus, pas de nouveaux types.

## Périmètre

**Inclus :**
- `SceneDefinition` : `SceneId` devient une chaîne ouverte (validée à l'existence dans le registre
  chargé, plus une union fermée compile-time).
- `Placement` déplacé du niveau **couche** (S7) au niveau **composant individuel** — chaque
  `ComponentMount` porte son propre `placement` optionnel. Modèle Figma : objets indépendamment
  positionnés, pas des blocs de couche.
- 4 nouveaux composants primitifs génériques, chacun justifié par des occurrences concrètes dans
  les 9 scènes existantes (zero preemptive code) :
  - `Box` — rectangle bordé (fond, bordure, radius) — remplace 9 occurrences du motif caméra/capture.
  - `Divider` — ligne fine (horizontale ou verticale) — remplace ~10 occurrences de séparateurs.
  - `TextLabel` — texte stylé (famille, taille, couleur, poids) — remplace les titres/labels/valeurs
    statiques actuellement en dur dans le HTML des templates.
  - `TextList` — liste de lignes de texte (remplace le rendu manuel dupliqué dans `fin.wire.js` pour
    `recapLines` et `socialLinks`, et dans `starting.wire.js` pour `socialLinks` — 3 occurrences,
    règle des trois satisfaite).
  - `PollBar` — question + barre de progression + ratio (remplace le HTML en dur du vote chat dans
    le template `jeu`, 1 occurrence concrète).
  - `Badge` — pastille courte (texte + fond coloré, ex : "+follow", "LIVE") — pas d'occurrence dans
    le CSS actuel, mais demande explicite de l'owner (2026-07-04) : la bibliothèque doit le
    proposer, premier usage réel viendra de l'éditeur une fois construit.
  - `Image` — logo/icône chargé depuis un asset local (contrainte sécurité déjà actée,
    `docs/specs/scene-config-protocol.md` §Sécurité : assets locaux uniquement, jamais une URL
    externe arbitraire) — même statut que `Badge`, demande explicite sans occurrence actuelle.
- Composants **déjà existants**, réutilisés tels quels dans la nouvelle bibliothèque (aucun
  changement de leur code) : `GoldBar`, `StatBlock`, `ChatFeed`, `PomodoroBar`, `AlertBanner`.
- **`DotGridAnimated` rejoint le modèle de composant standard** : enregistré dans
  `component-registry.js` comme les autres (même contrat `{ el, update?, destroy? }`), monté par
  `scene-runtime.js` via le registry au lieu d'un import direct spécial. Comportement inchangé
  (**toujours une seule instance permanente dans `#bg-layer`**) — pas de système multi-animations,
  ce serait prématuré tant qu'une seule animation de fond existe (garde-fou déjà posé dans
  `docs/overview.md` §Couche de fond DotGrid). Le seul changement : DotGrid devient visible/gérable
  par le même mécanisme que le reste, préparant le terrain pour que le futur panneau l'affiche sans
  cas spécial.
- Contrat de binding déclaratif : les `options` d'un `ComponentMount` peuvent contenir
  `{ $bind: 'state.path' }` au lieu d'une valeur littérale. Résolu au montage et à chaque changement
  d'état (réutilise le contrat existant `{ el, update?, destroy? }` de `components/index.js` — tout
  composant qui définit `update()` peut recevoir des options liées).
- Déclencheurs pour comportements non-continus (alertes, minuteurs) : `{ trigger: 'method-name',
  when: 'state.path' }` — appelle `instance[method](state[path])` quand `state[path]` change
  (généralise le pattern déjà utilisé à la main pour `AlertBanner.show()`).

**Exclu (sessions futures — 6 restantes, la session "cutover" a été retirée, voir §Correction de cap) :**
- Moteur runtime qui consomme le format étendu (session 2/6).
- Migration des 9 scènes existantes — bespoke CSS/HTML → composants + binding déclaratif
  (session 3/6). Le `<template data-scene>` reste nécessaire tant qu'une scène a des couches non
  génériques ; les scènes entièrement composées de `ComponentMount` n'en ont plus besoin
  (`scene-runtime.js` peut synthétiser les `<div data-layer>` manquants).
- Persistance (créer/modifier/supprimer une scène = écrire/lire la donnée) (session 4/6).
- UI de composition (cocher/ajouter un composant par couche, formulaires dédiés par type)
  (session 5/6).
- UI de création/suppression de scène avec confirmation + archivage (session 6/6).
- Liste avec template par item personnalisable (`TextList` V1 = une ligne = un `<div>` avec une
  classe de style fixe, pas de template arbitraire par item — les 3 cas concrets actuels n'en ont
  pas besoin).

## Acceptance Criteria

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-01 | `SceneDefinition.id` accepte n'importe quelle chaîne non-vide (plus de liste fermée compile-time) | test |
| AC-02 | `ComponentMount.placement` optionnel, même format que `Placement` (S7) : `{x, y, width?, height?}` | test |
| AC-03 | `resolveBoundValue(value, state)` retourne `state[path]` si `value` est `{ $bind: path }`, sinon retourne `value` tel quel (littéral) | test |
| AC-04 | `resolveBoundValue` supporte les chemins imbriqués (`sessionStats.maxViewers`) | test |
| AC-05 | `resolveBoundOptions(options, state)` résout récursivement chaque clé d'un objet `options` | test |
| AC-06 | `Box` accepte `{ borderRadius?, borderColor?, background? }`, retourne `{ el }` (statique, pas d'`update` — pas de cas d'usage lié aux données aujourd'hui) | visuel |
| AC-07 | `Divider` accepte `{ orientation: 'horizontal'\|'vertical', thickness?, color? }`, retourne `{ el }` | visuel |
| AC-08 | `TextLabel` accepte `{ text, font?, size?, color?, weight? }`, retourne `{ el, update({text}) }` | visuel |
| AC-09 | `TextList` accepte `{ lines: string[], itemClass? }`, retourne `{ el, update(lines) }` — un `<div>` par ligne, la 1ère avec une classe pleine opacité, les suivantes `.dim` (comportement identique à `fin.wire.js`/`starting.wire.js` actuels) | visuel |
| AC-10 | `validateSceneDefinition` (remplace `validateSceneConfig`) rejette un `id` vide ou non-string ; accepte toute chaîne non-vide sinon | test |
| AC-11 | `PollBar` accepte `{ question, yesRatio }`, retourne `{ el, update({question, yesRatio}) }` — barre de progression reflète `yesRatio` (0-1), ratio affiché en % | visuel |
| AC-12 | `DotGridAnimated` enregistré dans `component-registry.js` sous un nom de composant (ex. `DotGridBackground`) ; `scene-runtime.js` le monte via le registry, comportement (instance unique, `#bg-layer`, `setMode`) identique à avant | review + visuel |
| AC-13 | `Badge` accepte `{ text, color? }`, retourne `{ el, update({text, color}) }` | visuel |
| AC-14 | `Image` rejette une `src` en URL absolue (`http(s)://`) — vérifiable sans DOM (throw testable) ; le rendu de l'`<img>` lui-même reste visuel | test (rejet) + visuel (rendu) |

> Règle : chaque AC est vérifiable de façon autonome. "Fonctionne correctement" n'est pas un AC.

## Types JSDoc

```js
/**
 * Identifiant de scène — chaîne ouverte (S8), plus une union fermée (ancien SceneId, S2-S7).
 * Validé à l'existence dans le registre chargé au runtime, pas au niveau du type.
 * @typedef {string} SceneId
 */

/**
 * @typedef {Object} ComponentMount
 * @property {string} component - Nom résolu par le registry
 * @property {Record<string, unknown>} options - Valeurs littérales OU `{ $bind: string }`
 * @property {import('./types.js').Placement} [placement] - Position individuelle (Figma-style)
 * @property {{ method: string, when: string }} [trigger] - Déclencheur impératif (ex: AlertBanner.show)
 */

/**
 * @typedef {Object} SceneDefinition
 * @property {SceneId} id
 * @property {DotGridMode} dotgridMode
 * @property {SceneTransition} transition
 * @property {LayerDefinition[]} layers
 */

/**
 * @typedef {Object} LayerDefinition
 * @property {string} name
 * @property {LayerVisibility} visibility
 * @property {ComponentMount[]} components
 */
```

## Format de données

```js
// Exemple : couche 'cam' de la scène discussion, format v2
{
  name: 'cam',
  visibility: { full: true, minimal: false, hidden: false },
  components: [
    {
      component: 'Box',
      options: { borderRadius: 'var(--radius-md)', borderColor: 'var(--border-panel)', background: 'var(--color-bg-panel)' },
      placement: { x: 40, y: 40, width: 1080, height: 960 },
    },
  ],
}

// Exemple : texte lié à l'état (remplace le textContent manuel de discussion.wire.js)
{
  component: 'TextLabel',
  options: { text: { $bind: 'subjectLine' }, font: 'serif', size: '38px' },
  placement: { x: 1188, y: 120, width: 692 },
}

// Exemple : liste liée (remplace le forEach manuel de fin.wire.js)
{
  component: 'TextList',
  options: { lines: { $bind: 'recapLines' } },
  placement: { x: 920, y: 400, width: 960 },
}
```

```js
// placement-resolve.js (S7) réutilisé tel quel pour le placement par composant — aucun changement.

// scene-definition-resolve.js — nouvelle logique pure (S8)
/**
 * @param {unknown} value
 * @param {import('./types.js').StreamState} state
 * @returns {unknown}
 */
export function resolveBoundValue(value, state) {
  if (typeof value === 'object' && value !== null && '$bind' in value) {
    return getByPath(state, /** @type {{$bind: string}} */ (value).$bind);
  }
  return value;
}

/**
 * @param {Record<string, unknown>} options
 * @param {import('./types.js').StreamState} state
 * @returns {Record<string, unknown>}
 */
export function resolveBoundOptions(options, state) {
  /** @type {Record<string, unknown>} */
  const resolved = {};
  for (const [key, value] of Object.entries(options)) resolved[key] = resolveBoundValue(value, state);
  return resolved;
}
```

## Comportements

### Cas nominaux

1. Au montage d'un `ComponentMount` : résoudre `options` via `resolveBoundOptions`, appeler la
   factory du registry avec les valeurs résolues (littérales), appliquer `placement` si présent
   (réutilise `resolvePlacementStyle`, S7).
2. À chaque changement d'état (`onStateChange`) : pour chaque `ComponentMount` monté dont au moins
   une clé d'`options` est un `{ $bind }`, re-résoudre `options` et appeler `instance.update?.(resolved)`
   si l'instance définit `update`.
3. Pour un `ComponentMount` avec `trigger` : à chaque changement d'état, comparer `state[when]` à sa
   valeur précédente (référence ou deep-equal simple selon le type) ; si changé, appeler
   `instance[trigger.method](state[when])`.

### Cas d'erreur

- `$bind` pointant vers un chemin qui n'existe pas dans `state` → `resolveByPath` retourne
  `undefined` (pas de throw) ; le composant reçoit `undefined`, comportement délégué au composant
  (ex : `TextLabel` afficherait une chaîne vide) — pas une erreur de validation, juste une donnée
  manquante, cohérent avec le principe existant "jamais de crash silencieux mais jamais de throw
  sur donnée manquante" (AD-1).
- `component` inconnu du registry → même traitement que l'existant (`console.warn`, composant ignoré).
- `id` de scène vide/non-string → rejeté par `validateSceneDefinition`.

### Edge cases

- `ComponentMount` sans `placement` → pas de style de position appliqué, le composant garde son
  positionnement naturel dans le flux du DOM (utile pour des composants qui ne doivent pas être
  positionnés absolument, ex : à l'intérieur d'un `TextList`).
- Deux composants avec le même `placement` (se chevauchent) → comportement normal du CSS
  (empilement selon l'ordre du DOM), pas un cas d'erreur.

## Fichiers

| Fichier | Action | Notes |
|---|---|---|
| `types.js` | modifier | `SceneId` → `string`, `ComponentMount.placement`/`trigger`, `SceneDefinition`, `LayerDefinition` |
| `scene-definition-resolve.js` | créer | `resolveBoundValue`, `resolveBoundOptions` — logique pure, testée |
| `scene-definition-resolve.test.js` | créer | Tests AC-03 à AC-05 |
| `components/index.js` | modifier | Ajouter `Box`, `Divider`, `TextLabel`, `TextList`, `PollBar`, `Badge`, `Image` — AC-06 à AC-09, AC-11, AC-13, AC-14. Bun n'a pas de DOM en environnement de test (`document` indéfini) — comme les composants existants, ces 7 sont vérifiés visuellement, pas par `bun test` (sauf le rejet d'URL externe d'`Image`, pure logique). |
| `component-registry.js` | modifier | Enregistrer les 7 nouveaux composants + `DotGridAnimated` — AC-12 |
| `scene-runtime.js` | modifier | Monter DotGrid via le registry au lieu d'un import direct — AC-12 |
| `protocol.js` | modifier | `validateSceneDefinition` (remplace/étend `validateSceneConfig`) — AC-01, AC-10 |
| `protocol.test.js` | modifier | Tests AC-01, AC-10 |

> Règle de cross-check (avant de déclarer "done") :
> - Chaque AC → implémenté et vérifiable
> - Chaque type défini → utilisé par au moins un fichier listé
> - Chaque fichier listé → existe ou est créé dans cette session

## Lacunes identifiées

- [ ] LAC-01 — `TextList` ne supporte qu'un rendu ligne = `<div>` avec classe fixe. Si un futur
      cas d'usage demande un template par item plus riche (ex : un item avec icône + texte), il
      faudra étendre `TextList` ou créer un composant dédié — pas anticipé maintenant (zero
      preemptive code, seulement 3 occurrences actuelles, toutes de simples lignes de texte).
- [ ] LAC-02 — Le mécanisme `trigger` (déclencheurs impératifs) n'est prouvé que sur le cas
      `AlertBanner.show()`. D'autres comportements impératifs complexes (ex : le minuteur
      d'affichage HUD de `jeu`, actuellement géré à la main dans `jeu.wire.js` avec
      `setTimeout`/`clearTimeout`) ne sont pas couverts par cette spec — migration tracée dans
      `docs/inbox.md`, décidée **après** la session 4/6 (owner, 2026-07-04), pas pendant.

---

## Session 4/6 — Persistance (2026-07-04)

### Contexte

Créer/modifier/supprimer une scène = écrire/lire une donnée, pas éditer du code (voir §Contexte
principal). Aujourd'hui `scenes/registry.js` importe chaque scène en dur (9 `import` statiques) —
ajouter une scène demande d'éditer ce fichier. Décision owner (2026-07-04, 3 options présentées) :
**format JSON dynamique** pour les scènes créées par l'éditeur, chargées au runtime via `fetch`,
en complément (pas en remplacement) des 9 scènes existantes qui restent des modules JS statiques
inchangés — aucune raison de les migrer, elles ne passent pas par l'éditeur avant la session 5/6.

Le `wire.js` optionnel (déjà livré, voir `scene-runtime.js` §Binding déclaratif) rend ceci possible
sans aucune extension : une scène JSON n'a jamais de `*.wire.js`, elle est montée et pilotée
entièrement par `applyBindings` (`$bind`/`trigger`).

### Périmètre

**Inclus :**
- `scenes/registry.js` : nouvelle fonction `loadDynamicScenes()` — charge `scenes/data/manifest.json`
  (liste d'ids), fetch chaque `scenes/data/<id>.scene.json`, fusionne dans `SCENE_CONFIGS` (aucun
  wire associé, cohérent avec le mécanisme existant). Manifeste absent/vide → aucune scène
  dynamique, pas d'erreur (dégradation identique au reste du projet, AD-1).
- `scene-runtime.js` : `init()` devient async, `await loadDynamicScenes()` avant le montage initial —
  seul changement de flux ; le montage lui-même (`mountScene`) est inchangé, une scène dynamique
  suit exactement le même chemin qu'une scène statique.
- `dev/scene-data-server.js` (dev-only, jamais en live, même avertissement que `placement-server.js`) :
  3 routes qui écrivent `scenes/data/*.scene.json` + `manifest.json`.
- `dev/scene-data-format.js` : logique pure de manipulation du manifeste (ajout/retrait d'un id),
  testée — même séparation logique/effets que `scene-placement-format.js` (S7).
- `scenes/data/manifest.json` : committé, `[]` initial.

**Exclu (sessions suivantes) :**
- UI de composition/édition (session 5/6) — cette session ne livre que la couche de données,
  aucun panneau ne l'utilise encore. Vérifiable uniquement via appels HTTP directs (`curl`/script) +
  `bun test`, pas visuellement (rien à voir tant que l'UI n'existe pas).
- UI de création/suppression de scène avec confirmation (session 6/6).
- Migration des 9 scènes existantes vers le format JSON (non demandée, non nécessaire — elles ne
  passent pas par l'éditeur avant S5/S6, aucune valeur à les migrer maintenant, zero preemptive code).
- Verrouillage concurrent (deux sauvegardes simultanées) — même risque accepté que
  `placement-server.js`/`tuner-server.js` (outil de dev local, un seul utilisateur).

### Acceptance Criteria

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-15 | `loadDynamicScenes()` fusionne chaque scène du manifeste dans `SCENE_CONFIGS`, indexée par son `id` | test |
| AC-16 | `loadDynamicScenes()` face à un manifeste absent (404) ou vide (`[]`) : résout sans erreur, `SCENE_CONFIGS` inchangé | test |
| AC-17 | `scene-runtime.js` attend `loadDynamicScenes()` avant de monter la scène initiale (`store.currentScene`) — une scène dynamique est montable dès le premier rendu | review |
| AC-18 | `POST /create-scene` rejette (400) une `sceneConfig` qui échoue `validateSceneConfig`, erreurs renvoyées telles quelles | test |
| AC-19 | `POST /create-scene` rejette (409) un `id` déjà présent dans `manifest.json` OU dans la liste des 9 ids statiques (`discussion`, `brb`, `codage`, `jeu`, `interview`, `react`, `creation`, `fin`, `starting`) | test |
| AC-20 | `POST /create-scene` valide écrit `scenes/data/<id>.scene.json` (JSON formaté) et ajoute `id` à `manifest.json` | test |
| AC-21 | `POST /update-scene` rejette (404) un `id` absent de `manifest.json` — impossible de modifier une scène statique ou inexistante par cette route | test |
| AC-22 | `POST /update-scene` valide réutilise la même validation qu'AC-18 avant d'écraser le fichier | test |
| AC-23 | `POST /delete-scene` rejette (404) un `id` absent de `manifest.json` | test |
| AC-24 | `POST /delete-scene` valide supprime `scenes/data/<id>.scene.json` et retire `id` de `manifest.json` | test |
| AC-25 | `addSceneToManifest(manifest, id)` / `removeSceneFromManifest(manifest, id)` : logique pure, pas de doublon à l'ajout, retrait d'un id absent = no-op (jamais de throw) | test |

### Format de données

```js
// scenes/data/manifest.json — liste des ids de scènes créées par l'éditeur
["ma-scene-perso"]

// scenes/data/ma-scene-perso.scene.json — SceneConfig sérialisé tel quel (déjà 100% JSON-compatible,
// $bind/trigger sont des objets littéraux, aucune fonction à sérialiser)
{
  "id": "ma-scene-perso",
  "dotgridMode": "discussion",
  "transition": { "type": "crossfade", "duration": 400, "easing": "easeInOut" },
  "layers": [
    {
      "name": "goldbar",
      "visibility": { "full": true, "minimal": true, "hidden": true },
      "components": [{ "component": "GoldBar", "options": {} }]
    }
  ]
}
```

### Comportements

**Cas nominaux**
1. Au chargement de la page : `scene-runtime.js` appelle `await loadDynamicScenes()` avant tout
   montage. `SCENE_CONFIGS` contient alors les 9 scènes statiques + toute scène du manifeste.
2. Créer une scène : POST `/create-scene` avec une `SceneConfig` complète → validée → écrite →
   visible au prochain rechargement de la page (pas de hot-reload dans cette session, cohérent avec
   `placement-server.js`/`tuner-server.js` qui rechargent déjà la page via leur WS `reload-ws` —
   réutilisable telle quelle si besoin, pas reconstruite ici).
3. Modifier/supprimer : mêmes garanties (validation, existence dans le manifeste), symétriques.

**Cas d'erreur**
- `sceneConfig` invalide → 400, `errors` de `validateSceneConfig` renvoyés tels quels (même pattern
  que `placement-server.js`).
- `id` déjà pris (création) ou absent (modification/suppression) → 409/404, aucune écriture.
- Écriture disque échoue (permissions, disque plein) → 500, message d'erreur renvoyé, log serveur —
  même traitement que `placement-server.js` (`catch` → `console.error` + réponse 500).

**Edge cases**
- Supprimer une scène actuellement active dans OBS/l'overlay live : le serveur de données n'a aucune
  visibilité sur l'état live (process séparé). Un `scene.set` ultérieur vers l'id supprimé retombe
  sur le chemin déjà existant `mountScene` → "scène inconnue" (`console.warn`, scène courante
  inchangée) — pas un nouveau cas à construire.
- Manifeste corrompu (JSON invalide) : `loadDynamicScenes()` catch l'erreur de parsing, log un
  avertissement, traite comme un manifeste vide plutôt que de bloquer le montage de toute la page
  (une scène dynamique cassée ne doit jamais empêcher les 9 scènes statiques de fonctionner).

### Fichiers

| Fichier | Action | Notes |
|---|---|---|
| `scenes/registry.js` | modifier | + `loadDynamicScenes()` (AC-15, AC-16) |
| `scene-runtime.js` | modifier | `init()` async, `await loadDynamicScenes()` (AC-17) |
| `scenes/data/manifest.json` | créer | `[]` initial, committé |
| `dev/scene-data-format.js` | créer | `addSceneToManifest`/`removeSceneFromManifest`, pur (AC-25) |
| `dev/scene-data-format.test.js` | créer | tests AC-25 |
| `dev/scene-data-server.js` | créer | 3 routes dev-only (AC-18 à AC-24) |

> Règle de cross-check (avant de déclarer "done") :
> - Chaque AC → implémenté et vérifiable
> - Chaque type défini → utilisé par au moins un fichier listé
> - Chaque fichier listé → existe ou est créé dans cette session

### Lacunes identifiées (session 4/6)

- [ ] LAC-03 — Pas de hot-reload automatique de l'overlay après création/modification/suppression
      d'une scène dans cette session (rechargement manuel de la page requis). `placement-server.js`
      et `tuner-server.js` ont déjà un mécanisme `reload-ws` réutilisable — décision différée : à
      brancher pendant la session 5/6 (UI) si le besoin se confirme, pas anticipé ici.
