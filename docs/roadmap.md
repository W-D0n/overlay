---
created: 2026-07-26
updated: 2026-10-31
---

# Roadmap — Overlay Stream D0n / Mozaïk

État d'avancement vivant. L'historique détaillé des lots vit dans [`MAP.md`](MAP.md), les décisions
sorties du backlog dans [`backlog-history.md`](backlog-history.md). Ce qui reste à faire, et qui le
fait, est dans [`inbox.md`](inbox.md).

---

## Phase active — Du fond animé au Studio d'overlays

Cap posé le 2026-10-29 (`specs/studio-cadrage.md`) : une scène est un **document de couches** que le Studio édite
et que la page de rendu d'OBS joue. Le moteur et l'éditeur sont livrés ; ce qui manque, c'est le passage en
conditions réelles dans OBS (liste « À faire par l'owner » de l'inbox).

## Livré — Studio d'overlays (2026-10-29 → 2026-10-31)

| Lot | Contenu | Spec |
|---|---|---|
| Socle | Référence 1080p unique, contrat d'URL, transport, horloge de rendu unique | `specs/socle-rendu-etapes-1-2.md` |
| Modèle | Type de couche défini une fois, document de scène (couches, placement en fractions), moteur | `specs/layer-kind-etape-3.md`, `specs/scene-doc-etape-4.md` |
| Éditeur | Couches, historique annulable, brouillon / publication / antenne, aperçu et rendu OBS côte à côte, modèles, commandes, macros, rendu étendu (mode de fusion, rotation, rognage, flou) | `specs/scene-doc-etape-6.md`, `specs/studio-trois-zones.md` |
| Contenus | Texte, forme, image ; médiathèque (images, polices importées) ; export avec les images ; points de départ | `specs/couches-de-contenu.md` |
| Liaisons | Le son et les alertes pilotent une couche | `specs/liaisons-de-couche.md` |
| Timeline | Images clés par couche, durée et boucle de scène, lecture dans OBS | `specs/timeline.md` |
| Versions | Points de restauration nommés d'une scène | `specs/versions-de-scene.md` |
| Incidents | Alerte quand le serveur, OBS ou la page de rendu est perdu | `specs/incidents-d-antenne.md` |

Le guide d'usage est [`guides/studio-editeur-de-couches.md`](guides/studio-editeur-de-couches.md). Garde-fous : tests unitaires,
typage strict à 0 erreur, essais de bout en bout dans un vrai Chrome (`bun dev/e2e/run.js`).

## Livré avant (audit produit 2026-07-24)

| # | Ouverture | Spec |
|---|---|---|
| ① | Fonds réactifs aux événements stream | `specs/background-reactive-events.md` |
| ② | Réactivité audio — les 11 effets | `specs/background-audio-reactivity.md` |
| ③ | Preset automatique par scène OBS | `specs/obs-scene-preset-mapping.md` |
| ④ | Transitions entre presets | `specs/background-preset-transitions.md` |
| ⑤ | Couche branding | `specs/background-branding-layer.md` |
| ⑥ | Vignettes de presets | `specs/background-preset-thumbnails.md` |
| ⑦ | Archivage du moteur de scènes | tag git `scene-engine-v1` |

## En attente d'un regard ou d'OBS

Bloque sur un jugement humain, pas sur du code : QA OBS 1080p, validations visuelles (ShapeMorph, ColorDrops, amplitude
audio), et les contrôles propres au Studio (mode de fusion, contenus, liaisons, alertes système, timeline). Détail et cases
à cocher dans [`inbox.md`](inbox.md).

## Ensuite

Aucun engagement pris ; l'ordre ci-dessous est celui que recommande l'audit du 2026-10-31. Chaque piste a sa fiche dans
[`inbox.md`](inbox.md) § « Pistes d'amélioration ».

1. **Alertes réelles** : brancher Twitch (EventSub) sur `POST /event`. Sans cela, les liaisons « alerte → valeur » ne reçoivent que les
   alertes de test du Studio. À reprendre avec `security.md` (nouvelle surface réseau, jeton).
2. **Rejouer une timeline sur une alerte** : un raid relance l'animation d'un titre.
3. **Sources de données** : viewers, dernier follower, minuteur, comme texte et comme source de liaison.
4. **Son du bureau** plutôt que le micro (périphérique de bouclage Windows).
5. **Groupes de couches** (6h), si l'usage réel le demande.
6. **Chute de FPS comme incident**, une fois mesurée dans OBS.
