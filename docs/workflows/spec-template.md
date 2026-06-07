---
feature: [Nom de la feature]
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: draft
---

# Spec : [Nom de la feature]

## Contexte

[Pourquoi cette feature existe. Quel problème elle résout. Lien vers `{overview}` ou specs liées.]

## Périmètre

**Inclus :**
- [Ce que cette spec couvre explicitement]

**Exclu :**
- [Ce qui est volontairement laissé à une session future — avec la session cible si connue]

## Acceptance Criteria

| ID | Critère | Vérifiable par |
|---|---|---|
| AC-01 | … | test / review / visuel OBS |

> Règle : chaque AC est vérifiable de façon autonome. "Fonctionne correctement" n'est pas un AC.

## Types JSDoc

[Définitions à ajouter dans `types.js`. Exhaustif : chaque champ, son type, sa contrainte, son unité si numérique.]

```js
/**
 * @typedef {Object} NomDuType
 * @property {string} champ - Description
 */
```

## Format de données

[Structures exactes. Inclure au moins un exemple complet commenté par type de fichier produit.]

```js
// Exemple : scenes/xxx.config.js
export const sceneConfig = { /* ... */ };
```

## Comportements

### Cas nominaux

[Flux attendu étape par étape pour chaque scénario principal.]

### Cas d'erreur

[Chaque erreur possible : quoi, pourquoi, action exacte (log, ignore, throw).]

### Edge cases

[Valeurs limites, états vides, séquences inattendues.]

## Contrat d'événements (si applicable)

[CustomEvents DOM dispatchés : nom, `detail` shape, garanties de séquencement.]

| Événement | `detail` | Quand |
|---|---|---|
| `overlay:xxx` | `{ … }` | … |

## Fichiers

| Fichier | Action | Notes |
|---|---|---|
| `types.js` | modifier | Ajouter les types |

> Règle de cross-check (avant de déclarer "done") :
> - Chaque AC → implémenté et vérifiable
> - Chaque type défini → utilisé par au moins un fichier listé
> - Chaque fichier listé → existe ou est créé dans cette session

## Lacunes identifiées

> À remplir dès qu'une lacune est découverte pendant l'implémentation.
> Format : `[ ] LAC-01 — description` + owner approval si déféré à une session future.

Aucune.
