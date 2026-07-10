# Inbox — Overlay Stream

Capture d'idées et questions ouvertes. Trier via `/inbox-triage`.

---

## Résolu — process orphelins des scripts de lancement (2026-07-05)

Deux bugs distincts causaient des serveurs de dev/stream qui restaient vivants pendant des heures
après avoir "fermé" `start-dev.bat`/`start-stream.bat` :

1. **`start "titre" cmd /k ...` ouvre des fenêtres détachées**, aucune liée au process du `.bat` —
   fermer sa fenêtre ne tuait rien. `start-dev.bat` réécrit en `dev/start-dev.js` : un seul process
   Bun qui lance les 5 serveurs comme de vrais enfants (Job Object Windows), tués proprement à la
   fermeture (Ctrl+C), sortie préfixée par serveur dans un seul terminal.
2. **`bunx serve` relance son vrai process de travail comme petit-fils détaché** — échappe même au
   Job Object du point 1, orphelin garanti à chaque lancement. Remplacé par `dev/static-server.js`
   (`Bun.serve` natif, zéro dépendance) dans `start-dev.bat` **et** `start-stream.bat` (qui garde
   ses 2 fenêtres séparées, logs relais visibles en live — comportement voulu, pas touché).

Effet de bord découvert en creusant le bug n°2 dans un contexte différent (S8 session 4/6) :
`dev/scene-data-server.js` importait `STATIC_SCENE_IDS` depuis `scenes/registry.js`, qui importe en
cascade les 9 `*.wire.js` → `store.js` → `connectWebSocket()` au chargement du module, sans garde
navigateur. Un serveur Bun sans navigateur se retrouvait donc connecté au relais comme un faux
client overlay, plantant sur `document.dispatchEvent` à chaque `scene.set` reçu. Corrigé en extrayant
`STATIC_SCENE_IDS` dans `scenes/reserved-scene-ids.js`, un module sans aucun import.

~15 process node/bun orphelins accumulés (certains depuis plusieurs heures, avant et pendant cette
session) nettoyés manuellement en confirmant le diagnostic.

---

## Migration `jeu` vers composants (`AlertBanner`/`PollBar`) — après S8 session 4/6 (2026-07-04)

`jeu.wire.js` reste la seule scène avec un HUD entièrement en DOM brut : cellule d'alerte avec son
propre `setTimeout`/`clearTimeout` dupliqué à la main (au lieu d'utiliser `AlertBanner`, qui gère
déjà son minuteur en interne, voir `components/index.js` §AlertBanner), et cellule de vote en HTML
statique (au lieu de `PollBar`, S8). Tant que cette migration n'est pas faite, `jeu` ne peut pas être
recréée/modifiée depuis le futur éditeur (session 5/6) — elle reste une scène "legacy" à wire.js
obligatoire, comme les couches composites déjà exclues en session 3/6 (interview/cams, codage/cam-mini).

**Décision owner (2026-07-04) :** migrer `jeu` **après** la session 4/6 (persistance) — ordre S8 déjà
engagé conservé tel quel (session 4/6 → 5/6 → 6/6), la migration de `jeu` se fait en dehors du
découpage à 6 sessions, une fois la persistance livrée.

**Migration effectuée (2026-07-05).** Décision owner en cours de route : **unifier** l'alerte de
`jeu` avec `AlertBanner` standard (bannière centrée, comme `discussion`/`codage`) plutôt que de
préserver la cellule HUD compacte d'origine — changement d'apparence assumé, pas juste un refactor
interne. `PollBar` remplace le HTML en dur du vote (styles inline déjà copiés 1:1 de l'ancien CSS,
voir `components/index.js` §PollBar — apparence quasi-identique attendue).

Contrainte architecturale découverte en implémentant : un `ComponentMount` ne peut se monter qu'à la
racine de sa couche (`layerEl.appendChild`), jamais à l'intérieur d'un wrapper statique existant
(même limite que les couches composites déjà exclues en S3, `interview/cams`). Impossible de
réinsérer `PollBar` dans l'ancien wrapper `.hud-cell` avec son label "Vote chat" sans le sortir de
son contexte flex — la couche `hud` n'a donc plus qu'un seul enfant enfant (`PollBar`), le label
"Vote chat" étant retiré (le texte de la question suffit à indiquer qu'un vote est en cours). Le CSS
`.hud-cell:last-child` (poussait l'ancienne cellule d'alerte à droite) a été généralisé en
`.hud-bar > *:last-child` pour continuer à pousser le dernier élément — quel qu'il soit — à droite.

`jeu.wire.js` réduit à : session/durée (toujours DOM pur, pas de composant dédié justifié),
visibilité du `PollBar` (masqué hors vote actif — `$bind` ne sait pas exprimer "masquer si null"),
et déclenchement de `AlertBanner.show()` (même pattern manuel que `discussion`/`codage` — le
mécanisme déclaratif `trigger` existe mais n'est encore utilisé nulle part en production, pas le
moment de le roder ici).

**Vérification visuelle faite (2026-07-06, Playwright)** : scène `jeu` déclenchée en conditions
réelles via `/emit` sur le relais (`scene.set`, `poll.update`, `alert.*`). `AlertBanner` (bannière
centrée, auto-hide 5000ms) et `PollBar` (question + barre de progression) s'affichent correctement,
conformes à l'apparence attendue. RAS.

---

## Décision tranchée — migration des 9 scènes existantes vers JSON (owner, 2026-07-04)

**Option B retenue** (vs. A "deux mécanismes d'écriture permanents", vs. report à S5/6). Réévaluation
du coût avant décision : les 9 `scenes/*.config.js` sont déjà des littéraux d'objet purs (vérifié —
aucun import, aucune interpolation, aucune valeur calculée dans les 9 fichiers), donc mécaniquement
convertibles en JSON sans changement de logique. Le runtime lit `SCENE_CONFIGS[id]` identiquement,
que la donnée vienne d'un import statique ou du merge dynamique (`loadDynamicScenes`, S8 session 4/6,
durci par la review de cette session) — même chemin de code déjà testé, risque de régression visuelle
bien plus faible que redouté initialement dans ce document.

**Ce qui NE bouge PAS avec cette migration** :
- `*.wire.js` reste du JS statique importé tel quel (concerne uniquement le format `SceneConfig`).
- Les `<template data-scene="X">` dans `index.html` restent en place (orthogonal au format de la config).

**Décision associée — aucune protection contre suppression/écrasement (owner, 2026-07-04) :**
une fois migrées, les 9 scènes (dont `brb`, filet de secours codé en dur dans `scene-runtime.js` —
`repli sur 'brb'` si la scène demandée est indisponible) sont traitées à égalité avec toute scène
créée par l'éditeur : `/update-scene`/`/delete-scene` peuvent les modifier/supprimer sans garde
particulière. Risque accepté explicitement — un seul opérateur local, `scenes/data/*.scene.json`
committé en git comme les `.config.js` actuels, donc une suppression accidentelle reste récupérable
via l'historique git, pas une perte définitive.

**Migration effectuée (2026-07-04)** : les 9 `scenes/*.config.js` sont converties en
`scenes/data/*.scene.json`, ajoutées à `scenes/data/manifest.json`, `scenes/registry.js` ne construit
plus `SCENE_CONFIGS` par import statique (`STATIC_SCENE_IDS` vide, aucune scène protégée, décision
ci-dessus). Effets de bord découverts et corrigés pendant l'implémentation :
- `loadDynamicScenes()` utilisait des chemins relatifs (`./scenes/data/...`) qui ne résolvaient
  correctement que depuis `index.html` (racine) — cassé pour `dev/placement-panel.html` (sous-dossier).
  Corrigé en chemins absolus (`/scenes/data/...`).
- `dev/placement-panel.html` n'appelait jamais `loadDynamicScenes()` — corrigé (son menu de scènes
  était vide sans ça).
- `dev/scene-placement-format.js`/`dev/placement-server.js` (S7) réécrivaient le `placement` par
  regex sur source JS — remplacés par un parse/mutate/stringify JSON direct, ciblant
  `scenes/data/*.scene.json`. Testé bout en bout (sauvegarde réelle via le serveur, relecture du
  fichier, restauration).
- `protocol.test.js` important 3 configs directement en JS — basculé sur l'import JSON natif de Bun.

`bun test` : 114/114 verts. **Vérification visuelle OBS/navigateur des 9 scènes toujours à faire par
l'owner** (aucun outil de screenshot disponible dans cet environnement) — risque jugé faible (même
donnée, même chemin de rendu qu'avant), mais pas confirmé visuellement.

---

## Gestion des couches — livrée (2026-07-05, commit 4c2e331), résolu

Initialement hors scope de la session 5/6 (composition à l'intérieur des couches existantes
uniquement), puis livrée le jour même dans une session de suite non retracée ici avant le
2026-07-10 — cette entrée était restée obsolète, corrigée en investiguant `docs/inbox.md` §Gestion
des couches (owner a demandé l'item, découvert déjà fait). Ajouter/supprimer une couche déjà livré
S8 session 6/6 ; renommer (input éditable par couche, `goldbar` protégée) + réordonner (glisser-
déposer par poignée dédiée, `moveLayer`) confirmés fonctionnels (vérification visuelle, 2026-07-10) :
`dev/placement-panel.html` §Couches.

Drag & drop par composant individuel (`ComponentMount.placement`, S8) également hors scope de la
session 5/6 — le panneau S7 ne fait glisser que des couches entières (`layer.placement`). Un
composant ajouté via la session 5/6 n'a pas de position éditable dans ce panneau ; extension future
tracée ici, pas anticipée.

---

## Système multi-animations de fond (confirmé par l'owner, 2026-07-04)

L'owner compte avoir **plusieurs animations de fond** à terme (DotGrid + au moins une autre) — pas
juste une hypothèse, un besoin réel exprimé. Un système de coordination entre plusieurs animations
de fond sera donc nécessaire.

**Non construit maintenant** : `docs/overview.md` §Couche de fond DotGrid pose le garde-fou "on ne
construit pas de système générique tant qu'une seule animation existe" — toujours valable, une
seule anim (DotGrid) existe à ce jour. `docs/specs/scene-definition-v2.md` (S8) fait un premier pas
cohérent : DotGrid rejoint le modèle de composant standard (`component-registry.js`), ce qui
facilitera l'ajout d'une coordination multi-animations le jour où la 2e animation existe (elle
suivra le même contrat, pas un cas spécial à réconcilier après coup).

**À faire quand la 2e animation existe** : cadrer une session dédiée (mécanisme de switch/coexistence
entre plusieurs animations de fond, potentiellement lié à `dotgridMode` généralisé ou à un nouveau
concept de "background layer" pluriel).

---

## Extensions du système de placement (voulues par l'owner à terme, 2026-07-04)

Écartées de `docs/specs/scene-placement-protocol.md` (session 1/5 du panneau de contrôle S6) par
zero-preemptive-code — pas de besoin concret au moment de la spec. **Confirmé par l'owner : ce sont
des besoins réels, à faire à un moment**, donc tracées ici plutôt qu'oubliées. Chacune s'active
quand elle devient concrète (pas de calendrier fixé) — extension de `Placement`/`LayerConfig`,
pas une réécriture.

- **Redimensionnement par drag** — poignées de resize dans le panneau, en plus du déplacement.
  Étendrait le panneau (session 4/5) pour éditer `width`/`height` en live, pas seulement `x`/`y`.
  Design à faire : comment une poignée de resize communique la nouvelle taille au panneau (probablement
  même mécanisme que le drag de position, juste sur les coins/bords de l'élément).
- **Placement fin à l'intérieur d'une couche composite** — ex. la couche `cams` d'`interview`
  contient 3 éléments (cam gauche, filet, cam droite) positionnés indépendamment en CSS ; le modèle
  actuel ne déplace la couche que comme un bloc entier. Pour aller plus loin, il faudrait un
  sous-placement par élément dans `LayerConfig` (structure à repenser — pas juste ajouter un champ).
- **Repositionnement dynamique en cours de scène** (ex. une alerte qui glisse à l'écran via un
  événement) — `placement` actuel s'applique une seule fois au montage. Une version dynamique
  écouterait des changements d'état et réappliquerait le style à chaud.

---

## dotgrid-tuner — persistance résolue (S5, 2026-07-04)

Serveur de dev séparé (`dev/tuner-server.js`, `bun dev/tuner-server.js`, jamais lancé en live)
expose `POST /save`, réécrit directement `components/DotGridAnimated.js`. Logique de remplacement
extraite en module pur testé (`dev/dotgrid-params-format.js`). Bouton "Sauvegarder" dans
`dotgrid-tuner.html`, bouton "Copier" gardé en secours. Testé bout en bout manuellement.

---

## Éditeur d'overlay — un seul outil construit par incréments

**Décision (grill-me session A) :** il n'y a **pas** deux artefacts ("toolset de dev" + "éditeur").
Il y a **un seul outil — l'éditeur — construit par jalons successifs**. Le "toolset modeste" initial
est simplement le **jalon 1** de l'éditeur, pas un projet distinct. Un seul format de config, un seul
outil pour l'éditer, qui mûrit. Motivation : besoin de maîtrise et de souplesse de l'owner +
éviter la duplication de deux outils qui se recouvrent.

Le socle est l'architecture en cours (couches nommées, config externe sérialisable, protocole
`{ type, data }`, niveaux de visibilité, positionnement anchor+offset). L'éditeur est "juste" une UI
qui écrit cette config au lieu de l'écrire à la main.

### Jalons (du proche au lointain)

**Jalon 1 — Placement (livré, S7, 2026-07-04)**
Charger une config de scène, voir le rendu réel, déplacer un widget en drag & drop, lire/sauvegarder
les nouvelles valeurs. Livré sans système d'ancrage (`Placement` en pixels absolus, plus simple,
voir `docs/specs/scene-placement-protocol.md`) — `dev/placement-panel.html` +
`dev/placement-server.js`, 10 couches migrées sur 9 scènes. Couches non migrées (wrappers flex,
bandes stretch, composites) restent hors scope V1.

**Jalon 2 — Composition + gestion de scènes (demande owner confirmée, 2026-07-04)**

> « je voulais pouvoir composer et modifier tous les éléments/composants de chaque scène, et même
> je voulais pouvoir créer/modifier/supprimer des scènes. En tout cas c'est que j'entends (en
> partie) quand je parle d'éditeur. »

Confirme et élève ces points de la liste "jalons suivants" ci-dessous du statut hypothétique à
**besoin réel exprimé** :
- **Cocher les composants inclus dans chaque couche** — ajouter/retirer un `ComponentMount` d'un
  `LayerConfig` depuis le panneau (actuellement : édition à la main de `scenes/*.config.js`).
- **Gestion des couches** — ajouter/nommer/réordonner/supprimer une couche dans une scène.
- **Création / modification / suppression de scènes entières** — nouveau `SceneId`, nouveau
  `<template data-scene>` + CSS scopé, nouvelle config + wire, enregistrement `registry.js`. C'est
  la partie la plus lourde : `SceneId` est actuellement un union type fermé (`types.js`,
  `protocol.js` `SCENE_IDS`), pas une liste dynamique — ajouter/retirer une scène par l'éditeur
  demande de repenser cette partie du modèle (ou d'accepter une régénération de code à chaque
  scène créée, ce qui contredit l'esprit "zero-build").

**Pas cadré ni implémenté** — chantier bien plus large que S7 (placement seul), touche le cœur du
modèle de données (`SceneId` fermé, `component-registry.js`, `scenes/registry.js`). Nécessite sa
propre session de décomposition avant tout code, voir `CLAUDE.md` §Session discipline.

**Jalons suivants (épopée, plus lointains, toujours hypothétiques à ce stade) :**
- Mapper la visibilité de chaque couche par niveau (full / minimal / hidden) — déjà possible à la
  main dans `LayerConfig.visibility`, l'éditeur ne ferait qu'exposer un UI dessus.
- Sliders paramètres Simplex / mode DotGrid, déclenchement `trigger()` — la partie DotGrid existe
  déjà (`dev/dotgrid-tuner.html`, S5), `trigger()`/couche 4 événements stream reste un stub.
- Bibliothèque de transitions (fade, slide, morph DotGrid via `morphTo()`) — `morphTo()` reste un stub.
- Binding de données par composant (ex : ce StatBlock → `state.viewers`) — actuellement câblé à la
  main dans chaque `*.wire.js`.
- Export / import JSON de la config (cœur de l'indépendance, voir `docs/overview.md`).

**Garde-fou :** on conçoit le **format de config** comme si l'éditeur complet existait, mais on ne
construit que le jalon nécessaire au besoin courant (`zero preemptive code`).

### Extension — Contrôle OBS centralisé (S6, priorisé par l'owner, 2026-07-03)

**Première tranche livrée en avance (2026-07-04)** : `relay/server.js` sait désormais envoyer des
requêtes OBS WS v5 (pas seulement les recevoir) — `POST /refresh-source` envoie
`PressInputPropertiesButton` pour rafraîchir le cache de la Browser Source overlay, appelé
automatiquement par `dev/dotgrid-tuner.html` après une sauvegarde. Besoin concret immédiat (l'owner
ne voyait pas ses réglages DotGrid appliqués sans rafraîchissement manuel), traité hors du cadrage
complet de S6 — le mécanisme requête/réponse (opcode 6/7) posé ici sera réutilisable pour le reste
de S6 (`CreateScene`, etc.) le moment venu.

**Demande explicite de l'owner** en session (2026-07-03), après avoir testé le pipeline OBS↔relais↔overlay
en conditions réelles : « j'aimerai bien pouvoir tout faire d'un seul endroit ». Élève cette extension
(déjà envisagée dès la session A) au rang de session cadrée (S6, `docs/MAP.md`), dépendante de S7
(panneau de placement, en cours — la numérotation S6/S7 a été clarifiée le 2026-07-04 : S7 est le
panneau lui-même, S6 le contrôle OBS qui s'y branche ensuite).

OBS WebSocket v5 est **bidirectionnel** : au-delà d'écouter les événements, le client peut envoyer
des requêtes qui modifient OBS (créer scènes, créer/placer sources, transformer position/taille,
activer/désactiver visibilité, configurer filtres et transitions, définir la scène active).

→ Le panneau de contrôle unique (S5 jalon 1 + S6) deviendrait le **seul endroit** où l'owner :
- place/ajuste les widgets de l'overlay (jalon 1, `anchor`/`offset`) ;
- règle les paramètres DotGrid par mode (`dev/dotgrid-tuner.html`, avec persistance résolue, voir
  item ci-dessus) ;
- crée/pilote les scènes OBS elles-mêmes (`CreateScene`, `SetSceneItemTransform`, activer une
  scène) — sans repasser par l'UI native d'OBS pour ces opérations.

L'overlay (fond animé + widgets) devient une des sources qu'OBS compose ; le panneau programme cette
composition plutôt que de l'exiger manuelle. S'aligne avec le recentrage C (OBS fait le compositing,
le panneau le programme).

**Prérequis technique :** S5 doit exister en premier — le contrôle OBS a besoin d'un panneau où
s'afficher, pas de sens en tant qu'endpoint isolé.

**⚠ À vérifier avant implémentation :** noms exacts des requêtes OBS WS v5 (`CreateScene`,
`SetSceneItemTransform`, etc.) et leurs payloads — non vérifiés contre la doc officielle du
protocole. Principe confirmé, détails à valider en S6.

**Question ouverte** (à trancher au cadrage S6) : le panneau tourne-t-il comme extension du relais
`relay/server.js` (déjà connecté à OBS WS v5, réutilise la connexion existante) ou comme process
séparé qui ouvre sa propre connexion OBS WS v5 ? Le relais tourne pendant tout le live — y ajouter
des capacités d'écriture (créer/modifier des scènes) élargit sa surface pendant le direct ; un
process de contrôle séparé, lancé à la demande hors-live, serait plus prudent. À trancher avec
l'owner avant d'écrire le premier `CreateScene`.

---

## Skill local — recherche graphique d'overlay (livré, 2026-07-10)

Créé : `.claude/skills/overlay-design-research/SKILL.md`. Le prérequis (format de config figé et
documenté) était déjà rempli entre-temps par `scene-definition-v2.md`/`scene-placement-protocol.md`/
`background-effects-library.md` — le skill référence le format `ComponentMount`/`Placement` réel
(pixels absolus, plus `anchor`/`offset` — terminologie obsolète de cette note, corrigée dans le
skill) plutôt que l'esquisse initiale ci-dessous. Les 5 contraintes (output=config, format figé,
`tokens.css`, recentrage C, zero-build) sont toutes reprises, plus deux ajouts : pointer vers
`docs/guides/creer-un-composant.md`/`utiliser-le-panneau.md` plutôt que dupliquer leur contenu, et
un déroulé de session en 5 étapes (comprendre le besoin → regarder l'existant → extraire la
technique d'une inspiration externe → livrer en config → signaler les écarts explicitement).

---

## Tâche externe — MyVault : rejeu grill-me sur spec

Ajouter dans MyVault un mécanisme qui **rejoue les questions du grill-me** sur une spec existante
pour détecter les trous non couverts. (Variante active, pas simple cross-check.)
N'appartient pas à ce projet — à reporter dans l'inbox de MyVault.

---

## DotGrid — visibilité et rythme ajustés (résolu, session 2026-07-03)

Ajustement direct dans `components/DotGridAnimated.js` (pas d'éditeur — jalon éditeur toujours pas
construit, ajustement documenté ici comme prévu) :
- `baseOpacity` 0.18 → 0.26, `dotRadius` 0.7 → **1.3** (2 passes, validées visuellement par l'owner).
- Couche 1 (oscillation individuelle) : amplitude et vitesse augmentées (~+50-60%).
- Couche 2 (Simplex par mode) : `freqT` et `amplitude` augmentés ~1.5-2× par mode dans `MODE_PARAMS`,
  écarts relatifs conservés entre scènes calmes (`codage`) et dynamiques (`react`).

Confirmé fonctionnel en preview navigateur 1920×1080 par l'owner. Vérification OBS native encore
à faire avant le premier live (comme le reste des scènes S3b).

---

## HUD scène `jeu` — lisibilité résolue + viewers retiré partout (résolu, 2026-07-03)

Confirmé trop petit **en Browser Source OBS réelle** (pas juste un effet de zoom navigateur).
Root cause : `--text-xs` valait **7px** (`tokens.css`) — bug de source de vérité design affectant
tous les libellés uppercase de toutes les scènes, pas un cas isolé à `jeu`. Corrigé à `13px`.

En même temps, décision owner : le compteur de viewers est **retiré de tout l'overlay** (métrique
jugée plus stressante qu'utile en live), y compris le récap post-stream `VIEWERS MAX` de `fin` —
cohérence totale demandée, pas seulement en direct. `state.viewers` reste dans le modèle de données
(`store.js`/`protocol.js` inchangés), seul l'affichage a été retiré des scènes concernées.

Vérifié visuellement par l'owner en preview navigateur après la correction.

---

## Scène `creation` — variante B (panneau référence) abandonnée en page-unique (S3b)

L'ancien `Creation3D.html` gérait 2 variantes via `?mode=A|B` sur **2 Browser Sources séparées**
pointant la même page (A : capture + widgets ; B : capture + panneau référence + widgets réduits).
En page-unique (1 seule Browser Source pour tout l'overlay), ce mécanisme par paramètre d'URL +
2 sources n'a plus de sens — il faudrait un concept nouveau (2e scène, ou layer conditionnel piloté
par l'état live) pour le reproduire.

**Décision S3b (zero preemptive code, pas de réponse owner obtenue en session) :** seule la
variante A a été portée (`scenes/creation.config.js`). La variante B n'a pas été migrée.

**Si le besoin revient**, options déjà identifiées (à trancher avec l'owner) :
- Scène distincte `creation-ref`, sélectionnable comme n'importe quelle autre scène.
- Layer `reference` dans la scène `creation`, visibilité pilotée par l'état live
  (ex. `state.showReference`) plutôt que par l'URL.

---
