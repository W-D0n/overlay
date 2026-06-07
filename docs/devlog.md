# Devlog — Overlay Stream D0n / Mozaïk

> Décisions structurantes, par session. Mis à jour en clôture (`/done`).

## 2026-06-07 — S2 : protocole de scène + logique pure

**Ce qui a été fait :**
- Format `SceneConfig` sérialisable (couches nommées, visibilité par niveau, composants, mode DotGrid) + 3 configs de référence.
- Protocole `{type,data}` étendu : `scene.set`, `visibility.set`, `morph.trigger` (+ CustomEvents DOM).
- Extraction de toute la logique du protocole dans `protocol.js` **pur** (`reduceMessage`, `validateSceneConfig`), `store.js` réduit à une coquille d'effets.
- Tests autonomes `bun test` (41 tests) — garantie algorithmique, plus aucune vérification manuelle.

**Pourquoi :**
- Projet destiné à une diffusion publique → testabilité autonome non négociable. La séparation logique pure / effets (AD-1) la rend possible sans navigateur, sans build, sans dépendance.
- Le placement vit dans le CSS, pas dans le format (AD-2) : cohérent avec `tokens.css` source de vérité ; l'éditeur S5 manipulera le CSS, pas un JSON de coordonnées.
- Toujours un état de repos sûr (AD-3) : `DEFAULT_TRANSITION` + mode DotGrid ambiant éliminent la classe « état d'animation incohérent ».

**Impact :**
- `store.js` est désormais une coquille : tout nouveau message se spécifie/teste dans `protocol.js`. Les 8 types legacy y ont été migrés (horloge injectée via `context.now`, effet `reset-duration-timer` pour `session.start`).
- `validateSceneConfig` (V0→V9) est le contrat que le runtime S3 et le futur éditeur consommeront.
- Convention de test établie : `*.test.js` à côté du module, `bun test` à la racine.
