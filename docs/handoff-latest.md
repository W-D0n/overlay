**Handoff — 2026-06-09**

Session : **S3b démarrée — scène `jeu` migrée et commitée** (`23533ed`). Vérif statique + runtime OK.
Prochaine session = migrer les **4 scènes restantes** (`interview`, `react`, `creation`, `fin`).

---

**Ce qui a été fait cette session**

| Livrable | État |
|----------|------|
| Scène `jeu` migrée page-unique : `scenes/jeu.config.js` + `scenes/jeu.wire.js` + `<template>` dans `index.html` + enregistrement `scenes/registry.js` | ✅ Commité `23533ed` |
| AC-22 vérifié au runtime : `dotgridMode: null` → `#bg-layer` masqué, `setMode(null)` jamais appelé | ✅ Vérifié (preview 1920×1080) |
| HUD câblé à l'état live (session/durée/viewers + vote + alerte, timer annulé au cleanup / AC-39) | ✅ Vérifié (`#047`, `1 243` à `y=984`) |
| `scenes/Jeu.html` supprimée (superseded par `index.html`) | ✅ Commité |
| `.gitattributes` ajouté (`* text=auto eol=lf`) — supprime définitivement les warnings CRLF sous Windows | ✅ Fait (closeout) |
| Backlog capturé dans `docs/inbox.md` : DotGrid (visibilité + rythme), lisibilité HUD, back-off WS | ✅ Fait |
| Migration des 4 scènes restantes (`interview`, `react`, `creation`, `fin`) + configs/wires | 🔲 À faire (S3b 2→5/5) |

---

**État actuel des specs auditées**

```
scene-config-protocol.md  ✅ Reviewed — implémentée (S2, 636a1e7)
scene-runtime-engine.md   ✅ Reviewed — implémentée + vérifiée (S3 + jeu en S3b)
```
> Tracking JSON (`specs-audit-state.json`) non disponible. S3b suit le gabarit de la spec S3 — pas de nouvelle spec.

---

**Prochaine action recommandée — S3b (2→5/5)**

Gabarit éprouvé sur `jeu` à reproduire pour chaque scène : `<template data-scene="id">` dans `index.html`
(CSS scopé `.scene[data-scene="id"]`) + `scenes/[id].config.js` + `scenes/[id].wire.js`, puis enregistrement
dans `scenes/registry.js`.

1. **`interview`** : porter depuis `scenes/Interview.html` (invité = `state.guest`). Valider via `validateSceneConfig`.
2. **`react`** : porter depuis `scenes/React.html` (source = `state.sourceTitle/Author/Platform`).
3. **`creation`** : porter depuis `scenes/Creation3D.html` (`state.currentTool`).
4. **`fin`** : porter depuis `scenes/FinStream.html` (`state.sessionStats`, `state.recapLines`).
5. Pour chacune : `bun test` vert + preview 1920×1080 (penser à **dézoomer** pour voir le bas — l'overlay
   fait 1080px, fenêtre navigateur souvent plus courte), puis **supprimer le `.html`** migré.
6. Clôturer S3b (`docs/MAP.md` ligne S3b → ✅) puis cadrer **S4** (relais Bun).

---

**Fichiers modifiés cette session**

```
scenes/jeu.config.js   ← config scène jeu (commité 23533ed)
scenes/jeu.wire.js     ← câblage HUD live (commité 23533ed)
index.html             ← template + CSS scène jeu (commité 23533ed)
scenes/registry.js     ← jeu enregistré (commité 23533ed)
scenes/Jeu.html        ← supprimée (commité 23533ed)
.gitattributes         ← normalisation LF (closeout)
docs/inbox.md          ← 3 items backlog (DotGrid, HUD, back-off WS)
docs/MAP.md            ← S3b en cours (1/5)
```

> Gaps connus (non bloquants, tracés dans `docs/inbox.md`) : DotGrid trop discret + animation trop lente
> (tuning design à venir) ; lisibilité HUD à confirmer en OBS natif avant ajustement `tokens.css` ;
> bruit console reconnexion OBS WS (back-off silencieux à implémenter).
