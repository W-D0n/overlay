---
feature: scene-transition-library
created: 2026-07-06
updated: 2026-07-06
status: draft
---

# Spec : scene-transition-library (Track A de l'« Épopée »)

## Contexte

`docs/specs/scene-runtime-engine.md` (S3) a volontairement limité `TransitionType` à `crossfade`/`cut`
— ligne 90 : « Nouvelles valeurs de `TransitionType` au-delà de `crossfade`/`cut` → besoin concret
futur ». Ce besoin est maintenant exprimé par l'owner (2026-07-06) : il veut plusieurs transitions
différentes disponibles aux changements de scène — `slide`, `wipe`, et `morph` (qui anime enfin le
fond DotGrid via `morphTo()`, stub vide depuis sa création, jamais appelé).

Cette spec étend `scene-runtime-engine.md`, ne le remplace pas — `resolveTransition`/`crossfade`
existants restent inchangés pour `crossfade`/`cut`.

## Périmètre

**Inclus :**
- `TransitionType` étendu : `'crossfade' | 'cut' | 'slide' | 'wipe' | 'morph'`.
- `slide` : la scène sortante glisse hors champ (translateX) pendant que l'entrante glisse depuis le
  bord opposé. Direction fixe pour cette v1 (voir §Comportements) — pas de champ `direction`
  configurable tant qu'aucun besoin concret ne l'exige (zero preemptive code).
- `wipe` : révélation de la scène entrante via `clip-path` animé, balayage gauche→droite. Pas de
  barre/bord coloré séparé en v1 — juste la révélation (le moins qu'on puisse livrer qui corresponde
  à "wipe").
- `morph` : le fond DotGrid partagé (`#bg-layer`, un seul par process, pas par scène) transite
  visuellement entre les paramètres du mode sortant et ceux du mode entrant via `morphTo()`, au lieu
  du saut instantané actuel de `setMode()`. Le contenu de premier plan (scènes) suit un `crossfade`
  standard en parallèle — `morph` ne change QUE le comportement du fond, pas celui du contenu.
- Si `morph` est demandé mais qu'aucune des deux scènes (sortante/entrante) n'a de `dotgridMode`, ou
  que les deux ont le MÊME mode : dégrade proprement en `crossfade` simple (rien à animer côté fond).

**Exclu :**
- `direction` configurable pour `slide` — besoin non exprimé, ajouté plus tard si demandé.
- Couleur/style configurable pour `wipe` — idem.
- Transitions combinables (ex. slide + morph simultanés) — une seule transition à la fois, comme
  aujourd'hui.
- UI panneau pour choisir la transition par scène — Track A session 4 (après l'implémentation), pas
  cette session.

## Acceptance Criteria — Session A1 (cette session : spec uniquement)

Aucun code cette session — spec à valider avant A2 (implémentation `slide`/`wipe`) et A3
(implémentation `morph`, la plus incertaine techniquement).

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-01 | `resolveTransition` accepte les 5 valeurs de `TransitionType` (rejette toute autre valeur, comme aujourd'hui) | test |
| AC-02 | `slide` : scène entrante `translateX(100%) → 0`, sortante `translateX(0) → -100%`, sur `duration`ms avec `easing`, puis sortante démontée (même filet `transitionend`/timeout que `crossfade`) | visuel OBS |
| AC-03 | `wipe` : scène entrante révélée par `clip-path: inset(0 X% 0 0)` animé de `100%` à `0%`, sortante reste statique dessous (pas besoin de l'animer, elle est simplement recouverte puis démontée) | visuel OBS |
| AC-04 | `morph` avec deux modes DotGrid différents : le fond transite ses paramètres visuels sur `duration`ms (pas de saut brutal), le contenu de premier plan fait un `crossfade` standard en parallèle | visuel OBS |
| AC-05 | `morph` avec modes identiques ou l'un/les deux `null` : dégrade en `crossfade` simple, aucune erreur | test + visuel |
| AC-06 | Chaque nouveau type respecte le filet `transitionend` OU timeout déjà en place (`crossfade()`, scene-runtime.js) — jamais de scène sortante qui reste montée indéfiniment si l'événement CSS ne se déclenche pas | test/review |

## Types JSDoc

```js
// types.js — TransitionType étendu (remplace la ligne 117 actuelle)
/**
 * @typedef {'crossfade'|'cut'|'slide'|'wipe'|'morph'} TransitionType
 */
```

Aucun nouveau champ sur `SceneTransition` — `type`/`duration`/`easing` suffisent pour les 3 nouveaux
types (pas de `direction`/`color`, voir §Périmètre Exclu).

## Format de données

```js
// Exemple : scenes/data/discussion.scene.json — transition slide
{
  "id": "discussion",
  "transition": { "type": "slide", "duration": 500, "easing": "easeInOut" },
  "...": "..."
}

// Exemple : transition morph (dotgridMode différent de la scène précédente)
{
  "id": "codage",
  "dotgridMode": "codage",
  "transition": { "type": "morph", "duration": 800, "easing": "easeInOut" },
  "...": "..."
}
```

## Comportements

### Cas nominaux
1. `slide` — direction fixe v1 : l'entrante vient de la **droite**, la sortante part vers la
   **gauche** (mouvement "avance" cohérent quel que soit l'ordre des scènes — pas de notion
   d'ordre/index entre scènes à ce stade, juste une direction constante).
2. `wipe` — balayage **gauche → droite** (cohérent avec le sens de lecture, direction fixe v1).
3. `morph` — le fond DotGrid interpole ses paramètres (`freqX`, `freqY`, `freqT`, `amplitude`,
   `MODE_PARAMS`) du mode sortant vers le mode entrant sur `duration`ms, au lieu du saut instantané
   de `setMode()`. Implémentation concentrée dans `morphTo()` (actuellement un stub vide) — voir
   session A3, le point technique le plus incertain de ce chantier (interpolation à implémenter dans
   la boucle de rendu de `DotGridAnimated.js`, qui lit aujourd'hui `MODE_PARAMS[currentMode]`
   directement à chaque frame).

### Cas d'erreur
- `type` hors des 5 valeurs valides → rejeté par `resolveTransition` comme aujourd'hui (repli sur la
  priorité inférieure, jamais une valeur invalide appliquée).
- `morph` demandé sans changement de mode DotGrid → dégradation silencieuse en `crossfade` (pas une
  erreur, un cas normal, voir AC-05).

### Edge cases
- Deux transitions déclenchées coup sur coup (déjà géré par `finalizePending`/`crossfade`
  aujourd'hui, réutilisé tel quel pour les 3 nouveaux types) — la transition en cours est finalisée
  avant d'en démarrer une nouvelle.
- `morph` où SEULE la scène sortante a un `dotgridMode` (l'entrante est `null`) : le fond doit
  s'estomper (cohérent avec `applyGlobalVisibility`, qui masque déjà `#bg-layer` quand
  `currentDotgridMode === null`) plutôt que de "morpher vers rien" — comportement à préciser en A3.

## Fichiers

| Fichier | Action | Notes |
|---|---|---|
| `types.js` | modifier | `TransitionType` étendu (5 valeurs) |
| `scene-resolve.js` | modifier | `TRANSITION_TYPES` étendu, tests `resolveTransition` (AC-01) |
| `scene-resolve.test.js` | modifier | tests AC-01, AC-05 (pure, `morph` avec modes identiques → toujours une `SceneTransition` valide, dégradation résolue plus haut dans `scene-runtime.js`, pas ici) |
| `scene-runtime.js` | modifier | `slide`/`wipe`/`morph` dans la logique de transition (AC-02 à AC-06) — session A2 (`slide`/`wipe`) puis A3 (`morph`) |
| `components/DotGridAnimated.js` | modifier | implémente enfin `morphTo()` (actuellement stub) — session A3 |

> Règle de cross-check (avant de déclarer "done") :
> - Chaque AC → implémenté et vérifiable
> - Chaque type défini → utilisé par au moins un fichier listé
> - Chaque fichier listé → existe ou est créé dans cette session

## Lacunes identifiées

- [ ] LAC-01 — Comportement exact de `morph` quand un seul côté (entrant/sortant) a un
      `dotgridMode` non-null : à préciser en session A3 (candidat : traiter comme un fade
      d'opacité du fond en parallèle du morph des paramètres, plutôt qu'un cas d'erreur).
