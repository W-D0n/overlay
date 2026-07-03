---
feature: scene-placement-protocol
created: 2026-07-04
updated: 2026-07-04
status: reviewed
---

# Spec : scene-placement-protocol

## Contexte

AD-2 (S2) a mis le placement des scènes dans le CSS/HTML (`index.html`, sélecteurs
`.scene[data-scene="X"] .foo`), pas dans `SceneConfig` — décision zero-preemptive-code à l'époque,
aucun besoin concret de donnée de position. `docs/inbox.md` §Éditeur envisageait depuis le début un
jalon 1 "placement" (drag & drop, lecture des valeurs de position) mais supposait un système
`anchor`+`offset` jamais construit.

**Correction de cap (2026-07-04) :** `anchor`+`offset` (grille à 9 points) est écarté. Le canvas
overlay est **toujours** 1920×1080 fixe (contrainte projet, `docs/overview.md` §Contraintes) — un
ancrage n'apporte de valeur que pour du responsive (canvas qui change de taille), qui n'arrivera
jamais ici. Vérifié contre les 21 règles de positionnement existantes dans `index.html` : 100%
sont exprimables en coordonnées pixels absolues simples. Le modèle retenu est donc **`Placement`
en pixels absolus**, pas un système d'ancrage.

Cette spec définit le format de données `Placement` et son intégration dans `SceneConfig` /
`scene-runtime.js`. Elle ne construit **pas** le panneau drag & drop (session ultérieure, dépend de
cette spec) ni ne migre les 9 scènes existantes (session ultérieure, migration mécanique une fois
le runtime prouvé).

## Périmètre

**Inclus :**
- Typedef `Placement` (`x`, `y`, `width?`, `height?`, tous en pixels, relatifs au coin haut-gauche
  du canvas 1920×1080).
- Extension de `LayerConfig` avec un champ `placement` optionnel.
- Logique pure de résolution `Placement` → objet de style CSS (`placement-resolve.js`, testé).
- Extension de `scene-runtime.js` pour appliquer ce style en inline au montage d'une couche,
  **seulement si `placement` est présent** — sinon comportement inchangé (CSS scopé existant
  s'applique, migration peut être incrémentale scène par scène).
- Extension de `validateSceneConfig` (`protocol.js`) : valider `placement` si présent (nombres
  finis, `width`/`height` positifs si fournis).
- Preuve du modèle sur 2 scènes de référence (`discussion`, `jeu`) — pas les 9.

**Exclu (sessions futures) :**
- Migration des 7 scènes restantes vers `placement` (session mécanique séparée, une fois le modèle
  prouvé sur les 2 scènes de référence).
- Panneau drag & drop (`dev/placement-panel.html`) — lit/écrit `Placement`, dépend de cette spec.
- Persistance du panneau (écriture dans `scenes/*.config.js`) — généralisation du pattern
  `dev/tuner-server.js` (S5), session séparée après le panneau.

**Exclu de cette spec, mais confirmé comme besoin réel par l'owner (2026-07-04, tracé dans
`docs/inbox.md` §Extensions du système de placement) — à réintégrer dans une session future :**
- Redimensionnement par drag (le panneau V1 ne fait que déplacer, pas redimensionner — `width`/
  `height` restent fixés à la migration, pas éditables en live).
- Composition interne d'une couche à plusieurs éléments positionnés indépendamment (ex : `interview`
  couche `cams` contient 3 divs positionnés séparément) : `placement` s'applique à la couche
  **entière** comme un bloc, pas à ses enfants.
- Repositionnement dynamique en cours de scène (via événement, pas seulement au montage).

## Acceptance Criteria

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-01 | `Placement` accepte `x`, `y` (requis) + `width`, `height` (optionnels), tous des nombres finis | test |
| AC-02 | `resolvePlacementStyle(placement)` retourne `{ position: 'absolute', left: '${x}px', top: '${y}px' }` sans `width`/`height` si absents | test |
| AC-03 | `resolvePlacementStyle(placement)` inclut `width`/`height` en px si fournis | test |
| AC-04 | `validateSceneConfig` rejette un `placement` avec `x`/`y` non-finis (NaN, Infinity, string) | test |
| AC-05 | `validateSceneConfig` rejette un `placement` avec `width`/`height` négatif ou zéro si fourni | test |
| AC-06 | `validateSceneConfig` accepte un `LayerConfig` **sans** `placement` (rétrocompatibilité — 7 scènes non migrées) | test |
| AC-07 | Au montage, une couche avec `placement` reçoit un style inline (`element.style.cssText` ou propriétés individuelles) — le CSS scopé existant (`.scene[data-scene] .foo`) n'est pas supprimé mais l'inline prime (spécificité CSS) | review + visuel |
| AC-08 | Une couche **sans** `placement` n'est pas affectée — aucun style inline ajouté, comportement identique à avant cette session | test + visuel |
| AC-09 | Scènes `discussion` et `jeu` migrées en `placement`, rendu visuel identique à avant migration (vérifié en preview 1920×1080) | visuel |

> Règle : chaque AC est vérifiable de façon autonome. "Fonctionne correctement" n'est pas un AC.

## Types JSDoc

```js
/**
 * Position et taille d'une couche, en pixels absolus dans le canvas 1920×1080.
 * Pas de système d'ancrage — le canvas ne change jamais de taille (contrainte projet),
 * un ancrage n'apporterait aucune valeur fonctionnelle ici (voir §Contexte).
 * @typedef {Object} Placement
 * @property {number} x - Distance en pixels depuis le bord gauche du canvas
 * @property {number} y - Distance en pixels depuis le bord haut du canvas
 * @property {number} [width] - Largeur en pixels (omis = dicté par le contenu/CSS existant)
 * @property {number} [height] - Hauteur en pixels (omis = dicté par le contenu/CSS existant)
 */
```

`LayerConfig` étendu :

```js
/**
 * @typedef {Object} LayerConfig
 * @property {string} name
 * @property {ComponentMount[]} components
 * @property {LayerVisibility} visibility
 * @property {Placement} [placement] - Position/taille en pixels absolus (omis = CSS scopé existant fait foi)
 */
```

## Format de données

```js
// Exemple : scenes/discussion.config.js — couche 'cam' migrée
{
  name: 'cam',
  components: [],
  visibility: { full: true, minimal: false, hidden: false },
  placement: { x: 40, y: 40, width: 1080, height: 960 },
}
```

```js
// placement-resolve.js — résolution pure
/**
 * @param {import('./types.js').Placement} placement
 * @returns {Record<string, string>} propriétés de style CSS à appliquer en inline
 */
export function resolvePlacementStyle(placement) {
  const style = {
    position: 'absolute',
    left: `${placement.x}px`,
    top: `${placement.y}px`,
  };
  if (placement.width !== undefined)  style.width  = `${placement.width}px`;
  if (placement.height !== undefined) style.height = `${placement.height}px`;
  return style;
}
```

## Comportements

### Cas nominaux

1. `scene-runtime.js`, au montage d'une couche (`mountLayer` ou équivalent existant) : si
   `layer.placement` est défini, appeler `resolvePlacementStyle` et appliquer chaque propriété sur
   `layerEl.style`. Sinon, ne rien faire (chemin existant inchangé).
2. `validateSceneConfig` : pour chaque `LayerConfig`, si `placement` présent, valider `x`/`y`
   (nombres finis) et `width`/`height` (nombres finis strictement positifs si présents) —
   sinon ajouter une entrée à `errors` (même pattern que la validation existante des autres champs).

### Cas d'erreur

- `placement.x` ou `placement.y` = `NaN`/`Infinity`/`string` → `validateSceneConfig` rejette
  (config invalide, jamais chargée par le runtime — cohérent avec le filet existant AD-1/FRIC-S2-01).
- `placement.width`/`height` = `0` ou négatif → rejeté (une couche de taille nulle/négative n'a pas
  de sens visuel).
- `placement` absent → **pas une erreur**, comportement de repli (CSS scopé).

### Edge cases

- `placement` avec seulement `x`/`y` (pas de `width`/`height`) → la couche garde sa taille dictée
  par son contenu/CSS interne, seule la position change. Cas normal, pas un edge case dégradé.
- Couche avec `placement` **et** règles CSS scopées existantes pour la même couche (transition,
  migration partielle) → l'inline (spécificité CSS plus forte) prime, pas de conflit résolu
  manuellement nécessaire — comportement CSS standard.

## Contrat d'événements (si applicable)

Aucun — `placement` est appliqué une fois au montage, pas de CustomEvent dédié (pas de
repositionnement dynamique en cours de scène dans cette spec).

## Fichiers

| Fichier | Action | Notes |
|---|---|---|
| `types.js` | modifier | Ajouter `Placement`, étendre `LayerConfig` |
| `placement-resolve.js` | créer | `resolvePlacementStyle` — logique pure, testée |
| `placement-resolve.test.js` | créer | Tests AC-01 à AC-03 |
| `protocol.js` | modifier | Étendre `validateSceneConfig` — AC-04, AC-05, AC-06 |
| `protocol.test.js` | modifier | Tests AC-04 à AC-06 |
| `scene-runtime.js` | modifier | Appliquer le style au montage si `placement` présent — AC-07, AC-08 |
| `scenes/discussion.config.js` | modifier | Migrer les couches positionnées vers `placement` — AC-09 |
| `scenes/jeu.config.js` | modifier | Idem — AC-09 |
| `index.html` | modifier | Retirer les règles CSS de position devenues redondantes pour `discussion`/`jeu` uniquement (garder le reste : couleurs, bordures, typographie) |

> Règle de cross-check (avant de déclarer "done") :
> - Chaque AC → implémenté et vérifiable
> - Chaque type défini → utilisé par au moins un fichier listé
> - Chaque fichier listé → existe ou est créé dans cette session

## Lacunes identifiées

Aucune.
