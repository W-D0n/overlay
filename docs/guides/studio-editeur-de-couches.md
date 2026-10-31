---
created: 2026-10-30
updated: 2026-10-31
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
display), taille, gras, italique, majuscules, couleur, alignements, interligne, espacement, contour et ombre. Par défaut, le
texte **rétrécit pour tenir dans la zone de sa couche** (réglage « Ajustement à la zone ») et passe à la ligne tout seul ; placez et
redimensionnez la couche comme n'importe quelle autre. Un contenu arrive et part avec sa scène, contrairement au branding qui
reste en place d'une scène à l'autre.

### La médiathèque et les images

Le contenu **Image** pose un logo, une affiche, une photo. Ses images sont rangées dans la **médiathèque** (fenêtre ouverte par
« Image » dans le bouton Ajouter, par la palette `Ctrl+K` → « Ouvrir la médiathèque », ou par le bouton « Médiathèque… » du réglage
d'une couche image). Importez des PNG, JPEG, GIF ou WebP avec « Importer des images… » ou en les **glissant sur l'aperçu** : chaque
image devient une couche, à sa proportion, centrée. Une même image importée deux fois n'est gardée qu'une fois. Les images restent
sur votre ordinateur, à côté du fichier d'état.

- Limites : 15 Mo et 25 millions de pixels par image ; le SVG n'est pas accepté. Un fichier qui n'est pas vraiment une image est refusé,
  quel que soit son nom.
- Le réglage **Cadrage** choisit entre contenir (toute l'image), couvrir (la zone est remplie, l'image est rognée) et étirer.
- **Exporter** emporte les images que vos scènes utilisent ; **Importer** les range dans la médiathèque avant les scènes. Une
  scène avec ses images se transporte donc d'un ordinateur à l'autre en un seul fichier (si une image manque à l'export, le Studio
  le dit).
- Une image **utilisée** par une scène ne se supprime pas : retirez-la d'abord des couches. Si une image manque (dossier copié sans
  elle), le diagnostic le signale et la couche affiche « (image manquante) » : importez-la à nouveau et choisissez-la.

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
