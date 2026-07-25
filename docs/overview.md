# Overview — Overlay Stream D0n / Mozaïk

## Pourquoi ce projet

Overlay stream autonome pour D0n / Mozaïk, réutilisable sans couplage à un service personnel.
Direction artistique **Atelier** : noir profond, or patiné, serif + monospace.

Contraintes structurantes :

- HTML/CSS/JS natif, zéro build et zéro dépendance ;
- Browser Source OBS de taille variable — la page s'adapte, rien n'est figé en pixels ;
- composants sous le contrat `{ el, update?, destroy? }` ;
- variables visuelles partagées dans `tokens.css`.

## Focus actuel — fond autonome

Depuis le 14 juillet 2026, le développement actif cible un flux **background-only** :

```text
background-tuner.html ──► background-tuner-runtime.js
                              │ contrôleurs + client HTTP/WS
                              ▼
background-state-server.js ──► dev/data/background-state.json
        │
        ▼
background.html (OBS)
```

- `background.html` rend l'effet courant, ou un preset fixe avec `?preset=...`.
- `dev/studio.html` est l'entrée de création unique.
- `dev/background-tuner.html` ne porte que le markup et les styles ;
  `dev/background-tuner-runtime.js` orchestre ses modules et utilise le même moteur de montage pour
  l'aperçu.
- La bibliothèque de presets et son transfert import/export sont séparés : un fichier choisi est
  toujours prévisualisé avant que la confirmation n'autorise son écriture.
- `dev/background-state-server.js` persiste l'état et le diffuse en direct.
- Un seul effet est actif à la fois parmi les 11 enregistrés.
- Les presets mémorisent `{ id, name, component, options, tags? }` et exposent une URL OBS stable pour
  affecter des ambiances différentes aux scènes.

Le contrat détaillé vit dans `docs/specs/background-standalone.md`.

## Modèle des effets

Un effet de fond est constitué de trois pièces :

1. une factory `components/XxxBackground.js` ;
2. son nom et sa factory dans `component-names.js` / `component-registry.js` ;
3. son formulaire dans `BACKGROUND_FIELD_SCHEMAS`
   (`dev/component-field-schemas.js`).

Cette structure rend tout nouvel effet immédiatement disponible dans le tuner et dans OBS sans
modifier les deux pages.

## Couleurs

`tokens.css` reste la source de vérité de l'identité Atelier. Les options couleur des animations
sont volontairement libres : hex, `rgb()`, `oklch()` ou `var(--token)`.

`components/color-palette.json` est la palette de travail destinée au sélecteur de couleurs et aux
gradients nommés. Elle ne remplace pas les tokens CSS utilisés par l'interface et les composants
non configurables.

## Moteur de scènes — archivé

Le moteur historique (page unique `index.html`, neuf scènes JSON, couches nommées, transitions,
protocole `{ type, data }`, relais OBS WebSocket, éditeur `dev/overlay-setting.html`) a été retiré
du working tree le 2026-07-25. Il reste restaurable via le tag git `scene-engine-v1` et ses specs
sont conservées dans `docs/specs/archive/`.

`DotGridAnimated` n'en faisait pas partie : c'est l'effet de fond `DotGridBackground`, toujours
actif.

## Principe d'indépendance

L'indépendance repose sur des protocoles locaux explicites :

- le fond autonome consomme un état `{ component, options }` ;
- les réactions consomment un événement éphémère `{ type, username?, amount? }` (`POST /event`) ;
- les sources de données et l'UI restent remplaçables tant qu'elles respectent ces contrats.

## Documents de référence

- `docs/specs/background-standalone.md` — architecture active ;
- `docs/specs/background-reactive-events.md` — protocole des réactions ;
- `docs/specs/background-effects-library.md` — contrat et inventaire des effets ;
- `docs/guides/tuner-le-fond.md` — utilisation quotidienne ;
- `docs/inbox.md` — notes et items qui restent à traiter ;
- `docs/backlog-history.md` — décisions et lots sortis du backlog actif ;
- `docs/MAP.md` — feuille de route et livraisons.
