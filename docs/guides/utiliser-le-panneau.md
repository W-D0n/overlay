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
Ouvre automatiquement 2 onglets, 2 secondes après le lancement des serveurs : le Studio de
création et la preview auto-reload.

Si l'ouverture automatique échoue (rien ne s'ouvre), ouvrir manuellement dans le navigateur une fois
les serveurs lancés :
- `http://localhost:5500/dev/studio.html` — entrée unique, onglets **Fonds & presets** et
  **Scènes complètes**
- `http://localhost:5500/index.html?livereload=1` — preview de l'overlay complet

Les deux outils restent aussi accessibles directement via `dev/background-tuner.html` et
`dev/overlay-setting.html` pour le diagnostic.

## Studio → Fonds & presets

C'est l'outil principal pour le flux OBS `background.html` : choix d'un effet, réglages live,
presets et copie de l'URL OBS dédiée. Les valeurs numériques utilisent des curseurs bornés avec
valeur exacte ; la bibliothèque Atelier fournit des points de départ par usage. Le profil
**Performance OBS** et l'indicateur FPS permettent de vérifier le coût avant le live. Cet outil ne
modifie jamais le code source. La recherche filtre les presets par nom, effet ou tag ; les boutons
**Exporter** et **Importer** permettent de déplacer toute la bibliothèque personnelle via un JSON
validé avant écriture.

## Studio → Scènes complètes

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
  champ sont sauvegardées au changement validé (perte de focus ou sélection).

### Changer/tweaker l'effet de fond d'une scène

Section "Fond" en haut du panneau — menu déroulant pour choisir le composant de fond
(`DotGridBackground`, `RainBackground`, `MatrixGridBackground`, etc., voir
`dev/component-field-schemas.js` §`BACKGROUND_FIELD_SCHEMAS` pour la liste + les paramètres de
chacun). Chaque effet a son propre formulaire (intensité, couleur, vitesse...).

### Déplacer un widget

Glisser-déposer directement dans l'aperçu (couches migrées en `Placement` pixel absolu — pas toutes
les couches, certaines restent en CSS flex, voir `docs/specs/scene-placement-protocol.md`).

### Gérer les couches

"+ couche" pour en ajouter une entièrement vide. Renommage (input inline, couche `goldbar` protégée)
et réordonnancement (boutons ↑/↓ + glisser-déposer par poignée dédiée) des couches existantes :
livré (2026-07-05), voir `docs/inbox.md` §Gestion des couches.

### Créer / supprimer une scène entière

Bas du panneau : "+ scène" (id + couche minimale), bouton supprimer (**archive**, ne supprime jamais
vraiment — `scenes/data/archived/<id>.scene.json`, récupérable).

### Section OBS

- Activer une scène OBS, en créer une nouvelle, ajouter une source à une scène OBS — nécessite le
  relais (`relay/server.js`) lancé et un `obs-config.local.js` avec le token (voir
  `docs/obs-setup.md`).
- **"Renommer les scènes OBS"** — voir `docs/guides/harmoniser-scenes-obs.md`.

## `dev/dotgrid-tuner.html` — réglage avancé du DotGrid

Sliders live sur les paramètres Simplex par mode (`freqX`/`freqY`/`freqT`/`amplitude`) +
`baseOpacity`/`dotRadius` globaux. Bouton "Sauvegarder" réécrit directement
`components/DotGridAnimated.js` (mêmes constantes `MODE_PARAMS` que documentées dans le fichier).
Cet outil développeur n'est pas ouvert par défaut : lancer `bun dev/tuner-server.js` avant de
l'utiliser. Le bouton "Copier" reste disponible en secours.

`colorMode: 'noise'` (variabilité de couleur par bruit) se règle depuis `overlay-setting.html`
§Fond → `DotGridBackground`, pas depuis le tuner (qui ne couvre que les 4 params Simplex + 2 globaux
historiques).

## Ce qui n'est PAS encore éditable depuis un panneau

- Deux calques restent en CSS flex plutôt qu'en placement par composant, par choix assumé (texte
  dynamique collé à ses voisins, pas des widgets à repositionner séparément) : `next-stream`(brb) et
  `source-credit`(react) — voir `docs/inbox.md` §Extensions du système de placement.
- Comportements de la Couche 4 DotGrid (`follow`/`sub`/`raid`/`bits`/`ambient`,
  `docs/specs/dotgrid-event-triggers.md`) — durées/amplitudes en constantes dans
  `components/DotGridAnimated.js`, pas de formulaire dédié (zero preemptive code, pas de demande
  concrète de tuning fin sur ces valeurs pour l'instant).

Ces limites ne sont pas des oublis — ce sont des choix "zero preemptive code" du projet : la UI
correspondante s'ajoutera quand le besoin deviendra concret, pas avant. Si l'un de ces points devient
un vrai besoin, demande — c'est un ajout localisé, pas une réécriture.
