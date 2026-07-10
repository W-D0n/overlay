# Guide — Utiliser le panneau de dev (tweaker sans écrire de code)

> Pour : ajuster ce qui existe déjà (paramètres DotGrid, effets de fond, composants d'une scène,
> noms de scènes OBS) sans toucher un seul fichier à la main.
> Pour créer un NOUVEAU type de composant/effet (qui n'existe pas encore), voir
> `docs/guides/creer-un-composant.md`.

## Lancement

```bash
bun dev/start-dev.js
```
(ou double-clic sur `start-dev.bat`). **Jamais pendant un live** — ces serveurs écrivent sur disque.
Ouvre automatiquement 3 onglets : preview auto-reload, `dotgrid-tuner.html`, `placement-panel.html`.

## `dev/placement-panel.html` — l'outil principal

C'est l'éditeur visuel de l'overlay. Une scène à la fois (menu déroulant en haut), le rendu réel
est affiché dans le panneau de gauche.

### Ajouter/retirer/configurer un composant dans une couche

Chaque couche listée à droite affiche ses composants actuels. Pour une couche donnée :
- **Ajouter** : menu déroulant "+ composant" → choisir un type (`StatBlock`, `TextLabel`, `Badge`,
  etc. — tout ce qui est dans `COMPOSABLE_COMPONENT_NAMES`) → un formulaire apparaît avec les champs
  propres à ce type.
- **Configurer** : chaque champ peut être une valeur fixe, ou basculé en "lié" (`$bind`) pour le
  connecter à une valeur d'état live (ex : `state.viewers`) — bouton bascule à côté du champ.
- **Retirer** : bouton "×" sur le composant.
- Les changements de composition (ajout/retrait) sont sauvegardés **immédiatement**. Les éditions de
  champ attendent le bouton "Enregistrer".

### Changer/tweaker l'effet de fond d'une scène

Section "Fond" en haut du panneau — menu déroulant pour choisir le composant de fond
(`DotGridBackground`, `RainBackground`, `MatrixGridBackground`, etc., voir
`dev/component-field-schemas.js` §`BACKGROUND_FIELD_SCHEMAS` pour la liste + les paramètres de
chacun). Chaque effet a son propre formulaire (intensité, couleur, vitesse...).

### Déplacer un widget

Glisser-déposer directement dans l'aperçu (couches migrées en `Placement` pixel absolu — pas toutes
les couches, certaines restent en CSS flex, voir `docs/specs/scene-placement-protocol.md`).

### Gérer les couches

"+ couche" pour en ajouter une entièrement vide. Renommage/réordonnancement de couches existantes :
pas encore possible depuis le panneau (voir `docs/inbox.md` §Gestion des couches).

### Créer / supprimer une scène entière

Bas du panneau : "+ scène" (id + couche minimale), bouton supprimer (**archive**, ne supprime jamais
vraiment — `scenes/data/archived/<id>.scene.json`, récupérable).

### Section OBS

- Activer une scène OBS, en créer une nouvelle, ajouter une source à une scène OBS — nécessite le
  relais (`relay/server.js`) lancé et un `obs-config.local.js` avec le token (voir
  `docs/obs-setup.md`).
- **"Renommer les scènes OBS"** — voir `docs/guides/harmoniser-scenes-obs.md`.

## `dev/dotgrid-tuner.html` — réglage fin du DotGrid

Sliders live sur les paramètres Simplex par mode (`freqX`/`freqY`/`freqT`/`amplitude`) +
`baseOpacity`/`dotRadius` globaux. Bouton "Sauvegarder" réécrit directement
`components/DotGridAnimated.js` (mêmes constantes `MODE_PARAMS` que documentées dans le fichier).
Bouton "Copier" en secours si le serveur d'écriture (`dev/tuner-server.js`) n'est pas lancé.

`colorMode: 'noise'` (variabilité de couleur par bruit) se règle depuis `placement-panel.html`
§Fond → `DotGridBackground`, pas depuis le tuner (qui ne couvre que les 4 params Simplex + 2 globaux
historiques).

## Ce qui n'est PAS encore éditable depuis un panneau

- Renommage/réordonnancement de couches (voir ci-dessus).
- Placement fin à l'intérieur d'une couche composite (ex: `interview`/`cams` a 3 éléments
  indépendants) — la couche entière bouge en bloc.
- Comportements de la Couche 4 DotGrid (`follow`/`sub`/`raid`/`bits`/`ambient`,
  `docs/specs/dotgrid-event-triggers.md`) — durées/amplitudes en constantes dans
  `components/DotGridAnimated.js`, pas de formulaire dédié (zero preemptive code, pas de demande
  concrète de tuning fin sur ces valeurs pour l'instant).

Ces limites ne sont pas des oublis — ce sont des choix "zero preemptive code" du projet : la UI
correspondante s'ajoutera quand le besoin deviendra concret, pas avant. Si l'un de ces points devient
un vrai besoin, demande — c'est un ajout localisé, pas une réécriture.
