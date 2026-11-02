---
created: 2026-10-30
updated: 2026-11-02
---

# Studio — l'éditeur de couches

Ce guide couvre la création d'une scène dans `dev/studio.html` : empiler des couches, les régler, les
placer, retrouver ses gestes, automatiser. Pour la mise en place d'OBS et le tuning d'un fond seul, voir
`tuner-le-fond.md`.

> Tout ce qui suit s'appuie sur la **palette de commandes** (`Ctrl+K`) : chaque action de l'éditeur y est
> listée avec son raccourci. En cas de doute, tapez ce que vous cherchez.

## 1. Une scène, ce sont des couches

Une scène empile jusqu'à 8 couches : des **effets** (pluie, bulles, grille de points…) et, au-dessus, la
couche d'**identité** (le branding, unique). Le panneau « Couches » liste la pile, la plus haute en premier.

- **Ajouter** : bouton « + Ajouter », ou la palette (« Ajouter : Bubble »).
- **Sélectionner** : clic ; dans la pile, `Ctrl` + clic ajoute une couche et `Maj` + clic prend une plage ; `Ctrl+A` pour tout ; `Échap` pour rien.
- **Ordre** : `Ctrl+]` / `Ctrl+[` d'un cran, `Ctrl+Maj+]` / `Ctrl+Maj+[` tout devant / tout derrière.
- **Afficher / masquer** : `Ctrl+Maj+H`. Une couche masquée n'est pas dessinée du tout (elle ne coûte rien
  dans OBS). **Verrouiller** : `Ctrl+Maj+L`. **Isoler** : « Isoler dans l'aperçu » montre une couche seule
  sans rien changer à la scène.
- **Dupliquer** `Ctrl+D`, **supprimer** `Suppr`, **copier / couper / coller** `Ctrl+C / X / V` (y compris
  d'une scène à l'autre), **copier / coller le style** `Ctrl+Alt+C / V`.

### Effets et contenus

Une couche est un **effet de fond** (pluie, bulles, étoiles…) ou un **contenu** posé dans la scène. Le bouton **Ajouter** propose
les deux. Le contenu **Forme** pose un rectangle (coins arrondis au choix), une ellipse, un triangle, un losange ou une ligne, en couleur
unie ou en dégradé, avec contour et ombre ; elle remplit la zone de sa couche, donc redimensionner la couche redimensionne la
forme. Le contenu **Texte** affiche un titre, un pseudo ou un message : une ligne par ligne, police (serif, sans, mono,
display, le nom d'une police installée sur l'ordinateur, ou une **police importée** dans la médiathèque), taille, gras, italique, majuscules, couleur, alignements, interligne, espacement, contour et ombre. Par défaut, le
texte **rétrécit pour tenir dans la zone de sa couche** (réglage « Ajustement à la zone ») et passe à la ligne tout seul ; placez et
redimensionnez la couche comme n'importe quelle autre. Un contenu arrive et part avec sa scène, contrairement au branding qui
reste en place d'une scène à l'autre.

### La médiathèque : images et polices

Le contenu **Image** pose un logo, une affiche, une photo. Ses images sont rangées dans la **médiathèque** (fenêtre ouverte par
« Image » dans le bouton Ajouter, par la palette `Ctrl+K` → « Ouvrir la médiathèque », ou par le bouton « Médiathèque… » du réglage
d'une couche image). Importez des PNG, JPEG, GIF ou WebP avec « Importer des images… » ou en les **glissant sur l'aperçu** : chaque
image devient une couche, à sa proportion, centrée. Une même image importée deux fois n'est gardée qu'une fois. Les images restent
sur votre ordinateur, à côté du fichier d'état.

- La médiathèque garde aussi des **polices** (WOFF2, WOFF, TTF, OTF, 5 Mo au plus) : le réglage « Police importée » d'un texte les propose, et elles
  voyagent avec la scène dans un export, ce que la police installée ne fait pas. Elles se montrent par un échantillon écrit dans leur propre police.
- La médiathèque garde aussi les **fichiers d'une couche Code** : scripts `.js` / `.mjs` (5 Mo au plus, texte UTF-8) et modèles 3D `.glb` ; ils se montrent par une étiquette « JS » ou « 3D ».
- Limites : 15 Mo et 25 millions de pixels par image ; le SVG n'est pas accepté. Un fichier qui n'est pas vraiment une image est refusé,
  quel que soit son nom.
- Le réglage **Cadrage** choisit entre contenir (toute l'image), couvrir (la zone est remplie, l'image est rognée) et étirer.
- **Exporter** emporte les images que vos scènes utilisent ; **Importer** les range dans la médiathèque avant les scènes. Une
  scène avec ses images se transporte donc d'un ordinateur à l'autre en un seul fichier (si une image manque à l'export, le Studio
  le dit).
- Une image **utilisée** par une scène ne se supprime pas : retirez-la d'abord des couches. Si une image manque (dossier copié sans
  elle), le diagnostic le signale et la couche affiche « (image manquante) » : importez-la à nouveau et choisissez-la.

### Écrire du code : la couche Code

La couche **Code** exécute du **HTML, du CSS et du JavaScript** que vous écrivez ou importez : animations CSS riches, canvas, WebGL, et une
bibliothèque 3D comme three.js. Elle s'ajoute comme les autres (« + Ajouter › Code ») et se place comme un contenu ; elle arrive et part avec sa scène, et **la page
repart de zéro à chaque arrivée de scène** (une animation d'entrée se rejoue).

- **Trois zones de code** : HTML (le corps de la page), CSS, JavaScript. Le JavaScript est un **module** : `import`, `await` de premier niveau. Un changement de code recharge la
  page après une courte pause ; un réglage ne la recharge pas.
- **Réglages exposés** : une liste JSON décrit les réglages que le Studio présente comme des champs (`number`, `text`, `color`, `boolean`, `select`) :
  `{ "key": "taille", "label": "Taille", "type": "number", "default": 120, "min": 20, "max": 400, "step": 1 }`. Chaque réglage est une variable CSS
  `var(--param-<clé>)` et se lit dans `overlay.params`. Une déclaration invalide ne casse rien : le défaut est dit sous le champ, en direct.
- **Réglages animés** : un réglage `number` qui déclare **`min` et `max`** s'anime comme n'importe quelle valeur de la couche : choisissez « Réglage : … » dans la liste de la
  timeline (images clés) ou d'une liaison (le son, une alerte). Le code reçoit chaque valeur par `overlay.on("params", …)` et dans `var(--param-<clé>)`, sans rechargement de la page.
  Si la timeline et une liaison visent le même réglage, la liaison l'emporte ; retirer la piste rend la valeur réglée à la main. Les autres types de réglage ne s'animent pas.
- **Ce que le code reçoit** : `overlay.params` (réglages), `overlay.size` (largeur et hauteur **en pixels de la source de référence**, comme le texte : 96 px de CSS font
  96 px de la source quelle que soit la résolution d'OBS), `overlay.pixelRatio`, `overlay.levels` (le son : `level`, `bass`, `mid`, `treble`, si « Réagit au son » est coché),
  `overlay.on("params" | "levels" | "alert" | "resize", fonction)` et `overlay.assetUrl(id)`. Les variables CSS `--audio`, `--audio-bass`, `--audio-mid`, `--audio-treble` suivent le son ;
  une alerte pose la classe `alert-follow`, `alert-sub`, `alert-raid` ou `alert-bits` sur la page pendant 3 s (ce qui relance une animation CSS), et arrive à `overlay.on("alert", …)` avec
  `type`, `username` et `amount`. Une alerte qui arrive pendant le chargement de la page est gardée quelques secondes, puis remise.
- **Fichiers** : le bouton **Insérer un fichier…** écrit `asset:<identifiant>` à l'endroit du curseur. Tout fichier de la médiathèque s'y référence : image (`<img src="asset:…">`,
  `url(asset:…)`), police, **script** `.js` ou `.mjs` (`import * as THREE from 'asset:…'`), **modèle 3D** `.glb`. Ces fichiers **voyagent dans un export** et ne se suppriment plus tant que le code les référence.
  Pour three.js, importez son fichier `three.module.min.js` dans la médiathèque (rien n'est livré avec le Studio) et chargez-le comme ci-dessus.
- **Erreurs** : une erreur du code apparaît sous le champ JavaScript, avec sa ligne dans votre code.
- **Isolement** : le code tourne dans une page isolée. Il ne voit ni le Studio, ni ses fichiers, ni Internet : il ne peut lire que la médiathèque. Une scène **importée** qui contient du code demande une
  case cochée avant d'être importée : n'importez que ce dont vous connaissez l'auteur. Détail et limites : `docs/security.md`.
- **Aperçu** : une couche Code n'a pas de vignette (pictogramme à la place). Le reste de la scène est inchangé.

### Écrire un shader : la couche Shader

La couche **Shader** calcule chaque pixel de sa zone par la carte graphique, à partir d'un petit programme GLSL : plasma, vagues, grilles, champs de bruit, dégradés vivants.
C'est le moyen le plus léger d'obtenir un fond génératif, bien plus qu'une couche Code qui ouvre une page entière. Elle s'ajoute comme les autres (« + Ajouter › Shader »).

- **Le programme** est écrit comme sur Shadertoy : `void mainImage(out vec4 fragColor, in vec2 fragCoord)`. Un code copié de Shadertoy marche presque tel quel (`iResolution`, `iTime`, `iMouse` existent).
  `fragCoord` et `uResolution` sont en pixels de la **source de référence** (1920×1080 pour une zone pleine), quelle que soit la résolution d'OBS. La couleur rendue n'est pas prémultipliée : écrivez `vec4(couleur, opacité)`.
- **Ce que le shader reçoit** : `uTime` (secondes), `uAudio` (niveau, graves, médiums, aigus, si « Réagit au son » est coché), `uAlert` (secondes depuis la dernière alerte : `exp(-uAlert * 2.0)` donne un éclair à chaque alerte)
  et un `u_<clé>` par réglage déclaré (nombre, case et liste en `float`, couleur en `vec3`). Les réglages se déclarent en JSON comme pour une couche Code ; un texte n'est pas transmis.
- **Erreurs** : le compilateur les dit sous le champ, avec la ligne de **votre** code. Tant que le programme ne compile pas, **le dernier programme valide reste à l'antenne** : vous pouvez taper sans l'éteindre.
- **Qualité de rendu** : « Moitié » et « Quart » calculent moins de pixels puis étirent le résultat, sans changer la composition. C'est le levier à tourner si la carte graphique peine en direct.
- **Animer** : un réglage `number` qui déclare `min` et `max` s'anime comme pour une couche Code (timeline ou liaison, « Réglage : … »).
- **Attention** : un shader trop lourd (une boucle sans fin, un calcul démesuré) peut figer l'affichage de tout l'ordinateur. Essayez-le en « Quart » d'abord. Une scène importée qui en contient demande une case cochée.
  Pas de vignette pour cette couche (pictogramme à la place).

### Faire réagir une couche (liaisons)

La section **Animation** de l'inspecteur lie une couche au **son** ou aux **alertes** (follow, sub, raid, bits, ou toute alerte). Une liaison
dit : quelle source, quelle valeur de la couche elle pilote (échelle, opacité, rotation, flou, position, ou un réglage numérique d'une couche Code), la valeur **au repos** (« De ») et celle
quand la source est **au maximum** (« À »). Exemples :

- *Un titre qui paraît à chaque raid* : source « Alerte raid », valeur « Opacité », de 0 à 1, retombée 1 500 ms. Au repos le titre est invisible ;
  au raid il apparaît, puis s'efface en ralentissant.
- *Un logo qui pulse au rythme du son* : source « Niveau sonore » (ou « Graves »), valeur « Échelle », de 1 à 1,2, lissage 80 ms.

Quatre liaisons au plus par couche, une par valeur. Le bouton « Tester une réaction » (Follow, Sub, Raid, Bits) permet de les essayer sans
attendre une vraie alerte. Une liaison au son demande le micro, comme les effets réactifs.

## 2. Régler une couche

Sélectionnez une couche : le panneau de droite montre son **opacité**, son **rendu**, sa **position et sa taille** et les
**réglages de son effet**.

- Position et taille se lisent en **%** de la toile ou en **px** de la source OBS (boutons `%` / `px`).
  Le cadenas lie les proportions.
- **Rendu** : **Fusion** (Normal, Produit, Superposition claire, Incrustation), **Rotation** (−180° à 180°, autour du
  centre de la couche), **Flou** (0 à 12 px de la source) et **Rognage** (jusqu'à 90 % par côté). Ces réglages
  ont été mesurés dans OBS : ils ne font pas descendre la scène sous 60 images par seconde. « Réinitialiser » les retire.
  Le mode de fusion ne mélange que les couches de la scène entre elles : la page ne voit pas les sources OBS
  situées dessous (à vérifier dans OBS).
- **Valeurs au glisser** : glissez sur l'étiquette d'un champ numérique (« X », « Opacité »…) pour régler la
  valeur. `Maj` va dix fois plus vite, `Alt` dix fois plus fin, `Échap` rend la valeur d'avant. Dans un champ,
  `Maj+↑↓` et `Alt+↑↓` font de même. Un glisser entier est **un seul** pas d'historique.

## 3. Placer sur l'aperçu

L'aperçu se manipule directement : clic pour sélectionner (`Maj` + clic ajoute ou retire une couche), glisser pour déplacer
(`Maj` verrouille l'axe), poignées pour redimensionner (`Maj` garde les proportions, `Alt` part du centre),
rectangle de sélection, flèches pour ajuster d'un pixel de référence (`Maj` : dix).

- **Aimantation** avec repères sur les bords, le centre, les marges et les autres couches ; « Basculer
  l'aimantation » la coupe, et `Ctrl` maintenu pendant un geste la suspend.
- **Grille**, **règles**, **zones de sécurité** : barre de vue de l'aperçu, ou la palette.
- **Zoom** `+` / `-` ou `Ctrl` + molette, **ajuster** `0`, déplacement de la vue en glissant avec la barre d'espace.
- Une couche **plein cadre** ne peut pas bouger : réduisez-la d'abord.
- **Alignement et répartition** : commandes « Position : … » de la palette, sur plusieurs couches.

## 4. Brouillon, publication, antenne

Vos modifications forment un **brouillon** : l'antenne (ce que voit OBS) ne change que quand vous publiez.

- `Ctrl+B` : **avant / après**, l'aperçu bascule sur l'antenne le temps de la comparaison.
- « Voir les changements avant de publier » : récapitulatif couche par couche.
- « Tester la transition d'arrivée » : rejoue l'arrivée de la scène dans l'aperçu, sans toucher l'antenne.
- `Ctrl+Entrée` : **publier**. « Abandonner le brouillon » revient à l'antenne.
- Le bouton **Historique** de l'en-tête liste les états qui ont quitté l'antenne et permet d'en remettre un
  (avec confirmation, car cela agit en direct).

### Le rendu OBS, à côté de l'aperçu

Le bouton « Rendu OBS » de la barre de vue ouvre une fenêtre qui charge **la vraie page de rendu**
(`background.html`, celle de la Browser Source) et montre l'**antenne** en direct. L'aperçu d'édition montre le
brouillon ; cette fenêtre montre ce que reçoit OBS par le chemin exact d'OBS : tout écart entre les deux se voit.
Elle affiche aussi le nombre de **sources OBS réellement connectées** (la fenêtre elle-même ne compte pas parmi
elles). Fermée, la page est déchargée et ne coûte rien.

### Ce que coûte chaque couche

Chaque effet affiche dans la pile le temps que prend son dessin à chaque image, et l'en-tête de la pile donne le
total de la scène. Vert/neutre : léger ; or : à surveiller ; rouge : une seule couche prend plus de 30 % du budget
d'une image à 60 i/s. Une couche masquée est signalée « aucun coût ». C'est une mesure **relative prise dans le
Studio** : elle dit quelle couche pèse, pas ce que fera OBS — vérifiez dans OBS avant de charger une scène.

### Animer une scène (timeline)

Le panneau **Timeline**, sous l'aperçu, fait **jouer** la scène : elle démarre à son arrivée dans OBS et peut tourner en boucle.

1. Sélectionnez une couche, dépliez « Images clés », choisissez la valeur à animer (opacité, rotation, flou, échelle, position, ou un réglage numérique de votre code — voir « Écrire du code »).
2. Placez le **repère** (le curseur, ou un clic dans une piste), puis « + Image clé » : la clé prend la valeur actuelle, rien ne change encore.
3. Réglez-la (valeur, instant, courbe), placez le repère plus loin, posez une seconde clé : la valeur évolue entre les deux, selon la **courbe** de la
   première (linéaire, départ lent, arrivée lente, ou palier).
4. Glissez les losanges pour caler le rythme (flèches : 10 ms, `Maj` : 100 ms). Se placer dans le temps met en pause : l'aperçu montre cette image.
5. Réglez la **durée** de la scène et la **boucle**, puis publiez : la page d'OBS joue l'animation depuis l'arrivée de la scène.

6. **Rejouer sur une alerte** : cochez, dans le panneau, les alertes qui relancent l'animation (« Alerte raid », « Alerte follow »… ou « Toute alerte »). À leur arrivée, la scène repart du début
   et se remet à jouer, même si elle était arrivée à sa fin : un raid rejoue l'entrée du titre. Décochez tout pour que l'animation ne se joue qu'à l'arrivée de la scène.
   Cela vaut pour toute la scène (et donc aussi pour les réglages animés d'une couche Code ou Shader).

Exemple : un titre qui arrive. Opacité de 0 à 1 entre 0 et 0,8 s, et décalage vertical de +8 % à 0 sur le même intervalle. Si une **liaison** (son, alerte)
vise la même valeur, c'est elle qui l'emporte : la réaction en direct passe devant le scénario.

### Les versions d'une scène

Une version est un **point de restauration que vous nommez** : « avant le gros changement », « version stream du vendredi ».

- **Enregistrer** : le bouton marque-page, en haut de la pile de couches (ou `Ctrl+K` → « Enregistrer une version de la scène… »), garde la scène
  **telle qu'elle est dans le brouillon**, réglages non publiés compris, sous le nom que vous choisissez.
- **Restaurer** : remet les couches et la transition dans le brouillon, en **une seule entrée d'historique**. Un `Ctrl+Z` revient à la scène d'avant, et
  **rien n'est publié** tant que vous ne le décidez pas. Le nom, l'identité et les étiquettes de la scène ne changent pas.
- **Lire avant de restaurer** : chaque version affiche sa date, son contenu et ce que sa restauration changerait (« retire 1 couche par rapport à
  la scène en cours », « identique à la scène en cours »).
- **Gérer** : on renomme sur place (Entrée valide, Échap annule) et on supprime en deux pressions. Trente versions par scène au plus ; au-delà, rien
  n'est jamais supprimé à votre place : on vous dit d'en retirer une.

**Ce que ce n'est pas.** L'historique de publication se remplit tout seul et ne garde que les scènes qui ont quitté l'antenne. Une version, c'est un
point que vous posez et qui reste jusqu'à ce que vous le supprimiez.

## 5. L'historique d'édition

Le bouton horloge de la pile (ou « Historique d'édition… » dans la palette) liste **toutes les étapes de
travail** de la scène : ce que chacune a changé, depuis quand.

- **Comparer** dit ce qu'un retour à cette étape changerait par rapport à maintenant.
- **Revenir ici** y va en un geste ; les étapes suivantes restent grisées et rétablissables, tant que vous ne
  modifiez rien d'autre. `Ctrl+Z` / `Ctrl+Maj+Z` restent disponibles à tout moment.

## 6. Modèles de couches

Pour réutiliser un ensemble de couches (réglages, opacités et placements compris) :

1. sélectionnez les couches ;
2. « Enregistrer la sélection comme modèle… », donnez un nom ;
3. dans une autre scène, « Modèles de couches… » → **Insérer** (un seul pas d'historique).

Les modèles sont rangés **sur le serveur** : ils suivent d'un navigateur à l'application de bureau. Une couche
d'identité déjà présente dans la scène est ignorée à l'insertion (et l'insertion le dit).

## 7. Commandes personnalisées et macros

« Gérer les commandes personnalisées » ouvre le gestionnaire.

- **Créer** une commande : un nom, un raccourci capturé au clavier (jamais une combinaison réservée au
  navigateur ni déjà prise : le motif est affiché), des étapes ordonnées.
- **Enregistrer une macro** : faites ce que vous voulez refaire, puis « Terminer ». L'enregistrement capte les
  **commandes** (palette, raccourcis, menu clic droit) **et les gestes directs** (opacité, position, réglages
  d'effet, ajouts…) ; les réglages successifs d'une même chose ne font qu'une étape.
- Une étape geste s'applique à **la sélection du moment**, jamais aux couches de l'enregistrement. Ses valeurs
  se corrigent dans l'éditeur de la commande. Un geste qui ne se rejoue pas d'une sélection à l'autre
  (alignement par couche) est signalé dans la barre d'enregistrement : utilisez alors la commande.
- Une commande s'exécute en **un seul pas d'historique**. Sans sélection, elle explique ce qui manque.
- **Importer / exporter** en JSON ; un import ne remplace jamais une commande existante en silence.

## 7 bis. Être prévenu d'un incident

Pendant un live, OBS est devant vous, pas le Studio. Si le **serveur d'état**, **OBS** ou la **page de rendu** est perdu (deux relevés de suite, 10 s), le Studio
le dit : la ligne d'état passe en erreur, le titre de l'onglet porte « ⚠ », et le retour à la normale est dit aussi. Le bouton **Alertes système** du bandeau
« Antenne » ajoute une **notification du système** (le navigateur vous demande l'autorisation une fois) quand le Studio n'est pas visible. Rien ne change
dans le rendu d'OBS : le fond continue de se figer plutôt que d'afficher une erreur ; c'est le Studio qui vous prévient.

## 7 ter. Réglages : OBS, Twitchat et alertes reçues

Le bouton **Réglages** du bandeau « Antenne » (ou `Ctrl+K` → « Réglages ») ouvre la connexion à OBS. Saisissez le mot de passe d'OBS (Outils → Paramètres du serveur WebSocket) :
le champ est masqué, le bouton **Afficher** montre ce que vous tapez (il se remasque seul à l'enregistrement et à la fermeture). **Enregistrer et connecter** reconnecte aussitôt, sans
relancer les serveurs, et la fenêtre dit où en est la connexion : en cours, connecté (avec le nombre de scènes), mot de passe refusé, ou OBS injoignable. Une fois enregistré,
le mot de passe ne s'affiche plus nulle part : le champ dit « enregistré — laissez vide pour le garder ». **Effacer le mot de passe** déconnecte. L'adresse (`ws://127.0.0.1:4455` par défaut) se change dans le même écran.

### Relier Twitch (alertes réelles)

Le Studio reçoit directement les follows, subs, raids et bits de votre chaîne par **EventSub**, sans passer par Twitchat. À faire une fois :

1. Créez une application sur dev.twitch.tv/console (type **Public**) et copiez son **identifiant client** (il n'est pas secret).
2. **Réglages › Twitch** : collez-le, **Enregistrer**, puis **Connecter Twitch**. Twitch donne un **code** : ouvrez le lien affiché, tapez le code, autorisez les trois permissions demandées.
3. Le Studio passe à « Connecté en tant que … : 6 abonnements actifs » et se **reconnecte seul** ensuite (démarrage, coupure réseau, reprise de session demandée par Twitch). Le Studio ne voit jamais votre mot de passe Twitch ; les jetons restent sur cet ordinateur et ne s'affichent nulle part.

Un abonnement offert à vingt personnes donne **une** alerte (celle du donateur). Si l'autorisation est retirée sur Twitch, ou après 30 jours sans lancer les serveurs, le Studio le dit et propose « Reconnecter Twitch ». Les étapes détaillées, avec les messages d'erreur et leur remède : [`docs/procedures-owner.md`](../procedures-owner.md).

### Relier Twitchat

Twitchat est une page web qui se connecte, en **client WebSocket**, à l'adresse que vous lui donnez, et dont les **triggers** envoient le message que vous écrivez. Le Studio est le serveur.

1. Dans **Réglages › Twitchat**, **Copier** l'adresse (elle est masquée parce qu'elle contient un jeton secret ; **Afficher** la montre).
2. Dans Twitchat, collez-la dans le paramètre WebSocket (section des connexions) et connectez. Le Studio passe à « Twitchat est connecté ». Si Twitchat ne demande qu'un hôte et un port, le Studio vous les donne
   (`127.0.0.1`, le port du serveur, sans connexion sécurisée) : cochez alors « jeton dans le message » avant de copier le modèle.
3. Dans Twitchat, créez un **trigger par alerte** (nouveau follow, abonnement, raid, bits) avec l'action **WebSocket**. Choisissez le type dans le Studio, **Copier le modèle de message**, collez-le comme payload du trigger.
   Les `{USER}`, `{VIEWERS}`, `{BITS}` sont des placeholders de Twitchat : remplacez-les au besoin par ceux que son sélecteur propose.
4. Déclenchez le test du trigger dans Twitchat : l'alerte apparaît dans **Alertes reçues** (avec sa source), et la page d'OBS réagit comme à un test du Studio.

Si rien n'arrive, le statut dit pourquoi (« Dernier problème : … ») : jeton manquant, JSON invalide, type d'alerte inconnu. **Régénérer le jeton** coupe Twitchat et invalide l'ancienne adresse (à recoller). Au plus 20 alertes par tranche de 5 s sont relayées : un trigger qui boucle ne noie pas OBS, et le Studio compte celles qu'il a ignorées.

**Format du message** : `{"type": "follow" | "sub" | "raid" | "bits", "username": "…", "amount": …}`. Le montant peut arriver en texte (`"25"`), c'est ce que fait Twitchat.

## 8. Vos réglages vous suivent

Commandes personnalisées, modèles, unité de position, aides de vue : tout est rangé **sur le serveur d'état**
(clé `studio` du fichier d'état), pas dans le navigateur. L'indicateur de l'en-tête dit l'état :

| Indicateur | Sens |
|---|---|
| « Réglages enregistrés » | tout est sur le serveur |
| « Enregistrement des réglages… » | un envoi est en cours (quelques instants après un changement) |
| « Réglages non enregistrés — nouvel essai en cours » | le serveur ne répond pas ; vos changements sont gardés dans ce navigateur et partiront dès son retour |

Au premier lancement après la mise à jour, les anciens réglages du navigateur sont **repris une fois** si le
serveur est vide ; un serveur déjà rempli n'est jamais écrasé.

## 9. Raccourcis à retenir

| Geste | Raccourci |
|---|---|
| Palette de commandes | `Ctrl+K` |
| Aide des raccourcis | `?` |
| Annuler / rétablir | `Ctrl+Z` / `Ctrl+Maj+Z` |
| Copier / couper / coller | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` |
| Dupliquer / supprimer | `Ctrl+D` / `Suppr` |
| Avant / après | `Ctrl+B` |
| Publier | `Ctrl+Entrée` |
| Zoom / ajuster | `+` `-` / `0` |

## Si quelque chose ne va pas

- **Le Studio ne se connecte pas** : le serveur d'état est arrêté ; relancez-le depuis l'en-tête
  (« Redémarrer ») ou `dev/start-stream.js`.
- **« Réglages non enregistrés » reste affiché** : le serveur est injoignable ou trop ancien pour la route
  `/studio-settings` ; redémarrez-le. Rien n'est perdu entre-temps.
- **Un modèle ne s'insère pas** : le message dit pourquoi (limite de 8 couches, par exemple).
