# Spec — Vignettes de presets (⑥ de l'audit produit)

Statut : **livrée** le 2026-07-26.

Contexte : l'audit produit prévoyait des vignettes « seulement si la bibliothèque devient trop
volumineuse pour rester lisible par nom, effet et tags » (`docs/inbox.md`). L'owner les a demandées
en même temps que la refonte UX du tuner, où elles trouvent leur place dans une liste redevenue
compacte.

---

## Le problème à résoudre sans le créer

Une vignette qui montre l'effet exige de faire **tourner** cet effet. Naïvement, une liste de quinze
presets ferait tourner quinze animations dans le Studio, pendant que l'aperçu plein écran tourne
déjà — sur la machine qui encode le live.

Trois décisions en découlent :

1. **Photo, pas animation** — l'effet est monté dans une boîte de 104×58, photographié
   (`canvas.toDataURL`), puis **démonté**. Au repos, une vignette est une image : zéro canvas, zéro
   `requestAnimationFrame`. Vérifié : 6 vignettes affichées, 0 canvas et 0 animation au repos.
2. **Une capture à la fois** — `dev/thumbnail-queue.js` sérialise les captures. Une capture qui
   échoue n'empêche pas les suivantes.
3. **Le mouvement au survol** — pointer ou clavier (`focusin`) remonte l'effet réel dans la vignette,
   la sortie le démonte. C'est souvent le mouvement qui distingue deux ambiances, mais il ne coûte
   que pendant qu'on le regarde.

Rien n'est persisté : les images vivent en mémoire de page. Le fichier d'état ne grossit pas, et une
vignette ne peut pas devenir périmée par rapport aux options du preset.

## Capture représentative

Photographier après un délai fixe donnait des vignettes **noires** pour les effets à événements
rares (une goutte toutes les deux secondes pour WaterRipple, étoiles très pâles pour StarsParallax).

La capture réessaie donc jusqu'à quatre fois, toutes les 500 ms, et s'arrête dès que l'image contient
réellement quelque chose — mesuré par `canvasInkRatio`, la part de pixels non transparents, seuil
0,2 %. À la dernière tentative, l'image est prise telle quelle : une vignette faible reste préférable
à une vignette absente.

## Fichiers

| Fichier | Rôle | Nature |
|---|---|---|
| `dev/thumbnail-queue.js` | Sérialisation des captures | **Pur, testé** |
| `dev/preset-thumbnail.js` | Boîte, capture, survol, `canvasInkRatio` | Effets de bord (canvas) |
| `dev/background-preset-controller.js` | Une vignette par ligne, libérées à chaque re-rendu | Existant, étendu |
| `dev/background-tuner.html` | Styles de la vignette | Existant, étendu |

Les vignettes détiennent des effets montés : `disposeThumbnails()` est appelé à chaque re-rendu de
liste, sinon un effet resterait vivant derrière une ligne disparue.

## Critères d'acceptation

1. La file exécute les captures une par une, jamais en parallèle (testé).
2. Une capture qui lève n'empêche pas les suivantes (testé).
3. Une tâche ajoutée pendant l'exécution est reprise (testé).
4. Au repos : aucune vignette n'a de canvas ni d'animation (vérifié à l'écran : 0 sur 6).
5. Au survol : l'effet est monté ; à la sortie : démonté (vérifié).
6. Chaque point de départ affiche une image non vide (vérifié : 5 sur 5, de 1 à 6 Ko).
7. Un re-rendu de liste libère les vignettes précédentes.

## Lacunes assumées (LAC)

- **LAC-01** — Sur les effets très clairsemés (WaterRipple, StarsParallax), la photo reste peu
  parlante même après plusieurs tentatives : à 104×58, il n'y a physiquement pas grand-chose à
  montrer. Le survol comble ce manque. Augmenter la taille ou la durée coûterait plus que le gain.
- **LAC-02** — Les images sont recalculées à chaque ouverture du Studio (rien n'est mis en cache
  entre deux sessions). Coût : quelques secondes de captures séquentielles au chargement, invisibles
  puisque la liste est utilisable pendant ce temps. Persister les images alourdirait le fichier
  d'état et créerait un risque de vignette périmée.
