---
created: 2026-10-29
updated: 2026-10-29
---

# Spec — Définition unique d'un type de couche (étape 3)

Statut : **Draft, à valider par l'owner**. Étape 3 de `docs/architecture-review.md` §5, après le socle de
rendu (`socle-rendu-etapes-1-2.md`, livré). Elle touche des **surfaces partagées** (`component-names.js`,
`component-registry.js`, `dev/component-field-schemas.js`, format d'état) et **les valeurs stockées dans vos
presets** : à valider avant tout code, avec sauvegarde et migration réversible.

Vocabulaire : module, interface, seam, deletion test (`codebase-design`). « Type de couche » (`LayerKind`) =
un effet de fond tel que le Studio le propose aujourd'hui (Rain, DotGrid…).

## Problème (constats mesurés, `architecture-review.md` F2, F4, B2, B3, B4, B6)

1. **Un effet se déclare à quatre endroits** : `component-names.js` (nom), `component-registry.js`
   (factory), `dev/component-field-schemas.js` (formulaire), et sa propre capacité audio/événement,
   détectée à l'exécution par `typeof instance.setAudioLevel === 'function'` dans `background-mount.js`.
   Des tests de cohérence compensent l'oubli (`component-names.test.js`, `component-registry.test.js`,
   `component-field-schemas.test.js`) : ils existent parce que le code permet l'incohérence.
2. **Couches inversées.** Le format d'état (`dev/background-state-format.js`, côté protocole) importe les
   schémas de formulaire (côté interface), qui importent à leur tour un effet (`GRID_MODES` depuis
   `DotGridAnimated.js`). Valider un fichier d'état charge donc du code de rendu.
3. **Une valeur d'interface sert de donnée.** `audioReactive` est stocké `'Oui'` / `'Non'`, le libellé
   affiché. La constante est codée en dur dans **5 fichiers** (`background-mount.js`, `audio-reaction.js`,
   `BubbleBackground.js`, `DotGridAnimated.js`, `WaterRippleBackground.js`) et **11 listes** `choices` du schéma.
   Traduire ou renommer un libellé casse les presets enregistrés.
4. **Les valeurs d'options ne sont jamais validées** : le serveur accepte `speed: "abc"` ou `count: -5` et
   le rend à l'antenne. Seul le nom de l'effet est vérifié.
5. **Le fichier d'état n'a pas de `version`.** Chaque migration est devinée à partir de la forme des données
   (`migrateBackgroundFile` : identifiants absents, effet retiré).
6. **Noms d'effets hérités** : suffixe `Background` partout, et `DotGridBackground` est un alias de
   `DotGridAnimated` (deux noms pour un effet).

## Conception

### 3a. Deux moitiés, une déclaration chacune, jointes par le type

| Moitié | Contenu | Consommée par | Dépendances |
|---|---|---|---|
| **Description** (`layer-kinds.js`, donnée pure) | `{ id, label, capabilities, fields[] }` ; les valeurs par défaut se **déduisent** de `fields` | Validateur d'état, serveur d'état, formulaires du Studio, diagnostic pré-live | Aucune (ni DOM, ni effet) |
| **Fabrique** (`component-registry.js`) | `id → factory` | Montage (`background-mount.js`), vignettes | Les effets |

Les identifiants sont une union fermée dérivée de la description (`as const`) ; le registre est typé
`Record<LayerKindId, Factory>` : **oublier une fabrique ou en déclarer une en trop échoue au contrôle de
types** (`bun dev/typecheck.js`), pas à l'exécution. Pas de vérification qui lève au chargement de
`background.html` : un effet inconnu ne doit jamais produire un écran noir en live (comportement actuel
conservé : l'effet en place reste affiché, erreur journalisée).

Ajouter un effet = **deux** fichiers (sa description, sa fabrique) au lieu de quatre. Test de suppression :
retirer `component-names.js` fait disparaître une déclaration redondante, retirer la description fait échouer
le typage du registre.

`GRID_MODES` (liste de modes DotGrid) passe dans la description : plus aucun import d'effet côté protocole.

### 3b. Capacités déclarées

`capabilities: { audio: boolean, reactions: 'native' | 'overlay' }`.

- `audio` : l'effet réagit au son. Le montage lit la capacité déclarée au lieu de sonder `typeof`.
- `reactions` : `'native'` (DotGrid, qui expose `trigger`) ou `'overlay'` (réaction dessinée par
  `ReactionOverlay`). Le routage de `background-reactions.js` lit cette valeur.
- Un test de contrat vérifie, **pour chaque type**, que l'instance créée expose `setAudioLevel` / `trigger`
  si et seulement si la capacité est déclarée (la déclaration ne peut pas mentir).

### 3c. Valeurs persistées neutres, fichier versionné

- `audioReactive` devient un **booléen** ; « Oui / Non » ne reste que dans l'interface. Le champ de schéma
  passe au type `'boolean'` (case à cocher ou bascule), plus de `choices: ['Non', 'Oui']`.
- Le fichier d'état et les lots d'export gagnent `version: 2`. La migration 1 → 2 est **explicite** (pas
  devinée) : `'Oui'` → `true`, `'Non'` → `false`, dans l'état courant, tous les presets et les lots importés.
- **Lecteur tolérant** : l'effet et le montage acceptent `true` **et** `'Oui'` ; un lot d'export version 1
  s'importe toujours (migré à l'import). Une page OBS non rafraîchie qui reçoit un booléen ne perd donc pas
  la réactivité audio.
- **Sauvegarde obligatoire avant la première migration** : copie horodatée de `background-state.json`
  (`background-state.v1.<date>.bak`) dans `dev/data/` (déjà ignoré par git). Retour arrière documenté : remettre
  le fichier et le tag `pre-layer-kind`.

### 3d. Identifiants neutres avec compatibilité

`RainBackground` → `rain`, `DotGridBackground` → `dotgrid`, etc. Une table `legacyIds` dans la description
relie l'ancien nom au nouveau ; la migration 1 → 2 réécrit les noms, et **le lecteur accepte l'ancien nom
indéfiniment** (coût : une ligne par type). Les URL OBS ne contiennent jamais ce nom (`?preset=<id>`), donc
aucune URL de Browser Source ne change.

### 3e. Validation des valeurs d'options, pilotée par le schéma

`validateOptions(kindId, options)` contrôle le **type** de chaque champ connu. Les nombres hors bornes sont
**ramenés dans les bornes** (jamais rejetés) ; un type invalide est **rejeté** (HTTP 400, message nommant le
champ). Un champ inconnu est conservé et signalé en avertissement (compatibilité avec un preset plus récent
que le code chargé). Le serveur applique `validateOptions` à `POST /state`, `/save-preset` et à l'import.

### 3f. Nettoyage

Les trois tests de cohérence deviennent inutiles et sont supprimés (le typage les remplace) ;
`component-names.js` disparaît (dérivé de la description). Aucune ligne de comportement n'est retirée.

## Ordre de livraison (un commit par pas, `bun test` vert à chaque pas)

1. **3a** description + registre typé (aucun changement de comportement ; tests existants inchangés).
2. **3b** capacités déclarées + test de contrat.
3. **3c** version, booléen, migration, sauvegarde, lecteur tolérant. **Test rouge d'abord** : aller-retour
   export/import d'un preset avec `audioReactive: 'Oui'` ; vérification sur **une copie** de votre vrai fichier
   d'état avant de toucher l'original.
4. **3d** identifiants neutres et `legacyIds`.
5. **3e** validation des options.
6. **3f** suppressions.

## Critères de succès (chacun observé, pas déduit)

- Ajouter un effet de test factice demande deux fichiers ; en oublier un fait échouer `bun dev/typecheck.js`
  (vu rouge sur une régression réinjectée).
- Votre `background-state.json` réel, migré en copie : mêmes effets, mêmes options, `audioReactive` booléen ;
  le rendu de chaque preset est identique avant/après (sonde de pixels existante, `effect-probe`).
- Aller-retour export → import d'un lot version 1 puis version 2 : aucun champ perdu (la garde de l'ancien
  défaut U3 couvre déjà `transition` et `showBranding`).
- Une page `background.html` ouverte **avant** la migration continue d'afficher le fond après la bascule du
  fichier (lecteur tolérant), sans rafraîchir.
- `POST /state` avec `speed: "abc"` → 400 ; avec `count: 9999` → accepté et ramené à la borne.
- `bun test` vert ; contrôle de types : aucune régression, et moins d'erreurs qu'avant.

## Hors périmètre

Couches multiples et `SceneDoc` (étape 4), brouillon/publication côté serveur (étape 5), nouveaux types de
couches (étape 7), traduction de l'interface. Le champ `mode` de DotGrid (8 valeurs pour 1 seul profil
distinct) est un défaut connu (A8) traité à part.

## Risques

| Risque | Parade |
|---|---|
| Presets corrompus par la migration | Sauvegarde horodatée avant écriture ; migration d'abord sur copie ; lecteur tolérant ; tag `pre-layer-kind` |
| Page OBS non rafraîchie après la migration | Lecteur tolérant `true` / `'Oui'` ; le serveur reste compatible avec un lot version 1 |
| Un effet inconnu bloque le rendu | Comportement conservé : l'effet en place reste, erreur journalisée ; le typage attrape l'incohérence avant |
| Le renommage des ids casse un lot d'export ancien | `legacyIds` lu indéfiniment ; test d'import d'un lot version 1 |
| Surface partagée modifiée (`types.js`, schémas, registre) | Vérification en aval avant chaque pas (CLAUDE.md), un commit par pas |

## Décisions à prendre

1. **Renommer les identifiants maintenant (3d) ou garder `RainBackground`…** Recommandation : maintenant, avec
   `legacyIds` : la compatibilité coûte une ligne par type, et renommer plus tard refait la migration.
2. **Hors bornes : ramener ou rejeter (3e) ?** Recommandation : ramener (un fond ne doit pas être refusé en
   live pour une valeur légèrement hors plage) ; rejeter les types invalides.
3. **Fichier de description unique ou un fichier par effet (3a) ?** Recommandation : **un seul fichier**
   `layer-kinds.js` pour la description (une table lisible d'un coup d'œil, 11 entrées), les fabriques restant
   dans leurs fichiers d'effet. À revoir si la table dépasse ~600 lignes.
