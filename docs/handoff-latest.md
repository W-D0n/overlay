**Handoff — 2026-06-08**

Session : **implémentation S3** (moteur runtime page-unique) — livrée, vérifiée fonctionnellement,
commitée + pushée. Prochaine session = **S3b** (migration des 5 scènes restantes).

---

**Ce qui a été fait cette session**

| Livrable | État |
|----------|------|
| `scene-resolve.js` — 4 helpers purs (`resolveTransition`, `isLayerVisible`, `resolveDotgridMode`, `toCssEasing`) + `scene-resolve.test.js` (22 tests, `bun test` vert) | ✅ Fait |
| Surfaces partagées : `GRID_MODES` (DotGridAnimated), `AlertBanner.destroy()` (index.js), 3 typedefs (`ComponentInstance`/`MountedScene`/`SceneWire`) | ✅ Fait |
| `index.html` — page unique : `#bg-layer` + `#scene-root` + `<template>` × 3 (CSS porté, scopé par `.scene[data-scene]`) | ✅ Fait |
| `scene-runtime.js` — orchestrateur : montage / swap / `cut`·`crossfade` / visibilité, garde double-fire, repli scène initiale | ✅ Fait |
| `component-registry.js` + `scenes/registry.js` + wires `discussion`/`brb`/`codage` (AD-6) | ✅ Fait |
| Vérification fonctionnelle (preview 1920×1080, events réels) : DotGrid unique, cut/crossfade, anti-accumulation, visibilité full·minimal·hidden, AC-34. Zéro warning console | ✅ Résolu |
| Incohérence interne spec `ComponentInstance.show` (`AlertEvent` → `unknown`) | ✅ Résolu |
| 3 scènes HTML migrées supprimées + docs vivants (MAP/README/devlog) mis à jour | ✅ Fait |
| Migration des 5 scènes restantes (`interview`, `react`, `creation`, `fin`, `jeu`) + configs | 🔲 À faire (S3b) |

---

**État actuel des specs auditées**

```
scene-config-protocol.md  ✅ Reviewed (S2, livré 636a1e7)
scene-runtime-engine.md   ✅ Reviewed — implémentée + vérifiée (S3, livrée 1c67eee)
```
> Tracking JSON (`specs-audit-state.json`) non disponible dans ce projet — état issu de la session.

---

**Prochaine action recommandée — S3b (migration des 5 scènes restantes)**

Gabarit établi en S3 à reproduire pour chaque scène : un `<template data-scene="id">` dans `index.html`
+ une `scenes/[id].config.js` + une `scenes/[id].wire.js`, puis enregistrement dans `scenes/registry.js`.

1. **Créer les 5 configs** : `scenes/{interview,react,creation,fin,jeu}.config.js` (suivre `discussion.config.js`,
   valider chacune via `validateSceneConfig` — `id ∈ SceneId`, goldbar survit au minimal, ≥1 couche full).
   Note : `jeu` a `dotgridMode: null` (premier cas réel du chemin `setMode(null)` jamais appelé — AC-22).
2. **Ajouter les 5 `<template data-scene>`** dans `index.html` (porter la structure depuis `scenes/{Interview,React,Creation3D,FinStream,Jeu}.html`, scoper le CSS par `.scene[data-scene="id"]`, replier les décorations dans une couche).
3. **Créer les 5 wires** `scenes/[id].wire.js` (câblage composants ↔ store ; `clearTimeout` au cleanup si timer).
4. **Enregistrer** les 5 configs + wires dans `scenes/registry.js` (`SCENE_CONFIGS`, `SCENE_WIRES`).
5. **Vérifier** : `bun test` vert, puis preview 1920×1080 — montage des 5 scènes, `jeu` avec `#bg-layer` masqué (dotgrid null), supprimer les 5 HTML une fois migrées.

---

**Fichiers de cette session** (commités : `e68caae` feat, `fe47f8c` docs, `1c67eee` chore)

```
scene-resolve.js               ← helpers purs
scene-resolve.test.js          ← 22 tests bun
scene-runtime.js               ← orchestrateur DOM
component-registry.js          ← ComponentName → factory
scenes/registry.js             ← SceneId → config + wire
scenes/{discussion,brb,codage}.wire.js  ← câblage état (AD-6)
index.html                     ← page unique + <template> × 3
components/DotGridAnimated.js  ← export GRID_MODES
components/index.js            ← AlertBanner.destroy()
types.js                       ← +3 typedefs S3
docs/MAP.md, README.md, docs/devlog.md  ← docs vivants à jour
docs/specs/scene-runtime-engine.md      ← cohérence typedef
.claude/launch.json            ← bunx (preview)
scenes/{BRB,Discussion,Codage}.html     ← supprimées (→ index.html)
```

> Gaps connus (non bloquants) : décorations hors-couche (footers/séparateurs) visibles en `minimal`
> (cosmétique) ; rendu pixel exact non capturé en preview (screenshot bloqué par la boucle rAF du DotGrid) —
> structure + comportement validés. À vérifier à l'œil en OBS quand pratique.
