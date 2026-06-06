# Inbox — Overlay Stream

Capture d'idées et questions ouvertes. Trier via `/inbox-triage`.

---

## Éditeur d'overlay — un seul outil construit par incréments

**Décision (grill-me session A) :** il n'y a **pas** deux artefacts ("toolset de dev" + "éditeur").
Il y a **un seul outil — l'éditeur — construit par jalons successifs**. Le "toolset modeste" initial
est simplement le **jalon 1** de l'éditeur, pas un projet distinct. Un seul format de config, un seul
outil pour l'éditer, qui mûrit. Motivation : besoin de maîtrise et de souplesse de l'owner +
éviter la duplication de deux outils qui se recouvrent.

Le socle est l'architecture en cours (couches nommées, config externe sérialisable, protocole
`{ type, data }`, niveaux de visibilité, positionnement anchor+offset). L'éditeur est "juste" une UI
qui écrit cette config au lieu de l'écrire à la main.

### Jalons (du proche au lointain)

**Jalon 1 — Placement (PROCHE, après la base technique)**
Charger une config de scène, voir le rendu réel, déplacer un widget en drag & drop, lire/copier
les nouvelles valeurs `anchor` + `offset`. Débloque le workflow design (édition à la main = boucle
qui tue la dynamique, profil TDAH). C'est l'ancien "toolset `dev.html`", désormais cadré comme
jalon 1 de l'éditeur. **Prérequis :** format de config + système anchor/offset + chargement existants.

**Jalons suivants (épopée, plus tard) :**
- Gestion des couches (ajouter/nommer/réordonner z-index)
- Mapper la visibilité de chaque couche par niveau (full / minimal / hidden)
- Création / nommage de scènes
- Cocher (checkbox) les composants inclus dans chaque couche
- Sliders paramètres Simplex / mode DotGrid, déclenchement `trigger()`
- Bibliothèque de transitions (fade, slide, morph DotGrid via `morphTo()`)
- Binding de données par composant (ex : ce StatBlock → `state.viewers`)
- Export / import JSON de la config (cœur de l'indépendance)

**Garde-fou :** on conçoit le **format de config** comme si l'éditeur complet existait, mais on ne
construit que le jalon nécessaire au besoin courant (`zero preemptive code`). Au-delà du jalon 1,
la config reste écrite à la main jusqu'à ce qu'un besoin concret justifie le jalon suivant.

### Extension — pilotage programmatique d'OBS (éditeur total)

OBS WebSocket v5 est **bidirectionnel** : au-delà d'écouter les événements, le client peut envoyer
des requêtes qui modifient OBS (créer scènes, créer/placer sources, transformer position/taille,
activer/désactiver visibilité, configurer filtres et transitions, définir la scène active).

→ L'éditeur total pourrait **programmer la composition de scènes OBS** : cocher des composants dans
l'éditeur web → requêtes OBS WS v5 → OBS crée la scène et place les sources. L'éditeur devient chef
d'orchestre d'OBS ; l'overlay (fond animé + widgets) n'est qu'une des sources placées. S'aligne avec
le recentrage C (OBS fait le compositing, l'éditeur le programme).

**⚠ À vérifier avant implémentation :** noms exacts des requêtes OBS WS v5 (`CreateScene`,
`SetSceneItemTransform`, etc.) et leurs payloads — non vérifiés contre la doc officielle du
protocole. Principe confirmé, détails à valider.

---

## Skill local — recherche graphique d'overlay

**À créer :** un skill **attaché à ce projet** (`.claude/` du projet, pas global) qui cadre les
sessions de recherche graphique / design d'overlay, pour que leurs outputs soient cohérents et ne
cassent ni le travail actuel ni les sessions futures.

Contraintes/règles que le skill doit imposer (à affiner) :

- **Output = config, pas image.** Toute proposition de composant est livrée dans le **format de
  config figé** (`anchor` + `offset`, couche, mode DotGrid associé), chargeable immédiatement et
  modifiable ensuite dans l'éditeur — jamais une maquette opaque à reconstruire.
- **Respecter le format de config gelé** (à documenter dans la spec avant les sessions design).
- **Respecter `tokens.css`** comme source de vérité design — pas de couleur/typo/espacement hors token.
- **Respecter le recentrage C** : l'overlay = fond animé + widgets data-driven dans UNE source ;
  ne pas proposer de composition qui suppose plusieurs Browser Sources ou du compositing OBS.
- **Respecter zero-build / zero-dépendance.**
- **Ne pas inventer de widget hors du pattern composant** `{ el, update?, destroy? }`.

**Prérequis :** le schéma de config doit être figé et documenté AVANT d'écrire ce skill, sinon il
n'a pas de format à imposer.

---

## Tâche externe — MyVault : rejeu grill-me sur spec

Ajouter dans MyVault un mécanisme qui **rejoue les questions du grill-me** sur une spec existante
pour détecter les trous non couverts. (Variante active, pas simple cross-check.)
N'appartient pas à ce projet — à reporter dans l'inbox de MyVault.
