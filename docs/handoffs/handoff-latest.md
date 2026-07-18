# Handoff — 2026-07-18

Focus courant : **fonds autonomes dans le Studio**, avec l’éditeur de scènes conservé comme surface
secondaire.

## État actuel

- OBS live : `http://localhost:5500/background.html`
- Studio : `http://localhost:5500/dev/studio.html`
- État live/presets : `dev/background-state-server.js`, port 4462
- 11 effets enregistrés, un seul actif à la fois
- 5 points de départ intégrés, puis réglages et presets personnels

## Dernier lot

- Parcours du tuner réordonné en « Points de départ → Réglages → Mes presets ».
- « Avant le live » repliable ; ouverture automatique uniquement en cas bloquant.
- Panneau de « Scènes complètes » fixé à gauche, aperçu à droite.
- MatrixGrid supprimé du runtime, du registre, du schéma et des points de départ. Compatibilité des
  anciens états assurée par migration vers « aucun fond » et retrait des presets concernés.
- `docs/inbox.md` réduit aux seuls items restant à traiter ; historique détaillé dans
  `docs/backlog-history.md` et clôtures récentes dans `docs/devlog.md`.

## Vérification

- `bun test` : **320/320 verts**.
- QA Chromium à 1920×1080 : structure, interactions et positions validées sur les deux onglets.
- Relais OBS optionnel non lancé pendant la QA ; son appel sur le port 4456 échoue comme attendu.

## Restant

Voir [`docs/inbox.md`](../inbox.md) : validation ShapeMorph/ColorDrops et OBS native, puis trois
évolutions à ne reprendre que si le besoin produit se confirme.
