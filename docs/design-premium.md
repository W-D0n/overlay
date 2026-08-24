# Design & navigation premium — feedback comparatif

Revue du Studio/Tuner (`dev/studio.html`, `dev/background-tuner.html`, `background.html`) à la
lumière de deux projets voisins de la même famille visuelle : `dither_studio` et `dither_lab`
(même palette noir/or, même contrat de composant, même réflexe « zéro dépendance »). Les trois
projets partagent un ADN — ce document compare les décisions de design et de navigation prises de
part et d'autre, garde ce qui mérite d'être protégé ici, et nomme ce qui casse l'illusion premium.

Produit par revue de code (`tokens.css`, `dev/background-tuner.html`, `dev/studio.html`,
`components/*`) et par usage réel de l'app (`bun dev\start-dev.js`, Studio ouvert en 1600×1000,
les trois onglets du tuner parcourus, sidebar repliée/dépliée, `background.html` seul).

---

## 1. Ce qui est déjà juste

### 1.1 — La palette n'est pas un hasard, c'est une lignée

`--color-gold: #C8B97A` ici répond directement à `--accent: #d7a355` dans dither_lab et
dither_studio — même famille de patine, même rôle (unique touche de couleur chaude sur un fond
quasi noir, jamais utilisée pour autre chose qu'un accent). Les trois projets ont convergé sans se
copier vers le même vocabulaire : noir profond en fond, gris chauds pour le texte secondaire, une
seule teinte dorée réservée aux éléments qui comptent (accent, valeur active, action positive).
C'est le signe d'un goût cohérent plutôt que d'un token isolé — à préserver tel quel dans tout
futur outil de la famille.

Contrôle de contraste (WCAG) des tons de texte de `tokens.css` sur `--color-bg` (#0A0A0C) :

| Token | Valeur | Contraste vs fond | Lecture |
|---|---|---|---|
| `--color-text-primary` | `#F2F0EC` | 17.4 : 1 | texte principal, largement AAA |
| `--color-gold` | `#C8B97A` | 10.1 : 1 | accent, largement AAA |
| `--color-text-mid` | `#9A9890` | 6.9 : 1 | AA texte normal |
| `--color-text-dim` | `#5A5A62` | 2.9 : 1 | sous le seuil AA (4.5:1) même en grand texte |
| `--color-text-ghost` | `#3C3C48` | 1.8 : 1 | décoratif seulement, illisible comme texte |

dither_lab a la même logique de palier (`--text`, `--text-dim`, `--text-faint`) — l'existence de
paliers volontairement peu lisibles n'est donc pas un défaut en soi, c'est le langage assumé de la
famille pour le texte d'ambiance. Le point d'attention n'est pas la palette (§2.5) mais *où* ces
paliers sont appliqués.

### 1.2 — Un système de tokens plus mûr que ses voisins

`tokens.css` va plus loin que `style.css` de dither_lab/dither_studio sur plusieurs points qui
valent la peine d'être rapatriés dans les prochains outils de la famille :

- une échelle `--z-bg/--z-content/--z-overlay/--z-alert` explicite, là où les siblings gèrent le
  z-index au cas par cas ;
- `--transition-stagger: 90ms` — un token dédié à la *chorégraphie* d'une liste qui apparaît
  élément par élément, pas seulement à la durée d'une transition unique ;
- `--tracking-label` centralisé pour tous les libellés capitales-espacées, évitant que chaque
  scène invente sa propre valeur (ce que dither_lab n'a pas encore factorisé).

### 1.3 — L'aperçu plein écran comme scène, pas comme vignette

Le tuner n'encadre pas l'animation dans une `stage-frame` avec ombre portée comme dither_lab
(`box-shadow: 0 20px 60px rgba(0,0,0,.5)` autour d'un canvas de taille fixe) — il fait tourner le
rendu final en plein viewport, sidebar flottante par-dessus. C'est le bon choix ici : l'objet livré
est une Browser Source OBS, pas un canvas de démonstration encadré. Replier la sidebar (bouton
`◀`/`▶`) donne littéralement l'écran tel qu'il apparaîtra en stream — un aperçu WYSIWYG qu'aucun
des deux siblings n'a besoin d'offrir, et qui est bien exécuté : la sidebar repliée laisse un
viewport intégralement propre, sans résidu de chrome.

### 1.4 — Les vignettes de presets savent rester immobiles

`.preset-thumb[data-live="true"] .preset-thumb-still { visibility: hidden }` (background-tuner.html:207) :
au repos, chaque carte de « Points de départ » montre une image figée, pas une animation qui
tourne. Une liste de cinq presets qui bougent tous en même temps est un des pièges classiques du
« premium raté » — trop de mouvement simultané lit comme du bruit, pas comme du soin. Le choix
explicite de figer par défaut et de n'animer qu'à la demande (hover/sélection) est exactement le
bon réflexe, plus abouti que ce que dither_studio/dither_lab pratiquent pour leurs propres listes.

### 1.5 — Le panneau « Avant le live » est la meilleure idée du lot

Rien d'équivalent n'existe dans dither_studio ni dither_lab, et ça vaut la peine d'être noté comme
un pattern à propager plutôt que comme un simple détail de cet outil : une checklist à statut
(`ready` / `attention` / `blocking`, porté par `data-status` sur `.live-readiness`), chaque ligne
avec un titre, un détail en une phrase, et une action de remédiation directement inline (« Copier
l'URL OBS », « Revérifier »). L'apparition progressive de chaque ligne (`readiness-check-reveal`,
décalée par `--transition-stagger`, avec repli propre sous `prefers-reduced-motion`) transforme un
simple statut technique en un moment de confiance avant le direct — c'est le genre de détail qui
fait qu'un outil se sent conçu pour un humain sous pression (juste avant de streamer) plutôt que
pour un développeur qui débugge. À documenter comme pattern nommé si un futur outil de la famille a
besoin d'un même sas de vérification pré-vol.

### 1.6 — La sémantique d'accessibilité est prise au sérieux

`role="tablist"` sur `.workspaces` avec `aria-selected`, `aria-live="polite"` sur le panneau de
readiness, des `description` explicites sur les boutons de preset (« Essayer « Respiration » »,
« Ajouter Respiration à mes presets »), un `searchbox` correctement libellé. C'est un niveau de
soin sémantique supérieur à ce qu'on trouve dans dither_lab/dither_studio (qui restent corrects
mais plus minimalistes sur ce plan) — à conserver comme standard, pas à relâcher au prochain outil
sous prétexte que « c'est un outil solo ».

---

## 2. Ce qui casse l'illusion premium

### 2.1 — Des contrôles natifs non habillés, en plein milieu du système de design

Onglet **Habillage**, champ **Opacité** (`branding-tuner.html:550`) et case **Afficher sur ce
preset** (ligne 554) : ce sont un `<input type="range">` et un `<input type="checkbox">` bruts,
sans aucune règle CSS qui les rattache à la palette. Résultat vérifié à l'écran : le curseur et la
case s'affichent dans le bleu système de Chrome/Windows par défaut, au milieu d'une interface
entièrement noir/or. C'est le décrochage visuel le plus visible de toute la revue — l'œil le
repère immédiatement parce qu'il tranche avec la discipline chromatique du reste de l'écran.

Cause : `accent-color: var(--color-gold)` n'est posé que sur `.numeric-control input[type="range"]`
(`background-tuner.html:152`) — jamais sur `input[type="range"]` ou `input[type="checkbox"]` de
façon globale. Or c'est précisément la règle que dither_studio et dither_lab posent au niveau
élément (`accent-color: var(--accent)` appliqué sans restriction de classe, `style.css` des deux
projets) — un réflexe déjà acquis ailleurs dans la famille et qui a été perdu ici en cours de
route, probablement au moment où `.numeric-control` a été introduit pour les champs sliders+valeur
et où le champ Opacité (plus ancien, ou ajouté à part) n'a pas été migré dans ce even conteneur.

**Portée du problème :** `grep` ne remonte que ces deux champs comme non couverts, donc c'est
localisé — mais visible à chaque ouverture de l'onglet Habillage, qui est un onglet d'usage
courant (identité du stream), pas un cas de bord.

### 2.2 — Un champ « Opacité » moins fini que ses voisins directs

Tous les autres réglages numériques du tuner (Vitesse, Amplitude, Rayon maximum, Épaisseur des
ondes…) utilisent `.numeric-control` : slider + champ numérique + unité, en grille à trois
colonnes, avec une valeur toujours visible pendant qu'on glisse. Le champ **Opacité** est un
`<input type="range">` isolé, sans lecture de valeur affichée nulle part à côté — on ne sait pas à
combien on l'a réglé sans deviner à l'œil la position du curseur. Ce n'est pas un choix
délibérément plus sobre : c'est le seul champ du panneau qui n'a pas reçu le même traitement que
ses voisins immédiats, ce qui se voit d'autant plus qu'il est entouré de champs bien finis.

### 2.3 — Un token qui n'existe pas

`var(--color-bg-deep)` est utilisé à deux endroits — `dev/studio.html` (fond du `<body>` et de
l'`<iframe>`) et `dev/background-tuner.html` (fond de `.preset-thumb`) — mais **n'est défini nulle
part dans `tokens.css`**. Vérifié en direct : `getComputedStyle(document.documentElement)
.getPropertyValue('--color-bg-deep')` renvoie une chaîne vide dans le navigateur. La règle CSS ne
plante pas (elle retombe silencieusement sur `transparent`), donc l'effet visuel est aujourd'hui
invisible — la page a un fond sombre par ailleurs — mais c'est un token fantôme qui contredit
directement la règle 3 de `CLAUDE.md` (« Source de vérité design — toutes les variables visuelles
dans `tokens.css`. Jamais de valeur hardcodée dans un composant si un token existe »). Le nom
suggère un renommage incomplet de `--color-bg` (`#0A0A0C`, qui existe) vers une variante « deep »
qui n'a jamais été ajoutée — ou l'inverse. À trancher : soit ajouter le token, soit remplacer les
deux usages par `--color-bg`.

### 2.4 — Deux nombres à synchroniser à la main

`#sidebar { width: 340px }` et `#sidebar-toggle { left: 320px }` (`background-tuner.html:30,48`)
sont deux valeurs codées en dur qui doivent rester cohérentes pour que le bouton reste collé au
bord de la sidebar. Ça fonctionne aujourd'hui, mais rien ne rattache l'une à l'autre — changer la
largeur de la sidebar sans se souvenir de corriger le décalage du bouton produit un bug purement
visuel, invisible en lisant le code de la sidebar seule. Un `calc(var(--sidebar-width) - 20px)`
(ou équivalent) rendrait la dépendance explicite plutôt qu'implicite dans deux règles séparées.

### 2.5 — Le texte « dim » sert parfois de l'information opérationnelle

`.readiness-check-detail` (le texte explicatif sous chaque ligne du panneau « Avant le live », ex.
« 1 preset(s) personnel(s) relu(s) sans erreur ») et `#server-status` (état de connexion au
serveur d'état) utilisent tous deux `--color-text-dim`, soit 2.9:1 de contraste — sous le seuil AA
même pour du grand texte. Le palier « dim » est un choix de famille assumé (§1.1) pour du texte
d'ambiance secondaire ; le problème n'est pas le palier lui-même, c'est qu'il porte ici deux
informations qu'on a justement besoin de lire correctement — juste avant de partir en direct, et
pour savoir si la persistance des réglages fonctionne. Une piste ciblée plutôt qu'un relèvement
généralisé du contraste : remonter ces deux usages précis vers `--color-text-mid` (6.9:1),
laisser le reste du texte décoratif (hints, métadonnées de preset) tel quel.

### 2.6 — Une barre de navigation à un seul onglet, vestige du moteur retiré

`STUDIO_VIEWS` (`dev/studio.config.js`) ne contient plus qu'une entrée (« Fonds & presets ») depuis
le retrait du moteur de scènes le 2026-07-25. Le `<nav>` du Studio rend donc un unique bouton en
permanence actif, qui a toute l'apparence d'une barre d'onglets sans en avoir l'usage — un premier
regard s'attend à pouvoir choisir entre plusieurs vues. Ce n'est pas un bug, et l'infrastructure a
sans doute vocation à recevoir une deuxième vue plus tard (branding autonome ? scènes futures ?) —
mais tel quel, l'affordance promet un choix qui n'existe pas. Si le retour à plusieurs vues n'est
pas proche, un simple titre statique le temps qu'une deuxième entrée existe évite la fausse promesse ;
si une deuxième vue est prévue à court terme, un commentaire dans `studio.config.js` suffit à
signaler l'intention à qui relit le fichier.

---

## 3. Ce qui mérite de voyager dans l'autre sens

Cette revue partait de dither_lab/dither_studio vers overlay ; deux patterns d'overlay sont assez
aboutis pour mériter d'être portés vers un futur outil de la famille plutôt que d'être considérés
comme spécifiques à ce projet :

- **La checklist « avant le live »** (§1.5) — le principe générique (état à trois paliers +
  détail + action de remédiation inline + reveal chorégraphié) s'applique à tout outil avec une
  étape de « je m'assure que c'est prêt avant de m'en servir pour de vrai ».
- **Vignette figée par défaut, animée à la demande** (§1.4) — tout outil de la famille qui liste
  plusieurs presets/effets en parallèle devrait par défaut suivre cette règle plutôt que de
  laisser chaque aperçu tourner en continu.

---

## 4. Priorisation si une passe de correction est engagée

Par rapport visible / effort, du plus rentable au moins urgent :

1. **§2.1** — styler `input[type="range"]` et `input[type="checkbox"]` globalement (ou a minima
   les deux champs concernés) avec `accent-color: var(--color-gold)`, comme le font déjà
   dither_studio et dither_lab.
2. **§2.3** — trancher `--color-bg-deep` : ajouter le token à `tokens.css` ou remplacer ses deux
   usages par `--color-bg`.
3. **§2.5** — remonter `.readiness-check-detail` et `#server-status` à `--color-text-mid`.
4. **§2.2** — aligner le champ Opacité sur le pattern `.numeric-control` pour afficher sa valeur.
5. **§2.4** — dériver l'offset du bouton toggle de la largeur de la sidebar plutôt que deux
   valeurs indépendantes.
6. **§2.6** — décision produit plutôt que correctif : statique ou commentaire d'intention, selon
   qu'une deuxième vue du Studio est prévue à court terme ou non.
