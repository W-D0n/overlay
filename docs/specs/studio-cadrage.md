---
created: 2026-10-29
updated: 2026-10-29
---

# Spec — Cadrage du Studio d'overlays

Statut : **cadrage validé par l'owner (2026-10-29)**, avant revue d'architecture. Ce document fixe le
périmètre produit ; il ne décrit pas l'architecture cible, qui en découlera.

Besoin : passer d'un « tuner de fond » à un **vrai studio** de création et d'utilisation d'overlays,
de transitions et d'animations de fond, mieux architecturé que le dépôt actuel.

Documents liés : [`zero-install-local-first`](zero-install-local-first.md) (transport, distribution),
[`../revue-fonctions.md`](../revue-fonctions.md) (état des fonctions existantes).

---

## Décisions

| Sujet | Décision |
|---|---|
| Modèle central | Une **scène** en couches, de type ancien moteur (`scene-engine-v1`), maintenable par un seul développeur |
| Canvas de référence | **1920×1080** (le 1440p posait des problèmes avec certaines scènes et sources OBS) |
| Assemblage | **Une seule page** rend toute la pile de couches d'une scène |
| Persistance de la page | **Page persistante** qui suit la scène OBS active, avec `?scene=<id>` pour l'épingler sur une scène. Même page, une option : c'est déjà le principe de `?preset=` |
| Types de couches | Fond animé, branding, alertes (existent) ; puis décor, médias, widgets |
| Ordre de livraison | Existant → **décor** → **médias** → **widgets** |
| Éditeur v1 | Aperçu fidèle, liste de couches (ordre, visibilité, verrouillage), placement à la souris, formulaires générés par schéma |
| Éditeur, objectif final | **Timeline à images clés** |
| Édition en live | **Brouillon + publication** explicite, retour à la version précédente en un clic |
| Transitions v1 | **Fondu et balayage** entre scènes (existants) |
| Transitions, objectif final | **Entrées et sorties par couche** dans la version finale. Le modèle de couche les prévoit ; en v1 leur contenu se limite aux deux transitions existantes |
| Alertes | **Twitch EventSub** d'abord, avec des **sources d'événements interchangeables** (l'owner utilise aussi Twitchat) |
| Point d'entrée | Un seul point d'entrée et un seul lanceur, tant que des contenus différents restent possibles par scène |

## Contraintes de conception

Issues de l'ancienne mise de côté du moteur de scènes (raison réelle non documentée ; l'owner retient
ces quatre contraintes comme valides) :

1. **Pilotage visuel** : rien à éditer à la main (pas de JSON de scène).
2. **Frontières nettes, maintenance solo** : peu de pièces, chacune tenable seul.
3. **Fond à animations complexes** : le fond reste la couche reine.
4. **La stabilité du live prime** sur toute fonction de composition.

Contraintes qui en découlent :

- Les propriétés d'une couche sont **adressables et sérialisables**, et le temps est un **service
  injectable**, pour accueillir la timeline sans refonte.
- Une couche reste un composant au contrat `{ el, update?, destroy? }` (`CLAUDE.md` §4).
- Les **sources d'événements** sont des adaptateurs qui produisent le contrat existant
  `{ type, username?, amount? }` (`CLAUDE.md` §6).
- Le rendu ne dépend jamais du transport (cache local, dernier état affiché), voir la spec
  zéro-installation.
- Aucune charge ni état dans OBS au-delà du rendu, de la lecture de scène et de l'écoute d'événements
  (voir §Twitchat).

## Tension assumée

Quatre types de couches, éditeur visuel, brouillon, sources d'événements multiples et refonte du code,
pour un seul développeur. L'ordre de livraison la gère ; la contrainte elle-même reste. Un type de
couche n'est lancé que lorsque le précédent est stable.

## Twitchat comme source d'événements

Lu dans le dépôt `Durss/Twitchat` (code actuel, pas seulement la doc, qui se dit périmée) :

- **Transport** : l'API publique de Twitchat passe par **OBS WebSocket** (`BroadcastCustomEvent`,
  reçu comme `CustomEvent` avec `origin: "twitchat"`). « OBS agit comme un pont » (`PUBLIC_API.md`).
  Il n'existe pas d'autre canal documenté.
- **Événements pertinents pour les alertes** : `FOLLOW`, `SUBSCRIPTION`, `BITS`, `REWARD_REDEEM`,
  `DONATION_EVENT`, plus `OBS_SCENE_CHANGE`. **Aucun `RAID`** dans la liste actuelle des types : la
  correspondance avec nos quatre types (follow, sub, raid, bits) n'est donc pas complète et reste à
  vérifier sur un flux réel.
- **Autres données utiles aux widgets** : `CURRENT_TRACK`, `TIMER_*`, `COUNTDOWN_*`, `COUNTER_UPDATE`,
  `POLL_PROGRESS`, `PREDICTION_PROGRESS`, `DONATION_GOALS_OVERLAY_PARAMS`.

Conséquences :

1. **Écart avec la spec zéro-installation.** Celle-ci cantonne OBS WebSocket à la *lecture de la
   scène active*. Écouter Twitchat impose un **client en lecture seule** des `CustomEvent`. C'est un
   second usage de la **même connexion** que la lecture de scène, sans écriture ni état stocké dans OBS.
   Le rejet de « OBS comme bus » vise le stockage d'état ; il ne vise pas cette écoute, imposée par
   Twitchat. À confirmer par l'owner (voir §Points ouverts).
2. **Adaptateur dédié** : un adaptateur « Twitchat » traduit ses événements vers le contrat
   `{ type, username?, amount? }`. L'adaptateur EventSub fait de même. Le reste du système ignore la
   source.
3. **Les widgets ne reprennent pas ceux de Twitchat** (décision owner, 2026-10-29). Ils sont
   originaux : par exemple un slider d'affiches de jeux vidéo alimenté par une source de données, ou
   des personnages animés qui se déplacent dans le cadre du viewport. Twitchat reste une *source
   d'événements*, pas une source de widgets. Voir §Widgets originaux.

## Widgets originaux

Les deux exemples de l'owner imposent des pièces que le modèle « couche = composant » ne fournit pas
seul. À prévoir dans l'architecture :

- **Sources de données**, distinctes des sources d'événements : un widget lit des données (liste de
  jeux, images, état externe) par un adaptateur remplaçable, avec **cache local** et repli hors
  ligne. Un live ne doit jamais dépendre d'un appel réseau au moment d'afficher.
- **Gestion d'assets** : images distantes ou locales (affiches) téléchargées, mises en cache et
  servies localement, avec un état de chargement qui ne perturbe pas l'image à l'antenne.
- **Acteurs animés** : des entités qui se déplacent dans le viewport (personnages, sprites) demandent
  un système de mouvement et d'animation, qui relève du même socle que le fond animé et que la future
  timeline.

Ces trois pièces sont le coût réel du type « widgets » ; elles justifient qu'il vienne en dernier.

## Points ouverts

- **Tauri** : indécis (analyse en cours). N'en bloque aucun autre.
- ~~**Référence de conception du branding**~~ — **traité le 2026-10-29** : référence passée à 1080 en
  conservant l'aspect (tailles ×0,75, état de l'owner migré). Voir
  [`background-branding-layer`](background-branding-layer.md).
- ~~**OBS WebSocket en écoute de `CustomEvent`**~~ — **accepté** par l'owner (2026-10-29), en lecture
  seule.
- **Mot de passe OBS** : l'écoute et la lecture de scène partagent le même secret, à ne mettre ni
  dans le dépôt ni dans une URL de source.

## Hors périmètre de cette spec

- L'architecture cible (couches de code, frontières, migration) : objet de la **revue d'architecture**
  qui suit.
- La spec technique de la timeline, du format de scène et du brouillon : à écrire après la revue.
- Comptes, multi-utilisateur, galerie publique : exclus (un seul utilisateur).

## Suite

1. ~~Revue d'architecture en lecture seule (`codebase-design`) sur cette base.~~ **Faite le
   2026-10-29** : [`../architecture-review.md`](../architecture-review.md).
2. Correctifs sans risque de la revue des fonctions (contrôle du relais mort, guide).
3. Spec technique du modèle de scène, puis migration par étapes, tests verts à chaque étape.
