# Inbox — Overlay Stream

Notes et items qui restent à traiter. Les clôtures récentes sont consignées dans
[`docs/devlog.md`](devlog.md) ; l’historique détaillé des décisions vit dans
[`docs/backlog-history.md`](backlog-history.md).

## Validation visuelle

- **ShapeMorph** — confirmer dans le tuner la qualité des cinq contours et leurs transitions.
- **ColorDrops** — recueillir un retour détaillé sur le rendu, le rythme et la lisibilité.
- **QA OBS native** — confirmer dans une vraie Browser Source (2560×1440 désormais) que les
  vitesses et les contrôles récents restent conformes, sans coût ou artefact inattendu. Les effets
  couvrent maintenant une surface 1,8× plus grande : surveiller le coût CPU/GPU.

## Décisions produit à reprendre si le besoin se confirme

- **Preset automatique par scène OBS** — les URL stables par preset couvrent le besoin actuel.
  Décider si une association OBS WebSocket scène → preset apporte encore assez de valeur.
- **Miniatures de presets** — à envisager seulement si la bibliothèque personnelle devient trop
  volumineuse pour rester lisible par nom, effet et tags.
- **Repositionnement dynamique pendant une scène** — `placement` est appliqué au montage. Une
  animation pilotée par l’état demanderait une mise à jour à chaud ; différé tant que le moteur de
  scènes reste en pause.
