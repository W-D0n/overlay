---
created: 2026-10-29
updated: 2026-10-29
---

# Revue UX/UI du Studio (2026-10-29)

Observé dans Chromium (Playwright) à 1920×1080 : Studio (`dev/studio.html`) et ses trois onglets
Fond / Habillage / Diffusion. **Non observé dans OBS** (CEF) ni sur un autre écran que 1920×1080.
Les mesures ci-dessous viennent du DOM réel ; les propositions sont des recommandations.

## Corrigé dans cette passe (commit `044f004`)

| Constat mesuré | Correction |
|---|---|
| 60 textes à 10 px, 4 à 8 px ; `--color-text-dim` à **2,76:1** sur le panneau (seuil AA : 4,5:1) | `--text-sm` 10 px, `--text-base` 12 px ; `--color-text-dim` `#85858F` (**5,16:1**). Ces tokens ne servent qu'aux surfaces de dev (vérifié par grep) |
| Ligne d'un preset personnel : 6 contrôles sur 2 lignes, ✕ quasi invisible, `#id` en 9 px | Grille vignette + titre + méta + groupe d'actions ; ✕ lisible |

## Constats non corrigés

| # | Constat | Gravité |
|---|---|---|
| U1 | **Aperçu = antenne, sans signal.** Chaque réglage est publié 150 ms après, « Essayer » et le chargement d'un preset persistent (`apply(…, true)`). Rien n'indique « brouillon » vs « en antenne ». Le guide dit « sans la sauvegarder » : faux | Haute (risque live) |
| U2 | **Architecture de l'information incohérente.** « Habillage » contient le branding **et** la transition d'arrivée d'un preset ; « Diffusion » contient la bibliothèque de presets **et** l'association scène OBS. Les points de départ sont dans « Fond », la bibliothèque dans « Diffusion » : créer, essayer, enregistrer, assigner sont dispersés | Haute |
| U3 | **L'aperçu n'est pas le cadre OBS.** Il remplit la zone restante (≈1580×1026), pas un 16:9. Le branding (positionné en %) et la taille des effets ne correspondent pas à ce qu'OBS affichera ; pas de cadre ni de zone de sécurité | Haute |
| U4 | **Scènes OBS : 41 lignes de listes déroulantes** (toutes « aucun »), sans recherche, sans scène active mise en évidence, sans aperçu du preset associé | Moyenne |
| U5 | Navigation du Studio : une seule entrée « Fonds & presets » ; titre « TUNER — FOND » redondant sous « OVERLAY STUDIO » ; double barre de défilement (iframe + panneau) ; panneau de 324 px pour des formulaires de 20+ champs | Moyenne |
| U6 | Vignettes quasi noires pour les effets discrets : **mesuré le 2026-10-29**, elles redessinaient l'effet à 104×58 (trompeur) ; remplacées par une capture fidèle 1920×1080 réduite (`docs/specs/studio-trois-zones.md` Z5) | Traité |
| U7 | Police unique monospace (Courier New) pour labels, valeurs et textes d'aide : fatigue de lecture, pas de hiérarchie | Basse |
| U8 | « Prêt pour le live » replié par défaut : le diagnostic est invisible tant qu'il est vert, mais aussi quand il est orange | Basse |

## Proposition : un Studio en trois zones

Cible cohérente avec `docs/specs/studio-cadrage.md` (scènes en couches, brouillon + publication).

1. **Rail gauche** : Scènes OBS (liste filtrable, scène active marquée, preset associé affiché) / Bibliothèque (points de départ + mes presets, une seule liste) / Branding.
2. **Centre** : cadre 16:9 fixe à l'échelle de 1920×1080, bandeau d'état **« Brouillon »** (bleu) ou **« En antenne »** (or), bouton **Publier** et **Annuler** (retour à l'antenne).
3. **Panneau droit** : réglages de l'effet de la sélection, transition d'arrivée au même endroit que le preset qu'elle concerne.

Effet sur U1 à U5 : tous résolus par construction. Coût : refonte du tuner (≈ 640 lignes de HTML/CSS et `background-tuner-runtime.js`), à faire avec le modèle de brouillon du cadrage plutôt que par retouches.

## Décisions à prendre

1. **Brouillon + publication dans le tuner actuel (U1) ou seulement dans le nouveau Studio ?** Recommandation : dans le tuner actuel, d'abord : c'est la source de risque en live aujourd'hui, et l'état « brouillon » est la brique du futur Studio.
2. **Refonte en trois zones (U2, U3, U4, U5)** : avant ou après le contrat d'URL et l'interface de transport (étapes 1 et 2 de la migration) ? Recommandation : après, pour ne pas refaire l'écran deux fois.
3. Garder `Courier New` pour les valeurs seulement et passer les labels/aides en sans-serif (U7) : à confirmer, c'est un choix de direction artistique (« Atelier »).
