# Roadmap — Overlay Stream D0n / Mozaïk

État d'avancement vivant. L'historique détaillé des lots vit dans [`MAP.md`](MAP.md), les décisions
sorties du backlog dans [`backlog-history.md`](backlog-history.md).

---

## Phase active — Consolidation avant live

L'audit produit du 2026-07-24 est **entièrement livré** (①→⑦). Aucune nouvelle fonctionnalité n'est
engagée : la phase en cours consiste à valider en conditions réelles ce qui a été empilé, puis à
corriger ce que l'audit remonte.

## En cours

- **QA OBS 1440p** — protocole prêt dans [`inbox.md`](inbox.md) §Protocole de QA OBS 1440p. Attend
  le passage de l'owner ; ses constats vont dans §Résultats de l'audit.
- **Validation visuelle ShapeMorph** — qualité des cinq contours et de leurs interpolations.
- **Validation visuelle ColorDrops** — rendu, rythme et lisibilité.
- **Amplitude des réactions audio** — Rain, FloatingSymbols, ColorDrops et OrbitingShapes : la mesure
  automatique sature, seul un regard peut trancher.

Ces quatre points **bloquent sur un jugement humain**, pas sur du code. Rien à implémenter tant
qu'ils ne sont pas rendus.

## Livré (audit produit 2026-07-24)

| # | Ouverture | Spec |
|---|---|---|
| ① | Fonds réactifs aux événements stream | `specs/background-reactive-events.md` |
| ② | Réactivité audio — les 11 effets | `specs/background-audio-reactivity.md` |
| ③ | Preset automatique par scène OBS | `specs/obs-scene-preset-mapping.md` |
| ④ | Transitions entre presets | `specs/background-preset-transitions.md` |
| ⑤ | Couche branding | `specs/background-branding-layer.md` |
| ⑥ | Vignettes de presets | `specs/background-preset-thumbnails.md` |
| ⑦ | Archivage du moteur de scènes | tag git `scene-engine-v1` |

Hors audit, même période : canvas de référence passé en **2560×1440**, et refonte UX du tuner (trois
espaces de travail, hiérarchie typographique — 5,4 → 1,7 écrans de défilement).

## Ensuite, si l'audit ne remonte rien

Aucun engagement pris. Pistes ouvertes, par ordre d'intérêt décroissant :

- réglage fin des gains audio effet par effet, à partir du retour d'audit ;
- capture du **son du bureau** plutôt que du micro (périphérique de bouclage Windows, aucun code) ;
- intégration Twitch EventSub réelle vers `POST /event`, dont le point d'entrée existe déjà.
