# Overlay Atelier — D0n / Mozaïk

Habillage de stream pour OBS Browser Source, en HTML/CSS/JS natif, sans build ni dépendance.
Direction artistique **Atelier** : noir profond, or patiné, typographie serif + monospace.

## Focus actuel : les fonds autonomes

Le flux principal ne rend qu'une animation de fond :

- `background.html` — URL à utiliser dans OBS ;
- `dev/studio.html` — entrée unique vers les fonds autonomes et les scènes complètes ;
- `dev/background-tuner.html` — aperçu plein écran, réglages guidés, bibliothèque Atelier et presets ;
- `dev/background-state-server.js` — persistance JSON et synchronisation WebSocket.

Le moteur de scènes complet (`index.html`, `scene-runtime.js`, `dev/overlay-setting.html`) reste
dans le dépôt et fonctionne toujours. Le Studio donne accès à son éditeur afin de
préserver la création et les neuf rendus existants, même si le fond autonome reste le flux live.

## Démarrage rapide

### Régler un fond

Double-cliquer sur `start-dev.bat`. Le script lance l'environnement de création et ouvre notamment :

`http://localhost:5500/dev/studio.html`

L'onglet **Fonds & presets** permet de choisir parmi les **12 effets**, de les régler avec des
curseurs bornés, d'appliquer les ambiances Atelier et de gérer ses presets. La recherche couvre
le nom, l'effet et les tags ; **Exporter** et **Importer** rendent la bibliothèque personnelle
portable entre deux installations. L'onglet **Scènes
complètes** conserve l'éditeur et les neuf rendus existants.

### Utiliser le fond dans OBS

1. Double-cliquer sur `start-stream.bat`.
2. Ajouter une source **Navigateur** dans OBS.
3. URL : `http://localhost:5500/background.html`
4. Dimensions : `1920 × 1080`.
5. Laisser le champ **CSS personnalisé** vide.

Pour superposer uniquement l'animation au-dessus d'une capture, utiliser :

`http://localhost:5500/background.html?transparent=1`

### Utiliser un fond différent par scène

Chaque preset possède un bouton **URL**. Son adresse utilise un identifiant stable : elle reste
valide après un renommage et reste attachée au preset, même
si le tuner pilote un autre effet :

`http://localhost:5500/background.html?preset=discussion-calme&transparent=1`

Créer une source Navigateur par preset utile, puis placer la bonne source dans chaque scène OBS.
Activer **Arrêter la source lorsqu'elle n'est pas visible** pour que les scènes masquées ne
consomment pas de ressources.

Le profil **Performance OBS** limite aussi la densité des canvas à DPR 1. L'URL copiée depuis le
tuner conserve ce choix avec `quality=performance`. Les animations se mettent automatiquement en
pause lorsque leur page devient invisible.

Le serveur d'état doit rester ouvert pendant le live. Il ne modifie que
`dev/data/background-state.json`, jamais le code source.

## Structure active

```text
background.html
background-mount.js
background-selection.js
component-names.js
component-registry.js
tokens.css

components/
  *Background.js
  color-utils.js
  color-palette.json

dev/
  studio.html
  studio.config.js
  background-tuner.html
  builtin-background-presets.js
  background-preset-library.js
  background-state-server.js
  background-state-format.js
  component-field-schemas.js
  numeric-field-control.js
  start-dev.js
  start-stream.js

docs/
  guides/tuner-le-fond.md
  specs/background-standalone.md
  specs/background-effects-library.md
```

Chaque effet respecte le contrat :

```js
{
  el,
  update(options),
  destroy(),
}
```

Son formulaire est déclaré dans `BACKGROUND_FIELD_SCHEMAS`. Le tuner et l'URL OBS utilisent la
même factory via `background-mount.js`, ce qui évite toute différence de logique entre l'aperçu et
le rendu live.

## Couleurs et design

- `tokens.css` est la source de vérité de l'identité Atelier.
- Les couleurs réglables des effets acceptent une valeur CSS libre : hex, `rgb(...)`,
  `oklch(...)` ou `var(--nom-du-token)`.
- `components/color-palette.json` contient la palette de travail et les gradients nommés.

Les styles des guides HTML vivent dans `docs/guides/guide.css` parce qu'ils appartiennent à la
documentation, pas au rendu OBS.

## Moteur de scènes conservé

Le sous-système historique comprend :

- neuf scènes dans `scenes/data/*.scene.json` ;
- un runtime page unique dans `index.html` / `scene-runtime.js` ;
- le protocole abstrait `{ type, data }` dans `protocol.js` / `store.js` ;
- le relais OBS WebSocket dans `relay/` ;
- l'éditeur de scènes dans `dev/overlay-setting.html`.

Il n'est pas supprimé, mais les nouvelles améliorations visuelles ciblent le mode fond autonome
sauf demande explicite de retour aux scènes.

## Contraintes

- résolution fixe `1920 × 1080` ;
- `pointer-events: none` dans le rendu OBS ;
- zéro framework, zéro paquet npm, zéro CDN requis ;
- composants sous forme de factories `{ el, update?, destroy? }` ;
- toute boucle `requestAnimationFrame`, observation ou minuterie doit être nettoyée dans
  `destroy()`.

## Vérifier

```text
bun test
```

Documentation détaillée :

- `docs/guides/tuner-le-fond.md`
- `docs/guides/creer-un-composant.md`
- `docs/specs/background-standalone.md`
- `docs/overview.md`
