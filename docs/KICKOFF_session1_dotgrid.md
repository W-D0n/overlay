# KICKOFF — Session 1 : DotGridAnimated

> À coller au démarrage d'une nouvelle conversation pour lancer la Session 1.
> Contexte produit par la session A (architecture), juin 2026.

---

## Message d'amorçage (copier-coller dans la nouvelle conv)

```
Projet : D:\STREAM (overlay stream D0n / Mozaïk).
Session 1 du découpage validé : implémenter DotGridAnimated (Priorité 1 du handoff).

Avant tout : applique le skill grill-me sur les détails d'IMPLÉMENTATION de cette session,
PUIS implémente après validation. Une question à la fois, explore le code avant de demander.

Lis dans l'ordre :
1. CLAUDE.md (racine) — contraintes absolues du projet
2. docs/overview.md — vision + architecture décidée
3. HANDOFF_overlay_dotgrid.md — spec d'origine du composant (section "Travail suivant")
4. docs/KICKOFF_session1_dotgrid.md — ce fichier (décisions déjà figées)

Périmètre Session 1 : Couches 1 + 2 uniquement (base aléatoire + Simplex ambiant par mode).
NE PAS faire : couches 3 (morph), 4 (événements), ni la migration page-unique.
```

---

## Décisions DÉJÀ figées en session A (ne pas re-débattre)

Composant `overlay/components/DotGridAnimated.js` :

- **Simplex noise** → fichier séparé `overlay/components/simplex.js`, porté from scratch
  (~80 lignes, domaine public Gustavson), signature `simplex2(x, y) → [-1, 1]`. Zéro dépendance npm.
- **Opacité** → additif clampé `clamp(base + C1 + C2, 0.04, 1)`, plancher 0.04 (jamais invisible).
  base = `0.18` (token), C1 = Couche 1 signée, C2 = Couche 2 signée.
- **Boucle rAF** → démarre dans le `ResizeObserver` (premier render au DOM). Séparer
  `handleResize()` (dimensions + recréation arrays) de `tick(time)` (rendu pur).
- **Stockage points** → trois `Float32Array` parallèles SoA : `phases`, `amplitudes`, `speeds`.
- **Temps** → timestamp rAF direct (pas d'accumulation de delta).
- **Effacement** → `clearRect` (canvas transparent, fond CSS de la scène derrière).
- **setMode()** → swap instantané des paramètres Simplex (PAS d'interpolation en S1 ;
  l'interpolation viendra avec l'éditeur quand un appelant concret existera).
- **Couche 1** (init au chargement, par point) : `phase = random*2π`, `amplitude = 0.05+random*0.08`,
  `speed = 0.3+random*0.4`. Garantit un chargement unique à chaque fois.
- **Couche 2** (Simplex ambiant) : paramètres par mode (freqX/freqY/freqT/amplitude) — table dans
  HANDOFF_overlay_dotgrid.md, section Couche 2.

## Interface publique cible (rappel handoff)

```js
DotGridAnimated({ mode, spacing, dotRadius, baseColor, baseOpacity })
  → { el, setMode(mode), trigger(eventType), morphTo({...}), destroy() }
```

En Session 1 : `el`, `setMode`, `destroy` fonctionnels. `trigger` / `morphTo` = stubs (couches 3-4,
sessions ultérieures). NE PAS écrire de logique morph/event préventive (zero preemptive code).

## Ordre d'implémentation (micro-tâches, profil TDAH — valider visuellement à chaque étape)

1. `simplex.js` from scratch + smoke test (`simplex2` renvoie bien dans [-1, 1]).
2. Squelette `DotGridAnimated` : canvas + ResizeObserver + boucle tick + Couche 1 seule (oscillation
   sinusoïdale). Valider visuellement sur **BRB.html** (la plus visible).
3. Ajouter Couche 2 (Simplex par mode) + formule d'opacité clampée. Valider sur BRB.
4. `setMode()` swap + stubs `trigger`/`morphTo`/`destroy`. Brancher dans BRB.html en remplacement
   de `DotGrid`.

## Garde-fous CLAUDE.md à respecter

- Zéro dépendance, zéro build. Tout natif.
- Pattern composant `{ el, update?, destroy? }`.
- `tokens.css` = source de vérité (spacing/opacity/gold viennent des tokens si dispo).
- Logique pure isolée (simplex.js ne touche pas au DOM).
- Tests : smoke test simplex au minimum (déterminisme sur les bornes).

## Rappel découpage global (sessions suivantes — NE PAS entamer)

- S2 : format de config de scène + protocole `{type,data}` étendu (artefact structurant)
- S3 : migration page-unique runtime
- S4 : relais Bun (WS + HTTP `/emit`, auth OBS, secret en env)
- S5 : éditeur jalon 1 (placement drag + lecture anchor/offset)
- Épopée : éditeur complet, orchestration OBS programmatique, skill recherche graphique

État : commit initial `69eeae6` (structure + specs archi), pas de remote (repo local seul).
```
