---
created: 2026-10-31
updated: 2026-10-31
---

# Spec — Couches de contenu (texte, forme, image)

Statut : **livré** : texte, forme, image, export avec images, police installée et **polices importées** (§7). Fait suite à l'audit produit du 2026-10-31 : le Studio n'avait que
11 effets de fond et le branding, aucun moyen de poser un titre, un cadre, un logo ou une affiche. Cadrage d'origine :
`studio-cadrage.md` (gestion d'assets, sources de données). Étape 6 de `scene-doc-etape-6.md` : le modèle de couche (placement,
opacité, rendu étendu 6d, historique, gestes, modèles) est réutilisé tel quel.

## 1. Décisions

| # | Décision | Raison |
|---|---|---|
| C1 | Trois nouveaux types de couche, **famille « contenu »** : `text`, `shape`, `image`. `layer-kinds.js` porte `content: true` ; `kindFamily(id)` donne `effect`, `content` ou `identity`. | Ni effets de fond (absents des listes d'effets, de la charge de test, du banc OBS) ni identité (le branding est global et reste au-dessus des transitions). |
| C2 | Un contenu **vit dans la pile avec les effets**, librement ordonné entre eux, sous le branding ; il arrive et part avec sa scène. | Un titre « BRB » appartient à la scène « BRB ». |
| C3 | Les contenus sont dessinés sur **canvas**, comme les effets, par le même squelette (`canvas-layer.js`). | Une seule chaîne de rendu : échelle de la source, vignettes (photo de canvas), pastille de coût, aperçu OBS identique, texte net à toute résolution. |
| C4 | Squelette **statique** : `animated: false`. Une couche statique ne dessine qu'à la création, au changement de taille ou de ratio, et sur `host.invalidate()`. | Huit contenus ne coûtent aucun dessin par image. |
| C5 | Un changement de type reste **dans sa famille** (`setLayerKind`) ; le sélecteur « Type » de la couche réglée ne propose que sa famille. | Un effet ne devient pas un texte. |
| C7 | Un contenu dessine à l'**échelle de la scène** (`sceneScaled`, `environment.sceneHeight` fournie par le moteur), pas à celle de sa couche : sa zone est une fenêtre. 96 px de texte font 96 px de la source de référence dans une zone de 20 % comme de 100 %. Les effets gardent l'échelle de leur couche (un calque réduit montre une version réduite). | Trouvé en regardant le rendu des points de départ : à l'échelle de la couche, un titre de 150 px dans une zone de 24 % de haut s'affichait quatre fois trop petit. Gardé par `components/canvas-layer.test.js` et l'essai `21-couche-texte`. |
| C6 | Les noms de réglage sont propres au type (`fontSize`, pas `size`) : `NUMBER_FIELD_GUIDANCE` est indexé par nom de champ, partagé par tous les types. | Évite qu'un champ prenne les bornes d'un effet. |

## 1 bis. Points de départ à contenu

Trois scènes prêtes à l'emploi dans la bibliothèque (`dev/builtin-background-presets.js`) : **Début de live** (étoiles, titre, filet doré, sous-titre), **Je reviens** (ondes, panneau en dégradé à coins arrondis, message), **Fin de live** (grille de points, remerciement en italique, « À bientôt »). Elles servent de modèles : on change le texte et la scène est à soi.

## 2. Texte (livré)

Type `text`, `components/TextLayer.js`, mise en page pure dans `components/text-layout.js` (sans canvas ni DOM, testée avec une
police factice), données dans `components/text-layer.config.js`.

Réglages : texte (une ligne par ligne), police (`serif`, `sans`, `mono`, `display` : les tokens `--font-*` de `tokens.css`, repli dans
le config) ou **police installée** par son nom (« Bebas Neue » : OBS tourne sur le même ordinateur, il voit ses polices ; la famille choisie sert
de repli, et une police introuvable est signalée dans la console, une fois, sans casser le rendu ; le nom est assaini, rien ne sort de la pile CSS), taille, gras, italique, majuscules, couleur, alignement horizontal et vertical, interligne, espacement des lettres,
**ajustement à la zone**, retour à la ligne automatique, contour (taille, couleur), ombre (flou, décalage X et Y, couleur).

**Limites devenues fonctions :**
- Un texte qui déborde de sa zone → « Ajustement : réduire » (défaut) : la plus grande taille qui tient (recherche dichotomique),
  jamais sous 4 px ; « aucun » garde la taille réglée.
- Un mot plus large que la zone → coupé aux lettres, sans boucle.
- Le contour réserve de la place des deux côtés : il n'est jamais rogné par le bord de la couche.
- Des options invalides ou partielles (fichier ancien, import) → défauts du schéma, nombres bornés : le texte ne casse jamais le rendu.

Réserve : l'espacement des lettres décale un peu le centrage (le canvas compte l'espace après la dernière lettre). La police est une
police système ; les polices importées arrivent avec la gestion d'assets (§4).

## 3. Forme (livrée)

Type `shape`, `components/ShapeLayer.js`, géométrie pure dans `components/shape-geometry.js`. Formes : rectangle (rayon des coins
réglable), ellipse, triangle, losange, ligne. Remplissage uni, **dégradé linéaire** (seconde couleur, angle) ou aucun (contour seul),
contour (épaisseur, couleur), ombre. La forme remplit la zone de la couche : la redimensionner redimensionne la forme.

**Limites devenues fonctions :** le contour est tracé à l'intérieur de la zone (jamais rogné par le bord) ; le rayon des coins ne
dépasse jamais la moitié du plus petit côté ; un contour plus épais que la zone ne laisse aucune forme (rien n'est peint, pas d'erreur) ;
le dégradé couvre exactement la zone, du coin au coin opposé, quel que soit l'angle ; une ligne prend la couleur et l'épaisseur du contour.
Les options valides partagent `components/kind-options.js` avec le texte (défauts, types et bornes lus du schéma : aucune table à tenir).

## 4. Image et médiathèque (livrées)

**Magasin** (`dev/asset-store.js`, format et limites dans `dev/asset-format.js`, routes dans `dev/asset-routes.js`) : les images sont des
fichiers adressés par le début de l'empreinte SHA-256 de leur contenu, dans `<fichier d'état>.assets/`, avec un index lisible.
Importer deux fois la même image donne le même asset ; le contenu d'un identifiant ne change jamais, donc il est servi avec un
cache sans limite. Écritures par fichier temporaire renommé, sérialisées ; un index illisible n'est jamais écrasé en silence.

| Route | Rôle |
|---|---|
| `GET /assets` | la liste, avec le nombre d'usages de chaque image dans le fichier d'état |
| `POST /assets?name=` | importe (corps = le fichier) : 201, 400 si ce n'est pas une image acceptée, 413 si trop lourde |
| `GET /assets/<id>` | sert le fichier (type reconnu, `immutable`, accès entre origines pour que le canvas reste lisible) |
| `DELETE /assets/<id>` | refusé (409) tant qu'une scène, un brouillon ou l'historique de publication la référence |

**Limites devenues fonctions :**
- Un fichier renommé ou mal déclaré n'est pas une image : le type vient de l'en-tête (PNG, JPEG, GIF, WebP) ; le SVG est refusé.
- Une image démesurée est refusée **avant** d'être décodée (dimensions lues dans l'en-tête ; 25 millions de pixels au plus) : une image de
  100 000 × 100 000 px ne peut pas figer OBS.
- Une image supprimée alors qu'une scène la montre : impossible (serveur : usages dans le fichier ; Studio : usages dans la scène en
  cours d'édition, que le serveur ne connaît pas encore). Si elle manque quand même (dossier copié sans elle), le **diagnostic**
  (`Images des scènes`) le dit et le formulaire de la couche affiche « (image manquante) ».
- Une image qui ne se charge pas n'affiche rien (jamais l'ancienne), avec un avertissement ; pendant le chargement d'une autre image,
  l'ancienne reste affichée : pas de trou à l'antenne.
- Une image déposée arrive **à sa proportion**, à sa taille naturelle, ramenée à 80 % de la toile au plus, centrée (`placementForImage`).

**Studio :** médiathèque (`dev/asset-library-controller.js`, fenêtre `#asset-library`) : import par bouton, plusieurs fichiers à la fois,
ou glisser-déposer ; cartes avec miniature, nom, dimensions, poids, usages ; suppression en deux pressions. « Image » dans la
galerie d'ajout (ou la palette) ouvre la médiathèque en mode choix. Déposer des fichiers sur l'aperçu les importe et en fait des
couches. Le formulaire d'une couche image liste les images (« Médiathèque… » pour en importer).

**Type `image` :** cadrage contenir / couvrir (rogné, centré) / étirer (`components/image-fit.js`), coins arrondis (l'image est
découpée), contour (dans la zone), ombre (celle de l'image, ou de sa forme si les coins sont arrondis). Chargement partagé et mis en
cache par identifiant (`components/asset-image.js`), `crossOrigin` anonyme.

Vérifié : `dev/asset-format.test.js`, `dev/asset-store.test.js`, `dev/asset-routes.test.js`, `dev/asset-client.test.js`,
`components/ImageLayer.test.js`, `components/image-fit.test.js`, `dev/diagnostics.test.js` ; essai `23-mediatheque-image.e2e.js`
(import, doublon, faux fichier, couleurs lues dans les pixels, cadrages, dépôt sur l'aperçu, suppression refusée, publication,
rechargement). 27 mutations vues rouges (dont celle de la garde d'usage du Studio dans l'essai).

## 5. Vérification

Texte : `components/text-layout.test.js`, `components/TextLayer.test.js`, `components/canvas-layer.test.js` (mode statique),
`dev/content-layers.test.js`, `layer-kinds.test.js` (familles) ; essai de bout en bout `dev/e2e/suites/21-couche-texte.e2e.js`
(galerie, pixels peints, rétrécissement dans une zone étroite, vignette, publication, rechargement). 15 mutations unitaires et la
mise en page de l'essai ont été vues rouges.
Forme : `components/shape-geometry.test.js`, `components/ShapeLayer.test.js`, `dev/content-layers.test.js` ; essai
`dev/e2e/suites/22-couche-forme.e2e.js` (couleurs lues dans les pixels : coins transparents d'une ellipse et d'un losange, dégradé,
zone 30 % × 10 %). 10 mutations unitaires et 1 de l'essai vues rouges.

## 6. Export et import avec les images (livré)

Un lot d'export passe en **version 4** : `assets: [{ id, name, type, data }]` (`data` = le fichier en base64), à côté de `presets` et
`scenes` (`dev/bundle-assets.js`, `dev/background-preset-library.js`). Les versions 1 à 3 se lisent toujours, sans image.

- **Export :** les images que les presets et les scènes utilisent (`referencedAssetIds`) sont lues dans la médiathèque et emportées. Une
  image utilisée mais absente de la médiathèque ne peut pas voyager : l'export est fait quand même et **signalé incomplet** (« 1 image
  manquante, non exportée »), jamais en silence.
- **Aperçu de l'import :** le serveur ne reçoit que les presets et les scènes (jamais les images) ; l'aperçu annonce « N images à ajouter à
  la médiathèque ».
- **Confirmation :** les images sont rangées dans la médiathèque **avant** les scènes. Le serveur calcule l'empreinte du contenu : si elle
  ne correspond pas à l'identifiant du lot, le lot est altéré ou corrompu et l'import est refusé, aucune scène n'est importée.
- **Contrôles à la lecture :** forme (tableau, 64 images au plus, identifiant valide, sans doublon), base64 lisible, 128 Mo au plus,
  type reconnu à l'en-tête des octets décodés (une image « png » qui est du SVG est refusée), nom assaini.
- Un lot qui porte des images sans médiathèque disponible est refusé à la confirmation.

Vérifié : `dev/bundle-assets.test.js`, `dev/background-preset-library.test.js`, `dev/background-preset-transfer-controller.test.js` ;
essai `24-export-images.e2e.js` (export réel du navigateur, suppression de la scène et de l'image, import du fichier, image revenue
avec le même identifiant, scène peinte, diagnostic sans image manquante). 8 mutations vues rouges.

## 7. Polices importées (livré)

Une police est un **asset** comme une image : même magasin (`dev/asset-store.js`), même identifiant tiré du contenu, mêmes routes, même garde
d'usage, même export. `dev/asset-format.js` reconnaît **WOFF2, WOFF, TrueType et OpenType à l'en-tête** du fichier (jamais au nom ni au type
envoyé par le navigateur, qui n'en donne souvent aucun pour une police) ; une police n'a ni largeur ni hauteur et son plafond est de **5 Mo**.

- Le texte a un réglage **Police importée** (`fontAsset`) : la police passe **avant** la police installée demandée et la famille choisie, qui
  restent le repli. `components/asset-font.js` la déclare sous un nom de famille **propre à son identifiant** (`overlay-asset-<id>`) : deux polices
  ne se confondent jamais, ni avec une police installée ; elle est chargée une seule fois et partagée.
- Pendant qu'une autre police se charge, l'ancienne reste (pas de saut de mise en page) ; une police introuvable est signalée et le texte retombe sur
  sa famille. Le texte se redessine à l'arrivée de la police.
- Médiathèque : la police se montre par un **échantillon écrit dans la police elle-même**. Quand on **choisit** une image ou une police, seule la bonne
  famille s'affiche (`accept`) : le sélecteur d'une police ne propose jamais d'image.
- Une police utilisée par une scène ne se supprime pas, compte dans le diagnostic « images manquantes » et **voyage dans l'export** : la scène
  retrouve sa police sur un autre ordinateur, ce que la seule police installée ne permettait pas.

Vérifié : `dev/asset-format.test.js`, `components/asset-font.test.js` (chargeur et texte), `dev/asset-client.test.js` (vue), essai
`28-police-importee.e2e.js` (vraie police TrueType du système : acceptée sans type MIME, échantillon, chargée par la page, encre du texte
différente, sélecteur filtré, export, suppression refusée). 11 mutations vues rouges (une équivalente a fait supprimer du code).

## 8. Reste

- Typographie fine : plusieurs graisses d'une même famille, variantes (gras / italique réels d'une police importée) ; aujourd'hui gras et
  italique sont ceux que le navigateur synthétise.
