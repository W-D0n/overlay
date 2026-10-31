---
created: 2026-10-31
updated: 2026-10-31
---

# Spec — Couches de contenu (texte, forme, image)

Statut : **en cours** (texte livré, forme et image à suivre). Fait suite à l'audit produit du 2026-10-31 : le Studio n'avait que
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
| C6 | Les noms de réglage sont propres au type (`fontSize`, pas `size`) : `NUMBER_FIELD_GUIDANCE` est indexé par nom de champ, partagé par tous les types. | Évite qu'un champ prenne les bornes d'un effet. |

## 2. Texte (livré)

Type `text`, `components/TextLayer.js`, mise en page pure dans `components/text-layout.js` (sans canvas ni DOM, testée avec une
police factice), données dans `components/text-layer.config.js`.

Réglages : texte (une ligne par ligne), police (`serif`, `sans`, `mono`, `display` : les tokens `--font-*` de `tokens.css`, repli dans
le config), taille, gras, italique, majuscules, couleur, alignement horizontal et vertical, interligne, espacement des lettres,
**ajustement à la zone**, retour à la ligne automatique, contour (taille, couleur), ombre (flou, décalage X et Y, couleur).

**Limites devenues fonctions :**
- Un texte qui déborde de sa zone → « Ajustement : réduire » (défaut) : la plus grande taille qui tient (recherche dichotomique),
  jamais sous 4 px ; « aucun » garde la taille réglée.
- Un mot plus large que la zone → coupé aux lettres, sans boucle.
- Le contour réserve de la place des deux côtés : il n'est jamais rogné par le bord de la couche.
- Des options invalides ou partielles (fichier ancien, import) → défauts du schéma, nombres bornés : le texte ne casse jamais le rendu.

Réserve : l'espacement des lettres décale un peu le centrage (le canvas compte l'espace après la dernière lettre). La police est une
police système ; les polices importées arrivent avec la gestion d'assets (§4).

## 3. Forme (à venir)

Type `shape` : rectangle, rectangle arrondi, ellipse, triangle, ligne ; remplissage uni ou dégradé linéaire, contour, rayon,
ombre. La forme remplit la zone de la couche : la redimensionner redimensionne la forme.

## 4. Image et assets (à venir)

Magasin d'assets adressé par contenu (empreinte), servi par le serveur d'état, avec import, médiathèque dans le Studio, limites de
type et de taille, nettoyage des assets non référencés ; type `image` (ajustement contenir / couvrir / étirer, état de chargement
qui ne perturbe pas l'image à l'antenne) ; polices importées pour le texte.

## 5. Vérification

Texte : `components/text-layout.test.js`, `components/TextLayer.test.js`, `components/canvas-layer.test.js` (mode statique),
`dev/content-layers.test.js`, `layer-kinds.test.js` (familles) ; essai de bout en bout `dev/e2e/suites/21-couche-texte.e2e.js`
(galerie, pixels peints, rétrécissement dans une zone étroite, vignette, publication, rechargement). 15 mutations unitaires et la
mise en page de l'essai ont été vues rouges.
