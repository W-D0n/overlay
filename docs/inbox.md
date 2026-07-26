# Inbox — Overlay Stream

Notes et items qui restent à traiter. Les clôtures récentes sont consignées dans
[`docs/devlog.md`](devlog.md) ; l’historique détaillé des décisions vit dans
[`docs/backlog-history.md`](backlog-history.md).

## Validation visuelle

- **ShapeMorph** — confirmer dans le tuner la qualité des cinq contours et leurs transitions.
- **ColorDrops** — recueillir un retour détaillé sur le rendu, le rythme et la lisibilité.
- **QA OBS native** — confirmer dans une vraie Browser Source (2560×1440) que les
  vitesses et les contrôles récents restent conformes, sans coût ou artefact inattendu. Les effets
  couvrent maintenant une surface 1,8× plus grande : surveiller le coût CPU/GPU.

## À juger à l'œil dans OBS

- **Amplitude des effets pilotés par la vitesse** — Rain, FloatingSymbols, ColorDrops et
  OrbitingShapes réagissent au son, mais la mesure automatique sature sur ces rendus : seul un
  regard peut dire si la réaction est trop discrète ou trop forte
  (`docs/specs/background-audio-reactivity.md`).

## Décisions produit tranchées (2026-07-26)

- ~~**Preset automatique par scène OBS**~~ — fait, ③ : `docs/specs/obs-scene-preset-mapping.md`.
- ~~**Miniatures de presets**~~ — fait, ⑥ : `docs/specs/background-preset-thumbnails.md`.
- **Repositionnement dynamique pendant une scène** — sans objet depuis l'archivage du moteur de
  scènes ; le branding, lui, se repositionne au glisser-déposer.
