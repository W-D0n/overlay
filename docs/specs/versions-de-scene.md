---
created: 2026-10-31
updated: 2026-10-31
---

# Spec — Versions nommées d'une scène

Statut : **livrée**. Une scène qui se construit couche après couche (texte, formes, images, liaisons) mérite des points de restauration que
l'utilisateur **nomme** : « avant le gros changement », « version stream du vendredi ».

## 1. Ce que c'est, et ce que ce n'est pas

| | Historique d'édition | Historique de publication | **Versions nommées** |
|---|---|---|---|
| Qui l'écrit | chaque modification, automatiquement | chaque publication, automatiquement | l'utilisateur, avec un nom |
| Durée | la session | les scènes qui ont quitté l'antenne | jusqu'à suppression |
| Retour | Ctrl+Z | remettre à l'antenne | **dans le brouillon**, annulable |

## 2. Le stockage (`dev/version-store.js`, `dev/version-routes.js`)

Un fichier JSON à côté du fichier d'état (`<fichier d'état>.versions.json`), distinct des réglages du Studio : une version est une donnée, pas un
réglage, et ses routes n'imposent aucune forme au fichier d'état partagé. Écrit **en entier ou pas du tout** (fichier temporaire renommé),
écritures sérialisées ; un fichier illisible ou d'une autre forme n'est **jamais écrasé en silence** : l'erreur remonte.

| Route | Rôle |
|---|---|
| `GET /versions?scene=<id>` | les versions d'une scène (toutes sans `scene`), la plus récente d'abord |
| `POST /versions` | `{ scene, name }` : 201, 400 (nom vide ou trop long, scène invalide ou trop lourde), 409 (nom pris, limite atteinte) |
| `POST /versions/rename` | `{ id, name }` : 200, 404 (supprimée entre-temps), 409 (nom pris) |
| `DELETE /versions/<id>` | 200 ou 404 |

**Limites devenues fonctions :**
- La scène est validée comme une scène d'antenne : une version corrompue n'est jamais gardée à moitié.
- Un nom est unique **dans sa scène** (sans tenir compte de la casse), libre ailleurs ; 60 caractères au plus.
- **30 versions par scène** : la 31e est refusée avec la raison, **rien n'est jamais supprimé à la place de l'utilisateur**.
- 100 Ko au plus par version.

## 3. Le Studio (`dev/versions-controller.js`)

Bouton « Versions de la scène » dans l'en-tête de la pile de couches, et deux commandes de la palette (« Versions de la scène… », « Enregistrer
une version de la scène… »). La fenêtre garde la scène **telle qu'elle est dans le brouillon**, réglages non publiés compris. Chaque version
montre son nom, sa date, ce qu'elle contient et **ce que sa restauration changerait** (« retire 1 couche par rapport à la scène en cours »,
« identique à la scène en cours »).

- **Restaurer** remet les couches et la transition dans le **brouillon** (`editor.restoreVersion`), en **une** entrée d'historique : un seul
  Ctrl+Z revient à la scène d'avant, et **rien n'est publié** tant que l'utilisateur ne le décide pas. Le nom, l'identité et les étiquettes de
  la scène ne changent pas ; la sélection est vidée. Une macro enregistrée ne l'emporte pas (elle ne se rejoue pas d'une scène à l'autre) et le dit.
- **Renommer** se fait sur place (Entrée valide, Échap annule) ; **Supprimer** demande une seconde pression (4 s).
- Les versions d'une scène sont celles de son identifiant : toutes les scènes sans identité propre (le brouillon « En antenne ») partagent les leurs.

## 4. Vérification

`dev/version-store.test.js` (magasin et routes), `dev/versions.test.js` (restauration, présentation, client), essai `26-versions.e2e.js`
(enregistrer, nom pris ou vide, résumé de restauration, restaurer sans publier, annuler, renommer, supprimer avec confirmation, rechargement,
palette). 14 mutations vues rouges, plus celle de la confirmation de suppression dans l'essai.

## 5. Reste

- Comparer visuellement une version à la scène en cours (le comparateur « Avant / après » existe pour l'antenne).
- Vignettes de versions.
- Versions d'un lot exporté (aujourd'hui un export emporte les scènes, pas leurs versions).
