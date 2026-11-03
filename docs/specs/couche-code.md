---
created: 2026-11-01
updated: 2026-11-03
---

# Spec — Couche Code (HTML, CSS et JavaScript dans une page isolée)

Statut : **livré, à éprouver dans OBS** (procédure `procedures-owner.md` §15). Fait suite à la question de l'owner du 2026-11-01 : intégrer des animations et des
interactions riches (CSS, three.js) à l'édition. Constat de départ, vérifié dans le code : les 12 effets dessinent en canvas 2D ; aucune couche HTML/CSS libre, aucun WebGL,
aucun shader.

## 1. Décisions

| # | Décision | Raison |
|---|---|---|
| K1 | Un type de couche `code`, **famille « contenu »** (`layer-kinds.js` : `content: true`, `snapshot: false`). Posée dans la pile avec les effets et les contenus, elle arrive et part avec sa scène. | Elle réutilise tout le modèle de couche (placement en fractions, opacité, rendu étendu, historique, modèles, export) sans exception. |
| K2 | Le code vit dans une **`iframe` `sandbox="allow-scripts"`** chargée par `srcdoc`, jamais dans la page de rendu ni dans le Studio. `allow=""`, `referrerpolicy="no-referrer"`. | Origine opaque : ni cookies, ni stockage, ni accès à la page hôte, à l'API du Studio ou à ses jetons. Le micro n'est pas délégué : l'hôte transmet le son. |
| K3 | Le document porte une **politique de sécurité du contenu** posée par l'hôte avant tout code : `default-src 'none'`, et scripts, styles, images, polices, médias, connexions limités à `<serveur d'état>/assets/`. | Ni Internet, ni WebSocket, ni `fetch` vers l'état, ni formulaire, ni `<base>`, ni sous-document réseau. Le live ne dépend d'aucun réseau. |
| K4 | **three.js n'est pas livré** : c'est un fichier de la médiathèque (`.js` / `.mjs`) que le code charge par `asset:<id>`. Les modèles 3D sont des `.glb`. | « Zéro dépendance » reste vrai pour le produit : la bibliothèque est du contenu de l'owner. |
| K5 | Le JavaScript est un **module** (`<script type="module">`) : `import`, `await` de premier niveau. Le HTML et le CSS sont des champs séparés. | `import * as THREE from 'asset:…'` s'écrit en tête du code, naturellement. |
| K6 | Un fichier se référence par **`asset:<32 hexadécimaux>`**, dans le HTML, le CSS ou le JavaScript. L'hôte le remplace par son adresse dans la médiathèque. | Statiquement détectable : le fichier compte comme un usage (suppression refusée, export, diagnostic), ce qu'un `overlay.assetUrl()` calculé ne permettrait pas. `overlay.assetUrl(id)` existe pour les identifiants calculés ; il ne remplace pas la référence écrite. |
| K7 | Les **réglages** que le code expose sont une **donnée** : une liste JSON (`paramSpec`) lue par l'hôte, pas un appel que le code ferait en s'exécutant. Les valeurs vivent dans `params`. | Un script qui plante ou qui boucle ne fait pas disparaître le formulaire ; la déclaration se valide, se borne, s'exporte, se teste. |
| K8 | La page est dimensionnée en **pixels de la source de référence** (`render-reference.js`) puis mise à l'échelle de la source réelle : 96 px de CSS font 96 px de la source quelle que soit la résolution d'OBS. | Même règle que le texte et les effets (contrainte absolue n° 2). |
| K9 | Hôte ↔ page : **messages versionnés** (`overlayCode: 1`). Hôte → page : `params`, `levels`, `alert`, `resize`. Page → hôte : `ready`, `error`. Chaque côté ne lit que sa contrepartie. | Surface minimale et testable des deux côtés. |
| K10 | Un changement de code **recharge** la page après 250 ms de calme ; un changement de réglage ne la recharge pas ; la page **repart de zéro** à chaque arrivée de scène. | La frappe ne recharge pas à chaque lettre ; une animation d'entrée se rejoue à chaque arrivée. |
| K11 | Une alerte qui arrive **avant** que la page ait fini de charger est gardée (10 au plus, 10 s au plus) puis remise. | Une scène qui s'affiche sur un raid ne doit pas manquer ce raid parce que sa bibliothèque se charge. |
| K12 | `capabilities.events` (nouveau, facultatif) : la couche reçoit **chaque** alerte sans empêcher la surcouche de la dessiner. | `reactions: 'native'` supprime la surcouche ; le code décide seul de ce qu'il fait d'une alerte. |
| K13 | Pas de vignette : un **pictogramme** dans la liste des couches et la galerie, et les vignettes de scène **ne montent pas** la page (`isPhotographable`). | Une page isolée n'est pas un canvas ; la monter pour une photo ferait tourner le code des scènes de la bibliothèque. |
| K14 | Importer un lot qui contient du code exige une **case cochée** (« j'ai compris »), le bouton reste inactif sinon, et la confirmation est aussi refusée si la case est décochée. | Une scène importée est du code d'un tiers. |
| K15 | Une page isolée lit ses fichiers avec l'`Origin` **`null`** : `GET /assets/<32 hexadécimaux>` l'accepte, et lui seul (`rejectNonLocalRequest(…, { opaqueOrigin })`). | Un module et un `fetch` en ont besoin ; ni l'état, ni la liste de la médiathèque, ni une écriture n'en profitent. |
| K16 | Une page qui se **redirige d'elle-même** est détectée (un chargement de l'`iframe` que l'hôte n'a pas demandé), vidée, et l'auteur est prévenu sous le champ. | Aucune directive du navigateur n'interdit cette navigation (§4). |

## 2. L'objet `overlay` (dans la page)

| Membre | Rôle |
|---|---|
| `overlay.params` | Les valeurs des réglages déclarés (complétées par les défauts, bornées). |
| `overlay.size`, `overlay.pixelRatio` | Taille de la page en pixels de la source de référence ; pixels réels par pixel de la page à la mise en page (échelle de la source × ratio de l'écran). |
| `overlay.levels` | `{ level, bass, mid, treble }` de 0 à 1, si « Réagit au son » est coché. |
| `overlay.on('params' \| 'levels' \| 'alert' \| 'resize', fonction)` | S'abonne ; renvoie la fonction de désabonnement. Un événement inconnu lève. Un écouteur qui lève est rapporté sans empêcher les autres. |
| `overlay.assetUrl(id)` | L'adresse d'un fichier de la médiathèque ; lève si `id` n'est pas un identifiant. |
| Variables CSS | `--param-<clé>` (nombre sans unité, booléen 1/0, texte entre guillemets, couleur brute) ; `--audio`, `--audio-bass`, `--audio-mid`, `--audio-treble`. |
| Classes sur la page | `alert-follow`, `alert-sub`, `alert-raid`, `alert-bits` pendant 3 s ; la classe est retirée puis reposée de force, ce qui relance les animations CSS. |

`overlay` est figé : le code ne peut ni le remplacer ni y ajouter.

## 3. Réglages déclarés

`paramSpec` est un texte JSON : une liste de 24 réglages au plus, `{ key, label?, type, default, min?, max?, step?, choices? }`.

- `key` : `^[a-z][a-zA-Z0-9_]{0,31}$`, unique. `type` : `number` (`default` nombre, borné par `min`/`max`), `text` (500 caractères au plus), `color`, `boolean`, `select` (`choices` : 1 à 24 textes ; `default` en fait partie).
- Une entrée invalide est **écartée avec sa raison** ; les autres restent. Un JSON illisible donne zéro réglage et la raison. Le Studio les dit sous le champ, en direct, et reconstruit le formulaire à chaque frappe.
- Les valeurs sont complétées (défaut si absente ou de mauvais type) et bornées ; une clé que la déclaration ne connaît plus est écartée ; une clé héritée (`constructor`, `__proto__`) n'est jamais lue comme valeur.

## 4. Modèle de menace

**Garanti** (vu de l'intérieur par `dev/e2e/suites/33-couche-code.e2e.js`) : la page isolée ne lit ni l'état du serveur, ni la liste de la médiathèque, ni Internet ; ne
peut ouvrir ni WebSocket extérieur, ni image extérieure, ni sous-document réseau ; n'a ni stockage, ni cookies, ni accès à la page parente ni à la page de premier niveau ; n'ouvre
aucune fenêtre. Chaque refus est confirmé par l'événement `securitypolicyviolation` de la page, avec la directive qui l'a bloqué. Elle lit un fichier de la médiathèque octet pour octet.

**Non garanti, dit en clair :**
- Une page peut **naviguer d'elle-même** vers une adresse extérieure ; la requête de cette navigation part avant que l'hôte ne la voie (la page est ensuite vidée). L'adresse IP de la machine est donc
  visible du site visé. C'est déjà le cas de toute source navigateur d'OBS, qui n'a aucune de ces protections.
- Une page dessine dans le live : une scène importée peut afficher ce qu'elle veut. C'est pourquoi l'import se confirme par écrit.
- L'`Origin` `null` est aussi celle d'une page `sandbox` ou `data:` d'un site tiers : elle pourrait lire un fichier de la médiathèque dont elle connaîtrait l'identifiant (128 bits, non devinable).

Voir `docs/security.md`.

## 5. Fichiers de la médiathèque

Deux types d'asset de plus (`dev/asset-format.js`) : **`glb`** (modèle 3D binaire, reconnu à l'en-tête `glTF`) et **`js`** (script `.js` / `.mjs`). Un script n'a pas d'en-tête : il est reconnu à son
extension **et** à son contenu (UTF-8 valide, aucun octet nul, 5 Mo au plus) ; un en-tête d'image, de police ou de modèle l'emporte toujours sur le nom. Servis avec leur type (`text/javascript; charset=utf-8` :
un module l'exige), `nosniff`, identifiant tiré du contenu. La médiathèque les montre par une étiquette « JS » / « 3D » ; « Insérer un fichier… » les propose avec les images et les polices.

## 6. Erreurs remontées au Studio

La passerelle remonte les erreurs du code (`error`, `unhandledrejection`, écouteur qui lève), 20 au plus par chargement, 500 caractères. L'hôte ramène la ligne du **document** à la ligne du **JavaScript de
l'auteur** (`composeDocument` renvoie la ligne où il commence) ; une erreur hors de ce code (HTML, CSS) ou venue d'un fichier de la médiathèque n'a pas de ligne. Le Studio les montre sous le champ JavaScript.

## 7. Vérification

- Unitaires : `components/code-params.test.js`, `components/code-document.test.js` (politique, document, passerelle jouée dans une fenêtre factice), `components/CodeLayer.test.js` (isolation, échelle, messages, mise à jour,
  erreurs et lignes, navigation, cycle de vie), `layer-kinds.test.js`, `scene-runtime.test.js` (alertes), `dev/asset-format.test.js`, `dev/asset-routes.test.js`, `dev/asset-client.test.js`, `dev/bundle-assets.test.js`,
  `dev/background-preset-transfer-controller.test.js`, `dev/local-access-policy.test.js`, `dev/background-state-server.test.js` (vrai serveur : l'`Origin` `null` ne lit qu'un fichier).
- Essai de bout en bout `33-couche-code` dans un vrai Chrome : le code tente de sortir **de l'intérieur** et rapporte ce qui lui est arrivé ; réglages, son, alertes, rechargement, erreurs, navigation, déclaration, fichier inséré,
  publication, usage et suppression refusée, import avec case, masquage qui démonte, rechargement du Studio. Les pages isolées vivent dans une autre cible de Chrome : l'outil d'essai les suspend à leur démarrage pour leur appliquer la réécriture des ports d'essai (sans cela leur requête partirait vers le vrai port de l'owner).
- Mutations : voir §8.

## 8. Mutations vues rouges

69 régressions réinjectées une par une dans les sources (politique de contenu élargie ou amputée, ordre politique/passerelle, échappements `</script>` et `<`, contrôles de source et de version des messages, `overlay` non figé,
classe d'alerte libre, `sandbox` avec même origine, permissions déléguées, messages de n'importe quelle fenêtre, alertes anciennes remises, file non bornée, échelle ignorée, ligne d'une bibliothèque rapportée,
navigation jamais détectée, réglages non bornés / non cités / en nombre illimité, alertes non transmises par le moteur, usage des références `asset:` ignoré, script accepté sans nom / avec octet nul / en UTF-8 invalide,
`Origin` `null` ouverte à tout ou à la liste et à la suppression, import sans case, vignette qui monte la page, formulaire qui ne se reconstruit pas, insertion au début du texte…) : **toutes vues rouges**, sauf deux équivalentes :
l'échappement des guillemets de la politique dans son attribut (l'origine validée n'en contient jamais ; l'échappement reste par prudence) et la lecture d'une clé héritée (`constructor`) comme valeur (la valeur lue est une fonction,
rejetée par le type : le test reste utile comme garde du résultat). Trois mutations ont d'abord survécu et ont fait corriger les essais : une redirection lancée **avant** la fin du chargement ne produit aucun chargement « de trop »
(le document étranger prend la place de celui qui était attendu) — mesuré dans Chrome, d'où le délai pour `ready` ; la vignette qui monte la page n'était vue par aucun essai (la page est démontée avant le contrôle) — un observateur de mutations la compte désormais.

## 9. Réglages animés (2026-11-02)

La couche Shader (`couche-shader.md`) utilise la même cible et le même chemin (`drive`).

La timeline et les liaisons pilotent aussi les réglages numériques du code : cible `param:<clé>`, pour tout réglage `number` qui déclare **`min` et `max`**
(sans bornes, une valeur de piste n'aurait ni limite à respecter ni échelle à l'écran ; un seul côté ou `min == max` ne s'anime pas).
Les bornes de la piste ou de la liaison sont celles de la déclaration (`layerTargets`, `targetRange` dans `layer-bindings.js`), le pas aussi (à défaut, une puissance de dix qui découpe l'intervalle en une centaine de pas) ;
une liaison neuve part du défaut du réglage jusqu'à son maximum.

- **Chemin** : le moteur (`scene-runtime.js`) évalue la timeline puis les liaisons (qui l'emportent), retire le préfixe et passe les nombres au composant par `instance.drive(values)` ;
  `CodeLayer` les superpose aux valeurs réglées à la main (bornées par `normalizeParamValues`), envoie le message `params` (même message que pour un réglage manuel : `overlay.on('params')` et `--param-<clé>`) **sans recharger la page**, et ne renvoie rien si les valeurs n'ont pas changé.
  `drive({})` rend les valeurs réglées à la main : c'est ce qui se passe quand la piste ou la liaison disparaît.
- **Une déclaration qui change ne casse rien** : une piste ou une liaison sur un réglage que la couche ne déclare plus (ou plus comme nombre borné) reste dans le document, sans effet, visible et retirable dans les panneaux ; elle reprend vie si le réglage revient.
  À l'écriture (forme canonique), les valeurs sont ramenées dans les bornes de la déclaration courante.
- **Ce qui n'est pas animé** : les réglages texte, couleur, case et liste (pas d'interpolation définie ; les couleurs relèvent des « valeurs animables supplémentaires » de l'inbox).
- **Preuves** : `layer-param-targets.test.js` et `CodeLayer.test.js` (44 mutations réinjectées, 42 vues rouges, 2 équivalentes : le test du type dans `paramTargets` — seul un nombre porte `min`/`max` — et le test du préfixe dans `paramBase`) ;
  `dev/e2e/suites/34-reglages-animes.e2e.js` lit les valeurs **dans la page isolée** (images clés, bornes, courbe, liaison qui l'emporte, retour à la valeur manuelle, aucun rechargement), vue rouge sur deux régressions réelles.

## 9 bis. Modèles de départ et confort de saisie (2026-11-03)

- **Modèles de départ** (`components/code-templates.js`, données seules) : *Titre qui se révèle* (HTML et CSS), *Particules (canvas 2D)*, *Cube 3D (WebGL, sans bibliothèque)*. Chacun porte HTML, CSS, JavaScript et déclaration de réglages ; leurs sources ne contiennent ni import ni adresse externe. `components/code-templates.test.js` vérifie, pour chacun : les limites d'une couche Code, une déclaration sans défaut, un script qui se compile, des réglages utilisés = réglages déclarés (dans les deux sens), une couche valide dans une scène.
- **Appliquer** : liste « Modèle de départ » en tête du formulaire d'une couche Code, `onApply(patch)` du moteur de champs → une seule commande de l'éditeur (`html`, `css`, `js`, `paramSpec`, `params: {}`), donc une étape d'annulation. Un code que l'auteur a modifié (autre chose que le défaut ou un modèle) n'est remplacé qu'au second clic (« Remplacer mon code ? ») ; l'état du code est lu **au clic**, pas à la construction du formulaire (il ne se reconstruit pas pendant la frappe).
- **Saisie** (`dev/code-editing.js`, fonctions pures) : `Tab` indente (deux espaces, toutes les lignes touchées), `Maj+Tab` désindente, `Entrée` garde l'indentation et ouvre un bloc après une parenthèse ou une accolade (le fermant passe à sa ligne) ; numéros de ligne à gauche, qui défilent avec le texte. L'édition passe par `execCommand('insertText')` : l'annulation du navigateur (`Ctrl+Z`) reste celle de l'auteur. **`Échap` puis `Tab` quitte la zone** : la touche Tab ne piège pas le clavier.
- **Preuves** : `dev/code-editing.test.js`, `dev/background-field-renderer.test.js` (le modèle de départ, y compris la confirmation lue au clic), `dev/e2e/suites/47-modeles-code.e2e.js` (vrai Studio : chaque modèle s'applique, **le script tourne dans la page isolée sans erreur remontée — cube WebGL compris**, un pas d'annulation, touches réelles). 16 défauts réinjectés, tous vus rouges ; le défilement des numéros de ligne n'est vérifié qu'à l'œil.

## 10. Reste

- Éditeur de réglages en lignes (au lieu du JSON), coloration syntaxique, `.gltf` à fichiers séparés, bibliothèque de scripts proposée.
- **À mesurer dans OBS** (hypothèses, procédure §15) : WebGL2 dans la source navigateur ; coût d'une page isolée (processus en plus) à 1080p / 60 i/s ; plafond ou indicateur de charge dans le Studio.
- Couche Shader (GLSL en WebGL2 natif) et déclencheurs d'alerte → animation : pistes 2 et 3 de l'inbox.
