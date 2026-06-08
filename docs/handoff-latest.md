**Handoff — 2026-06-08**

Session : cadrage + spec **S3 (scene-runtime-engine)**, review intégrée. Aucun code applicatif
écrit — session 100 % spec. Prochaine session = **implémentation S3**.

---

**Ce qui a été fait cette session**

| Livrable | État |
|----------|------|
| Spec `scene-runtime-engine.md` créée (Contexte, Périmètre, AD-4→7) | ✅ Fait |
| 4 décisions d'archi validées owner (scope 3 scènes, `<template>` inline, wire/scène, hidden masque le fond) | ✅ Fait |
| 41 Acceptance Criteria + Types/Format/Comportements/Non-fonctionnel/Fichiers | ✅ Fait |
| `/spec-review` passé : 1🔴 3🟠 5🟡 trouvés | ✅ Résolu |
| Les 9 gaps corrigés dans la spec (easing→CSS, cleanup AlertBanner, setMode(null)…) | ✅ Résolu |
| Statut spec → `reviewed` (frontmatter + `_index.md`) | ✅ Fait |
| MAP.md : S3 lié à la spec (traçabilité) | ✅ Fait |
| Fix tooling : référence morte `docs/workflows/spec.md` retirée du skill `/spec` global | ✅ Résolu |
| Implémentation S3 (12 fichiers) | 🔲 À faire |

---

**État actuel des specs auditées**

```
scene-config-protocol.md  ✅ Reviewed (S2, livré + commité 636a1e7)
scene-runtime-engine.md   ✅ Reviewed — 0🔴 0🟠 0🟡 (9 gaps corrigés, prête à implémenter)
```
> Tracking JSON (`specs-audit-state.json`) non disponible dans ce projet — état issu de la session.

---

**Prochaine action recommandée — implémentation S3, découpée en 4 sous-étapes**

1. **Helpers purs + tests** : créer `scene-resolve.js` (`resolveTransition`, `isLayerVisible`,
   `resolveDotgridMode`, `toCssEasing`) + `scene-resolve.test.js` → `bun test` vert (AC-15→18, 25→27, 29, 37).
2. **Surfaces partagées** : modifier `components/DotGridAnimated.js` (exporter `GRID_MODES`),
   `components/index.js` (`AlertBanner.destroy()`), `types.js` (`ComponentInstance`, `MountedScene`, `SceneWire`).
3. **Registries + page** : `component-registry.js`, `scenes/registry.js` (`SCENE_CONFIGS` + `SCENE_WIRES`),
   `index.html` (`#bg-layer`, `#scene-root`, `<template data-scene>` × 3), `scene-runtime.js` (montage/swap/visibilité).
4. **Wire des 3 scènes + vérif** : `scenes/{discussion,brb,codage}.wire.js`, puis vérif **visuelle OBS**
   des AC marqués « visuel OBS » (montage, crossfade/cut, visibilité full/minimal/hidden).

> Contraintes à respecter : zero-build/zero-dépendance, `scene-resolve.js` **pur** (AD-1),
> composants n'importent jamais `store.js` (AD-6), `overlay:morph` **non câblé** (AD-7),
> une seule instance `DotGridAnimated` (AC-02), `grid.setMode` jamais appelé avec `null` (AC-22).

---

**Fichiers à CRÉER en S3** (détail § Fichiers de la spec)

```
scene-resolve.js              ← helpers purs
scene-resolve.test.js         ← bun test
component-registry.js         ← ComponentName → factory
scenes/registry.js            ← SCENE_CONFIGS + SCENE_WIRES
index.html                    ← page unique + <template> × 3
scene-runtime.js              ← orchestrateur DOM
scenes/discussion.wire.js     ← câblage état
scenes/brb.wire.js            ← câblage état
scenes/codage.wire.js         ← câblage état
```

**Fichiers à MODIFIER en S3**
```
components/DotGridAnimated.js ← exporter GRID_MODES
components/index.js           ← AlertBanner.destroy()
types.js                      ← ComponentInstance, MountedScene, SceneWire
```

---

**Fichiers modifiés cette session (non commités)**

```
docs/specs/scene-runtime-engine.md  ← spec S3 (créée, reviewed)
docs/specs/_index.md                ← entrée S3
docs/MAP.md                         ← lien S3 → spec
~/.claude/commands/spec/SKILL.md    ← réf morte retirée (hors repo, global)
```

> À commiter en début de prochaine session (ou via `/done`) avant de coder :
> `docs(specs): spec scene-runtime-engine S3 (reviewed)`.
