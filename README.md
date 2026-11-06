# Overlay Atelier — D0n / Mozaïk

Habillage de stream pour OBS Browser Source, en HTML/CSS/JS natif, sans build ni dépendance.
Direction artistique **Atelier** : noir profond, or patiné, typographie serif + monospace.

## Focus actuel : le Studio d'overlays

Une **scène** est une pile de couches (effets de fond, texte, formes, images, branding) que le Studio édite et que la page de rendu joue dans OBS :

- `background.html` — URL à utiliser dans OBS ;
- `dev/studio.html` — entrée unique de création : rail (antenne, bibliothèque, scènes OBS, branding), aperçu 1920×1080 et réglages de la scène ;
- `dev/background-state-server.js` — persistance JSON, médiathèque, versions et synchronisation WebSocket.

Ce que fait le Studio : couches ordonnées, historique annulable, brouillon puis publication, **texte, formes et images**
(médiathèque d'images et de polices importées), **liaisons** au son et aux alertes, **timeline à images clés**, **versions nommées**,
export / import d'une scène avec ses images, alerte quand le serveur, OBS ou la page de rendu est perdu, **couche Code** (HTML, CSS et JavaScript dans une page isolée : animations CSS, canvas, WebGL, three.js depuis la médiathèque), **couche Shader** (GLSL calculé par la carte graphique, à la Shadertoy), et **alertes réelles** (Twitch EventSub, Twitchat) avec la connexion à OBS réglée dans la fenêtre **Réglages**.
Mode d'emploi : [`docs/guides/studio-editeur-de-couches.md`](docs/guides/studio-editeur-de-couches.md).

Le moteur de scènes a été retiré du dépôt le 2026-07-25. Son code reste restaurable via le tag
git `scene-engine-v1`, et ses specs vivent dans `docs/specs/archive/`.

## Démarrage rapide

### Régler un fond

Double-cliquer sur `studio.bat` (à la racine). Il lance les serveurs et ouvre le Studio dans le navigateur dès qu'il répond :

`http://localhost:5931/dev/studio.html`

`Ctrl+C` dans la fenêtre (ou la fermer) arrête proprement les serveurs.

Le Studio permet de composer une scène : **11 effets** de fond réglés par des curseurs bornés, des contenus
(texte, forme, image), des points de départ prêts à l'emploi, et la gestion de ses presets. La recherche couvre
le nom, l'effet et les tags ; **Exporter** et **Importer** rendent la bibliothèque personnelle
portable entre deux installations (les images voyagent avec la scène).

### Utiliser le fond dans OBS

1. Double-cliquer sur `stream.bat`.
2. Ajouter une source **Navigateur** dans OBS.
3. URL : `http://localhost:5931/background.html`
4. Dimensions : celles de ton canvas OBS — `1920 × 1080` ici. Le fond les épouse quelles qu'elles soient.
5. Laisser le champ **CSS personnalisé** vide.

Pour superposer uniquement l'animation au-dessus d'une capture, utiliser :

`http://localhost:5931/background.html?transparent=1`

### Utiliser un fond différent par scène

Chaque preset possède un bouton **URL**. Son adresse utilise un identifiant stable : elle reste
valide après un renommage et reste attachée au preset, même
si le tuner pilote un autre effet :

`http://localhost:5931/background.html?preset=discussion-calme&transparent=1`

Créer une source Navigateur par preset utile, puis placer la bonne source dans chaque scène OBS.
Activer **Arrêter la source lorsqu'elle n'est pas visible** pour que les scènes masquées ne
consomment pas de ressources.

Dans OBS, la densité des canvas est déjà à DPR 1 (mesuré le 2026-10-29) ; le paramètre
`?quality=performance` reste lu mais n'est plus proposé. Les animations se mettent automatiquement en
pause lorsque leur page devient invisible.

Le serveur d'état doit rester ouvert pendant le live. Il ne modifie que
`dev/data/background-state.json`, jamais le code source.

### Si un serveur reste bloqué

`studio.bat` libère déjà tout seul un port laissé occupé par un ancien `bun.exe` orphelin.
`stream.bat`, volontairement, se contente de signaler le port occupé sans le libérer — pas de
kill silencieux juste avant/pendant un live. Si ni l'un ni l'autre ne tourne (crash, fermeture au
Gestionnaire des tâches) et qu'un port reste occupé au lancement suivant : double-cliquer sur
`kill-servers.bat`. Il ne touche jamais un process qui n'est pas un `bun.exe` du projet.

## Structure active

```text
background.html            Entrée OBS (URL stable : http://localhost:5931/background.html)
ports.config.js            Ports des serveurs, source unique
studio.bat                 Lance le Studio et l'ouvre dans le navigateur
stream.bat                 Lance le fond pour le live (OBS)
kill-servers.bat           Libère les ports d'un bun.exe orphelin

src/                       Le moteur de l'overlay (jamais de serveur ni d'interface de dev)
  scene/                   Document de scène (scene-doc) et moteur qui le monte (scene-runtime)
  layers/                  Types de couche (layer-kinds, component-registry), animation, filtres, masque, groupes, timeline, liaisons
  background/              État du fond, sélection, transitions, réactions, audio
  render/                  Source de rendu OBS : résolution de référence, horloge, transport, URL
  obs/                     Connexion OBS : authentification, correspondance scène ↔ preset
  branding/                Couche d'identité (pseudo, réseaux)
  components/              Les effets et les couches (*Background.js, *Layer.js), leurs outils et leur palette
  styles/tokens.css        Tokens de design Atelier, source de vérité visuelle
  types.js                 Types JSDoc partagés

dev/                       Le Studio (studio.html), les serveurs (static-server, background-state-server,
                           start-studio, start-stream, kill-servers) et les essais de bout en bout (e2e/)
docs/                      Specs, guides, backlog
src-tauri/                 Application de bureau (panneau de contrôle des serveurs)
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
même factory via `scene-runtime.js`, ce qui évite toute différence de logique entre l'aperçu et
le rendu live.

## Couleurs et design

- `src/styles/tokens.css` est la source de vérité de l'identité Atelier.
- Les couleurs réglables des effets acceptent une valeur CSS libre : hex, `rgb(...)`,
  `oklch(...)` ou `var(--nom-du-token)`.
- `src/components/color-palette.json` contient la palette de travail et les gradients nommés.

Les styles des guides HTML vivent dans `docs/guides/guide.css` parce qu'ils appartiennent à la
documentation, pas au rendu OBS.

## Contraintes

- taille dictée par la Browser Source, jamais codée en dur ;
- `pointer-events: none` dans le rendu OBS ;
- zéro framework, zéro paquet npm, zéro CDN requis ;
- composants sous forme de factories `{ el, update?, destroy? }` ;
- toute boucle `requestAnimationFrame`, observation ou minuterie doit être nettoyée dans
  `destroy()`.

## Vérifier

```text
bun test
```

### Contrôler une branche avant fusion

1. Ouvrir la comparaison GitHub `main...nom-de-la-branche` et lire l'onglet **Files changed**.
2. Lancer `studio.bat`, puis vérifier dans le Studio les effets et les presets.
3. Lancer `bun test` : aucune fusion ne doit être faite si un test échoue.
4. Fusionner seulement après ce contrôle. Une branche poussée ne modifie pas `main` à elle seule.

Documentation détaillée :

- `docs/guides/tuner-le-fond.md`
- `docs/guides/creer-un-composant.md`
- `docs/specs/background-standalone.md`
- `docs/overview.md`
