# MAP — Overlay Stream D0n / Mozaïk

> Feuille de route et état d'avancement. Mis à jour en clôture de session (`/done`).

## Focus actuel

**Session 2** — format de config de scène + protocole `{type,data}` étendu (artefact structurant).

## Découpage des sessions

| Session | Périmètre | État |
|---|---|---|
| S1 | DotGridAnimated — couches 1 (base aléatoire) + 2 (Simplex ambiant par mode) | ✅ fait |
| S2 | Format de config de scène + protocole `{type,data}` étendu | ⬜ à venir |
| S3 | Migration page-unique runtime | ⬜ à venir |
| S4 | Relais Bun (WS + HTTP `/emit`, auth OBS, secret en env) | ⬜ à venir |
| S5 | Éditeur jalon 1 (placement drag + lecture anchor/offset) | ⬜ à venir |
| Épopée | Éditeur complet, orchestration OBS programmatique, skill recherche graphique | ⬜ hors scope |

## Détail S1 (livré)

- `components/simplex.js` — Simplex 2D Gustavson, `simplex2(x,y) → [-1,1]`, zéro dépendance.
- `components/DotGridAnimated.js` — couches 1+2, stockage SoA, `setMode`/`destroy` fonctionnels, `trigger`/`morphTo` en stubs.
- `scenes/BRB.html` — branché sur `DotGridAnimated({ mode: 'brb' })`.

## Reste à faire (hors S1, déjà identifié)

- Migration des 6 autres scènes (Discussion, Codage, Interview, React, Creation3D, FinStream) vers `DotGridAnimated` → prévu S3.
- Couches 3 (morphisme) et 4 (événements stream) du DotGrid → sessions ultérieures, voir `HANDOFF_overlay_dotgrid.md`.
