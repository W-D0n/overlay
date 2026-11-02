---
created: 2026-11-02
updated: 2026-11-02
---

# Spec — Couche Shader (GLSL en WebGL2, calculé par la carte graphique)

Statut : **livré, à éprouver dans OBS** (procédure `procedures-owner.md` §16). Deuxième étape du plan « Création riche » de l'inbox, après la couche Code (`couche-code.md`) :
là où une couche Code ouvre une page entière, un shader est le moyen **léger** d'obtenir des fonds génératifs (plasma, fluides, grilles, champs de bruit, dégradés vivants).

## 1. Décisions

| # | Décision | Raison |
|---|---|---|
| S1 | Un **fragment GLSL ES 3.00** (WebGL2), écrit comme sur Shadertoy : `void mainImage(out vec4 fragColor, in vec2 fragCoord)`. `iResolution`, `iTime` et `iMouse` existent. | Un code copié de Shadertoy marche presque tel quel : l'auteur n'apprend pas une convention de plus. |
| S2 | Le shader tourne **dans la page de rendu**, sans bac à sable ni `iframe` : un canvas WebGL2, un triangle plein écran, un programme. | GLSL n'a ni réseau, ni stockage, ni accès à la page. Le bac à sable de la couche Code protège d'un langage généraliste ; ici il ne protège de rien et coûterait une page de plus. |
| S3 | `fragCoord` et `uResolution` sont en **pixels de la source de référence** (1920×1080), origine en bas à gauche, quelle que soit la résolution d'OBS et la qualité de rendu. | Même repère que le texte, les effets et la couche Code (`render-reference.js`). |
| S4 | Uniformes fournis : `uResolution` (vec2), `uTime` (s depuis l'arrivée de la couche), `uAudio` (vec4 : niveau, graves, médiums, aigus), `uAlert` (s depuis la dernière alerte ; `1e6` tant qu'aucune), `uPixelScale` (interne). Chaque réglage déclaré devient `u_<clé>` : nombre, case et liste (son rang) en `float`, couleur en `vec3`. Un texte n'est pas transmis. | `exp(-uAlert)` donne l'éclair d'une alerte sans événement à écouter. La déclaration est celle de la couche Code (`code-params.js`) : même JSON, même formulaire. |
| S5 | La couleur rendue est **non prémultipliée** : l'enveloppe la prémultiplie. | Le canvas attend du prémultiplié ; l'auteur écrit `vec4(couleur, alpha)` sans y penser. |
| S6 | Le code de l'auteur est précédé de `#line 1` : le journal du compilateur compte **ses** lignes. Une erreur au-delà de sa dernière ligne vient de l'enveloppe : on dit que `mainImage` manque, sans fausse ligne. | Mesuré dans Chrome (ANGLE) : sans `#line`, l'erreur de la ligne 3 était rapportée ligne 7. |
| S7 | Un changement de code est compilé après 250 ms. **En cas d'erreur le dernier programme valide continue de tourner** ; l'erreur et sa ligne sont dites sous le champ. | Taper un shader ne doit pas éteindre l'antenne. |
| S8 | **Qualité de rendu** : `full`, `half`, `quarter` (part des pixels calculés, le canvas est étiré). Le shader voit la même résolution dans les trois. | Le seul levier de coût que l'auteur règle sans toucher à son code. |
| S9 | Les réglages `number` bornés (`min` et `max`) sont **animables** par la timeline et les liaisons, comme ceux d'une couche Code (`couche-code.md` §9) : `drive()` les impose, ils passent avant la valeur manuelle. | Aucun code de plus : la cible `param:<clé>` couvre les deux types. |
| S10 | Pas de vignette : un contexte WebGL ne se relit pas hors de son image. Pictogramme à la place, comme la couche Code (`snapshot: false`). | Monter un contexte par vignette épuiserait la quinzaine que le navigateur accorde. |
| S11 | `destroy()` **rend le contexte** (`WEBGL_lose_context`). Une perte de contexte (pilote réinitialisé) est dite, puis le shader est recompilé à la restauration. | Une scène qui revient souvent ne doit pas faire perdre les contextes des autres couches. |
| S12 | Un lot **importé** qui contient une couche Shader exige la case cochée de la couche Code (« j'ai compris »), avec un texte qui parle de la carte graphique. | Le seul danger d'un shader est son **coût** : une boucle sans fin fait réinitialiser le pilote graphique, ce qui fige l'affichage de tout l'ordinateur pendant quelques secondes. Rien d'exfiltrable, mais pas anodin à l'antenne. |

## 2. Ce qu'un shader reçoit

```glsl
uniform vec2  uResolution;  // pixels de la source de référence de la zone de la couche
uniform float uTime;        // secondes depuis l'arrivée de la couche
uniform vec4  uAudio;       // niveau, graves, médiums, aigus (0 si « Réagit au son » est décoché)
uniform float uAlert;       // secondes depuis la dernière alerte ; 1e6 avant la première
uniform float u_<clé>;      // un nombre, une case (0/1) ou une liste (rang) déclarés
uniform vec3  u_<clé>;      // une couleur déclarée (composantes de 0 à 1)
```

Un réglage dont la clé contient deux `_` de suite (`a__b`) ne peut pas être transmis : le compilateur les réserve. Il est écarté et la raison est dite sous le champ.

## 3. Architecture

- `components/shader-source.js` — pur : source du fragment (`composeFragment`), plan des uniformes (`uniformPlan`, `uniformValue`, `parseColor`), lecture du journal du compilateur (`parseCompileLog`).
- `components/ShaderLayer.js` — le composant : contexte WebGL2, compilation différée, dernier programme valide conservé, uniformes à chaque image de l'horloge unique (`render-clock.js`), `drive`, `setAudioLevel`, `trigger`, `reports`, perte et restauration du contexte.
- `layer-kinds.js` — type `shader` (contenu, sans vignette, capacités `audio` et `events`), champs `glsl` (code, langage `glsl`, `reports: true`), `paramSpec`, `params`, `quality`, `audioReactive`.
- Le Studio réutilise ce que la couche Code a posé : champ de code, formulaire des réglages reconstruit à la frappe, erreurs sous le champ (`FieldSchema.reports`), animation des réglages (`layer-bindings.js` : `paramTargets`).

## 4. Vérification

- `components/shader-source.test.js` et `components/ShaderLayer.test.js` (faux contexte WebGL qui enregistre chaque appel) : composition, journal, programme conservé en cas d'erreur, pause avant compilation, déclaration qui recompile, uniformes (résolution, temps, alerte, son, réglages, valeur imposée bornée), qualité, plafond de taille, contexte perdu et restauré, destruction.
- **57 mutations** réinjectées une à une dans ces fichiers, `layer-kinds`, `layer-bindings` et l'import : 56 vues rouges, 1 retirée avec le code qu'elle visait (un test redondant dans `draw`, équivalent). Trois survivantes de la première passe ont fait ajouter un essai (déclaration modifiée → recompilation, cibles du shader).
- `dev/e2e/suites/35-couche-shader.e2e.js` — 23 contrôles dans un vrai Chrome avec un vrai WebGL2 (carte graphique réelle, mesurée) : un crochet sur `drawArrays` **lit le pixel dessiné** juste après chaque dessin. Couleur rendue, résolution de référence, qualité, erreur de compilation avec sa ligne et programme précédent qui continue (de nouvelles images sont comptées), réglage animé par la timeline (0 → 64 → 128 → 255), alerte, libération du contexte, et **la vraie page de rendu dans une fenêtre qui n'a pas le rapport de la source** (le shader voit toujours 1080 de hauteur de référence). Vue rouge sur quatre régressions réelles : la résolution en pixels réels, le contexte non rendu, l'alerte sans effet et l'erreur qui éteint le programme.
- Deux faiblesses de l'essai ont été vues et corrigées en chemin : un contrôle qui relisait le dernier pixel (resté bleu même si plus rien n'était dessiné) et un autre qui ignorait le résultat d'une attente.

## 5. Limites et reste

- **À mesurer dans OBS** (hypothèses, procédure §16) : WebGL2 dans la source navigateur (dépend de l'accélération matérielle de la source) ; coût GPU d'un shader plein écran à 1080p / 60 i/s ; effet de la qualité.
- Pas de **coût mesuré par couche** dans le Studio (`cost()` rend `null`) : un temps CPU de `drawArrays` ne dit rien du temps GPU ; une mesure fiable demande une extension (`EXT_disjoint_timer_query_webgl2`) pas toujours offerte.
- Pas de **texture** (une image de la médiathèque en `sampler2D`), pas de **passes multiples** (tampon précédent pour des fluides), pas de vignette. Ce sont les suites naturelles.
- Une quinzaine de couches Shader au plus à la fois (limite de contextes du navigateur) ; la plateforme plafonne déjà les couches d'une scène.
- Un shader trop lourd fige le pilote : seule la qualité réduite et l'attention de l'auteur le bornent. L'import le dit avant d'être confirmé.
