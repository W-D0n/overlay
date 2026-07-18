# Fond seul dans OBS et page de tuning

> Version HTML mise en page : `tuner-le-fond.html` (même contenu).

Ce guide couvre le mode **background-only** : une URL OBS qui ne rend que l'animation de fond,
réglée en direct depuis la page de tuning. Le moteur de scènes complet (`index.html`) n'est pas
concerné ici.

## Vue d'ensemble

Quatre pièces communiquent :

- `background.html` — la page à mettre dans OBS. Affiche l'effet de fond courant, rien d'autre.
- `dev/studio.html` — l'entrée de création commune aux fonds et aux scènes complètes.
- `dev/background-tuner.html` — l'espace de tuning. Aperçu plein écran + barre latérale
  rétractable (liste des effets, paramètres, presets).
- Le **serveur d'état** (port 4462, lancé automatiquement) — retient le dernier réglage dans
  `dev/data/background-state.json` et pousse chaque changement en direct vers OBS.

Concrètement : tu bouges un curseur dans le tuner → l'aperçu change immédiatement → OBS suit dans
la seconde → au prochain démarrage, OBS recharge le dernier état sauvegardé tout seul.

## Mettre le fond dans OBS

1. Lancer `start-stream.bat` (ou `start-dev.bat` pour bricoler).
2. Dans OBS : Source → **Navigateur** (Browser Source).
3. URL : `http://localhost:5500/background.html`
4. Largeur `1920`, hauteur `1080`.

Laisser le champ **CSS personnalisé** vide. OBS injecte ce CSS après celui de la page : une règle
ajoutée ici peut forcer un fond, masquer un élément ou changer une taille, mais crée alors une
différence entre le tuner et OBS. Pour superposer l'animation sur une capture, utiliser
`http://localhost:5500/background.html?transparent=1` plutôt qu'une surcharge CSS.

Si le serveur n'est pas encore lancé quand OBS charge la page, la page attend et se reconnecte
toute seule (1 s → 30 s max entre les tentatives).

## La page de tuning

Ouvrir `http://localhost:5500/dev/studio.html` (s'ouvre aussi automatiquement avec
`start-dev.bat`), puis choisir **Fonds & presets**. L'URL directe
`http://localhost:5500/dev/background-tuner.html` reste utilisable.

- **La barre latérale se rétracte** avec le bouton `◀` / `▶` sur son bord.
- **Effet** : le menu déroulant liste toutes les animations disponibles (+ « (aucun) »).
- **Paramètres** : chaque valeur numérique dispose d'un curseur borné, d'une saisie précise et de
  son unité ; le formulaire reste généré selon l'effet choisi et s'applique en direct.
- **Bibliothèque Atelier** : **appliquer** teste une ambiance sans la sauvegarder ; **Ajouter** en
  crée une copie personnelle modifiable.
- **Recherche** : le champ au-dessus des bibliothèques filtre à la fois les presets Atelier et
  personnels par nom, effet ou tag, sans dépendre des accents ni des majuscules.
- **Mes presets** : **Créer** enregistre le réglage courant ; cliquer sur un preset le recharge
  (OBS suit) ; **URL** copie son adresse dédiée ; `✎` renomme sans casser cette adresse ; `⧉`
  duplique ; `✕` supprime avec confirmation. **Nouveau** quitte le mode de mise à jour du preset
  chargé. Le champ sous la ligne de sauvegarde accepte des tags séparés par des virgules.
- **Sauvegarde portable** : **Exporter** télécharge toute la bibliothèque personnelle dans un JSON
  versionné. **Importer** valide d'abord le fichier entier : un identifiant déjà connu est mis à
  jour en conservant son URL OBS ; un nouveau est ajouté ; un conflit de nom est suffixé au lieu
  d'écraser silencieusement un autre preset. Avant l'écriture, le tuner résume les créations, mises
  à jour, noms ajustés et presets ignorés, puis détaille chaque preset : opération, effet, tags et
  réglages ajoutés, retirés ou modifiés. Un conflit indique le nom demandé, le preset qui le porte
  déjà et le nom finalement attribué. La liste défile indépendamment pour garder
  **Confirmer l'import** et **Annuler** accessibles sur un gros fichier. Rien n'est écrit avant la
  confirmation ; un fichier invalide ne modifie rien non plus. Si la bibliothèque change dans un
  autre onglet entre l'aperçu et la confirmation, le serveur refuse l'ancienne révision, recalcule
  tout le détail et demande une nouvelle confirmation.
- **Qualité de rendu** : **Auto** plafonne le DPR à 2 ; **Performance OBS** le limite à 1. La
  ligne voisine affiche les FPS mesurés et la densité active.

La ligne de statut en bas de la barre indique si le serveur d'état répond.

## Vérifier avant un live

Le bloc **Prêt pour le live** se contrôle automatiquement à l'ouverture du tuner. Le bouton
**Revérifier** permet de relancer le diagnostic à tout moment, notamment après avoir changé un
effet, un preset ou le profil de rendu. Les résultats et leurs coches se rejouent alors dans
l'ordre ; le mouvement est automatiquement désactivé si le système demande moins d'animations.

Le diagnostic est entièrement en lecture seule : il ne modifie ni le fond courant, ni les presets,
ni la configuration OBS. Il vérifie :

- la disponibilité du serveur d'état ;
- la validité de l'effet ou du preset sélectionné ;
- l'adresse à utiliser dans la Source Navigateur OBS ;
- la présence d'une mesure locale FPS/DPR ;
- le relais optionnel, qui n'est pas requis pour une URL de fond autonome.

Le résultat est **Prêt**, **Attention** ou **Bloquant**. Chaque ligne concernée propose une action
directe : copier l'URL, choisir un effet ou un preset, ou réessayer après avoir relancé
`start-dev.bat` ou `start-stream.bat`. La mesure FPS vient du navigateur courant : elle confirme que
l'animation tourne, mais ne certifie pas ses performances dans OBS. Toujours faire une dernière
vérification visuelle dans OBS avant le live.

## Couleurs, palettes et scènes

- `tokens.css` contient les couleurs de l'identité Atelier utilisées par l'interface.
- Les couleurs des effets acceptent une valeur CSS libre : hex, `rgb(...)`, `oklch(...)` ou
  `var(--nom-du-token)`.
- `components/color-palette.json` contient les couleurs nommées et les gradients de travail destinés
  au tuner.

Deux modes sont disponibles :

- `background.html` suit l'état courant du tuner ; toutes les sources utilisant cette URL affichent
  le même effet.
- `background.html?preset=identifiant-stable&transparent=1` reste attachée à ce preset. Renommer
  le preset ne change pas cette URL. Une mise à jour est appliquée en direct sans suivre les autres
  changements du tuner. Les anciennes URL utilisant le nom restent relues pour compatibilité.

Pour avoir un fond différent par scène, créer les presets, utiliser leur bouton **URL OBS**, puis
ajouter une source Navigateur par URL dans OBS. Activer **Arrêter la source lorsqu'elle n'est pas
visible** sur ces sources pour ne laisser tourner que la scène affichée. Une connexion automatique
au changement de scène OBS reste une extension possible, mais n'est plus nécessaire pour ce besoin.

## Ajouter une nouvelle animation — sans agent

Le tuner et l'URL OBS n'ont **jamais** besoin d'être modifiés : ils lisent tout depuis trois
déclarations. Ajouter une animation = créer un fichier et ajouter trois lignes.

### 1. Le composant — `components/MonEffetBackground.js`

Une fonction qui retourne `{ el, update, destroy }` (contrat `ComponentInstance`, détail dans
`creer-un-composant.md`). Partir d'une copie d'un effet existant proche —
`components/RainBackground.js` est un bon modèle (canvas, resize, couleurs via tokens).
`destroy()` doit impérativement annuler le `requestAnimationFrame`.

### 2. Le registre — deux fichiers, une ligne chacun

- `component-names.js` : ajouter `'MonEffetBackground'` à la liste.
- `component-registry.js` : importer la factory + l'ajouter au registry.

### 3. Le schéma de champs — `dev/component-field-schemas.js`

Une entrée dans `BACKGROUND_FIELD_SCHEMAS` décrivant les paramètres réglables — c'est elle qui
génère le formulaire du tuner :

```js
MonEffetBackground: [
  { key: 'speed', label: 'Vitesse', type: 'number', min: 0, max: 5, step: 0.05,
    unit: '×', control: 'slider', default: 1 },
  { key: 'color', label: 'Couleur', type: 'color', default: '#C8B97A' },
],
```

Types disponibles : `'text'`, `'number'`, `'select'` (+ `choices`), `'textarea'`,
`'color'` (picker + palette + CSS libre) et `'colors'` (liste ajout/retrait + gradients).
Tout champ numérique doit définir `min`, `max`, `step` et `control: 'slider'` ; `unit` est
facultatif. Les profils communs du projet sont centralisés dans `NUMBER_FIELD_GUIDANCE`.

### 4. Vérifier

```
bun test
```

Les tests de cohérence existants attrapent les oublis (nom sans factory, factory sans schéma).
Recharger le tuner : le nouvel effet est dans le menu déroulant, avec son formulaire et ses
presets — `background.html`, le tuner et le serveur n'ont pas bougé.

## Faire évoluer le tuner

La page `dev/background-tuner.html` ne contient plus sa logique métier. Selon le changement :

- **ajouter ou modifier un champ** : déclarer le champ dans `dev/component-field-schemas.js` ; son
  rendu commun vit dans `dev/background-field-renderer.js` ;
- **ajouter une requête au serveur d'état** : ajouter la méthode et sa route uniquement dans
  `dev/background-state-client.js` ;
- **ajouter une action de preset** : intervenir dans `dev/background-preset-controller.js` ;
- **modifier l'import/export** : intervenir dans `dev/background-preset-transfer-controller.js`
  et conserver la prévisualisation puis la confirmation avant écriture ;
- **modifier le montage, la qualité ou la mesure FPS** : utiliser
  `dev/background-preview-controller.js` ; l'état courant et le preset actif sont isolés dans
  `dev/background-preview-session.js` ;
- **modifier le contrôle pré-live** : la synthèse reste dans `dev/background-live-readiness.js` et
  son rendu dans `dev/background-readiness-controller.js` ;
- **câbler un nouveau module au démarrage** : le faire dans `dev/background-tuner-runtime.js`.

Les identifiants HTML, les URL et les routes serveur font partie du contrat : ne pas les recopier
dans plusieurs modules. Ajouter un test à l'interface concernée, puis lancer `bun test` et vérifier
les parcours du Studio à 1920×1080.

## Performance et cycle de vie

Les canvas utilisent `components/canvas-runtime.js` : DPR plafonné à 2 par défaut, ou à 1 avec
`?quality=performance`. `background.html` et le tuner démontent l'effet lorsque l'onglet devient
invisible, puis remontent le dernier état reçu à la reprise. Dans OBS, conserver en plus l'option
**Arrêter la source lorsqu'elle n'est pas visible** : OBS évite alors de garder la page active.
