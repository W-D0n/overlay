---
created: 2026-11-03
updated: 2026-11-03
---

# Masques de couche

Statut : **livrée (étape 1)** — le modèle, le rendu et l'inspecteur. Reste : les poignées sur l'aperçu, l'animation des masques, le masque à partir d'une image de la médiathèque.

## 1. Ce que c'est

`Layer.mask` (module pur `layer-mask.js`) découpe ce qu'une couche montre, ou ce qu'un groupe entier montre (le masque d'un groupe s'applique à l'ensemble). Absent = pas de masque. Trois formes :

| Forme | Champs | Rendu CSS |
|---|---|---|
| `rectangle` | `x`, `y`, `width`, `height`, `feather` | deux dégradés linéaires (horizontal et vertical) combinés en `mask-composite: intersect` |
| `ellipse` | idem | un `radial-gradient` elliptique centré sur la boîte |
| `linear` | `angle`, `start`, `end` | un `linear-gradient` visible au début, caché à la fin |

Positions, tailles, adoucissement et bornes du fondu sont des **fractions de la couche** (0 à 1), l'angle est en degrés (0° = vers le haut). `feather` est la part de chaque demi-côté qui s'adoucit. `invert: true` montre l'extérieur (un rectangle inversé combine ses deux dégradés en `add`).

## 2. Forme canonique

Seuls les champs de la forme sont écrits, bornés et arrondis au millième, `invert` seulement quand il est vrai. Un masque qui ne cache rien (une boîte qui couvre toute la couche, bords nets, non inversée) n'est pas écrit. Un fondu dont la fin précède le début devient un bord net. Le choix d'une autre forme repart des valeurs par défaut de cette forme et garde l'inversion.

## 3. Rendu

`scene-runtime.js` pose `maskImage` et `maskComposite` sur le calque de la couche, après le filtre et le flou : le masque coupe le halo et le flou. Il n'a rien à voir avec le masque des transitions de scène, qui vit sur le calque de la scène.

## 4. Édition

Section « Masque » de l'inspecteur (`dev/mask-controller.js`) : forme, réglages en pourcentage, case d'inversion. Un glissé de curseur est une seule étape d'annulation ; choisir une forme ou inverser, une étape chacun. Le masque suit « Copier le style », le récapitulatif de publication (« masque : aucun → ellipse ») et « Réinitialiser ».

## 5. Preuves

`layer-mask.test.js` (module), `layer-mask-doc.test.js` (document, éditeur, moteur), `dev/scene-diff.test.js`, `dev/layer-clipboard.test.js`, `dev/e2e/suites/45-masque-couche.e2e.js` (le `mask-image` calculé sur le calque réel). 19 défauts réinjectés, tous vus rouges.

## 6. Limites assumées

- Pas encore de poignées sur l'aperçu : le masque se règle dans l'inspecteur.
- Un masque n'est pas animable (ni par la timeline ni par les liaisons) : les cibles `mask:*` s'ajouteraient comme `filter:*`.
- Les formes sont simples ; pas de forme libre, pas de masque d'image ni de vidéo (voir l'inbox, transitions à mattes).
- **À éprouver dans OBS** : `mask-image` et `mask-composite` sans préfixe demandent une source navigateur récente (Chromium 120 ou plus) ; procédure §19.
