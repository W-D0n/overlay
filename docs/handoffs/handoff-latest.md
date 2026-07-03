**Handoff — 2026-07-03**

Session : **S3b clôturée** — les 5 scènes restantes (`interview`, `react`, `creation`, `fin` cette
session + `jeu` livrée la session précédente) sont migrées vers la page unique. `bun test` vert
(63 tests). Migration multi-fichiers → page-unique **terminée**.

---

**Ce qui a été fait cette session**

| Livrable | État |
|----------|------|
| Scène `interview` migrée : `scenes/interview.config.js` + `.wire.js` + `<template>` dans `index.html` + registry | ✅ |
| Scène `react` migrée : `scenes/react.config.js` + `.wire.js` + `<template>` + registry | ✅ |
| Scène `creation` migrée (variante A seule) : `scenes/creation.config.js` + `.wire.js` + `<template>` + registry | ✅ |
| Scène `fin` migrée : `scenes/fin.config.js` + `.wire.js` + `<template>` + registry | ✅ |
| `scenes/{Interview,React,Creation3D,FinStream}.html` supprimées (superseded par `index.html`) | ✅ |
| `docs/MAP.md` + `docs/inbox.md` mis à jour (S3b ✅, décision variante creation A-only tracée) | ✅ |

---

**Décision de scope notable**

Scène `creation` : l'ancien `Creation3D.html` gérait 2 variantes (`?mode=A|B`) via **2 Browser
Sources séparées**. Incompatible avec l'architecture page-unique (1 seule Browser Source). Seule la
variante A (capture + colonne widgets) a été portée — la variante B (panneau référence) est
abandonnée (zero preemptive code), détail et options de reprise dans `docs/inbox.md`.

---

**Gap connu — vérification visuelle non faite**

Aucun navigateur headless (`chromium-cli` ou équivalent) disponible dans l'environnement
d'exécution de cette session → les 4 nouvelles scènes n'ont **pas** été vérifiées visuellement
(seul `bun test` a tourné). À faire avant mise en prod : preview 1920×1080 (`bunx serve -l 5500 .`)
ou vérification directe en OBS natif, pour chaque scène migrée cette session.

---

**Prochaine action recommandée**

1. **Vérifier visuellement** les 4 scènes migrées (navigateur ou OBS natif 1920×1080).
2. **S4 — Relais Bun** (WS + HTTP `/emit`, auth OBS, secret en env) : cadrage à faire, voir
   `docs/MAP.md` §Découpage des sessions.
3. **Config OBS pour lancement stream** (demande owner, 2026-07-03) : mettre en place le relais/la
   connexion OBS WebSocket v5 réelle pour permettre le lancement effectif des streams — dépend de S4.

---

**Fichiers modifiés cette session**

```
scenes/interview.config.js  ← nouveau
scenes/interview.wire.js    ← nouveau
scenes/react.config.js      ← nouveau
scenes/react.wire.js        ← nouveau
scenes/creation.config.js   ← nouveau
scenes/creation.wire.js     ← nouveau
scenes/fin.config.js        ← nouveau
scenes/fin.wire.js          ← nouveau
index.html                  ← +4 <template> + CSS scopé
scenes/registry.js          ← 8 scènes enregistrées
scenes/Interview.html       ← supprimée
scenes/React.html           ← supprimée
scenes/Creation3D.html      ← supprimée
scenes/FinStream.html       ← supprimée
docs/MAP.md                 ← S3b ✅, décision creation A-only
docs/inbox.md               ← item creation variante B tracé
```
