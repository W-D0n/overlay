# Overview — Overlay Stream D0n / Mozaïk

## Pourquoi ce projet

Habillage stream complet et **autonome** pour D0n (streamer-dev, entité Mozaïk).
Direction artistique **Atelier** : noir profond, or patiné, grille de points animée,
typographie serif + monospace.

Le projet doit pouvoir être **publié comme outil indépendant** — réutilisable par
d'autres streamers sans couplage à l'écosystème personnel de D0n (notamment MyVault).

## Principe d'indépendance

L'indépendance n'est pas l'absence de connexions réseau — c'est l'abstraction du **protocole**.

- L'overlay consomme un flux de messages `{ type, data }` (voir `store.js`).
- N'importe quelle source peut l'alimenter : MyVault, un script Python, OBS WebSocket v5
  directement, etc. (variante "architecture pluggable").
- Le protocole OBS WebSocket v5 (handshake, auth SHA256, événements natifs) est pris en charge
  **dans le projet lui-même** (fichier d'adaptation dédié `obs-ws.js`), pour rester autonome.

## Direction architecture en cours de définition (grill-me juin 2026)

> Statut : **spec en cours** — décisions validées listées ci-dessous, détail dans `docs/specs/`.

### Page unique vs multi-fichiers

Migration décidée : d'une architecture **multi-fichiers** (7 HTML séparés, 1 Browser Source
chacun) vers une **page unique** qui gère plusieurs scènes/layouts. Objectif : faire évoluer
l'outil avec de nouvelles scènes, transitions et animations depuis un socle unifié.

### Deux axes orthogonaux

Le modèle mental repose sur deux dimensions indépendantes :

```
scène       × niveau de visibilité
─────────────────────────────────
discussion  × full     → overlay complet
discussion  × minimal  → sous-ensemble (ex : DotGrid + barre or)
discussion  × hidden   → body transparent, rien (cinématique plein écran)
codage      × full     → overlay complet
...
```

- **Scène** = layout + composants actifs (discussion, codage, gaming, brb…).
- **Niveau de visibilité** = full / minimal / hidden. Orthogonal à la scène. Permet de masquer
  l'overlay à tout moment (cinématique, moment de visionnage) sans changer de scène.
- La transparence est appliquée dynamiquement (`body.style.background`), pas figée par scène.

### Couches nommées (socle d'un futur éditeur)

Chaque élément d'une scène appartient à une **couche nommée** (`data-layer="ide"`).
Une config externe par scène (`scene-config.js`) déclare quelles couches survivent à quel
niveau de visibilité. La config est conçue comme un **objet sérialisable** — c'est exactement
le format qu'un futur éditeur de scènes écrirait. On adopte la structure maintenant ; on ne
construit pas l'éditeur (voir `{inbox}`).

### Couche de fond de page (DotGrid)

Le DotGrid n'est **pas** une couche de scène — c'est une **couche de fond permanente de la page**,
montée dans un conteneur dédié (`#bg-layer`), au-dessus du `body`, en dessous de toutes les scènes.

Conséquences :
- Une seule instance DotGrid vit en permanence (perf : pas 7 instances).
- Le DotGrid survit aux changements de scène → assure la **continuité visuelle** (transition douce).
  Changer de scène = `grid.setMode(nouveauMode)` interpolé pendant que les composants se swappent.
- Le niveau `minimal` devient trivial : DotGrid seul, déjà séparé des scènes.

**Garde-fou (zero preemptive code) :** on réserve l'**emplacement** `#bg-layer` et on y monte
DotGrid. On ne construit PAS un "système de couches d'animation générique" tant qu'il n'y a qu'une
animation. Le jour où une 2ᵉ animation de fond existe, elle se monte dans l'emplacement existant ;
l'abstraction de coordination ne s'écrit qu'à la 2ᵉ-3ᵉ occurrence (rule of three).

## Vision future (non spécifiée)

Éditeur de scènes visuel — voir `docs/inbox.md`. Épopée distincte, hors scope des specs actuelles.
