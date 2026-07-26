# Spec — Fonds réactifs au son (② de l'audit produit)

Statut : **livrée** (3 effets validés en live le 2026-07-25, étendue aux 11 le 2026-07-26).
Créée le 2026-07-25.
Prérequis tranché : `docs/prototypes/2026-07-25-audio-reactivity.md` — la Browser Source lit le micro
(`audio LU`, testé en conditions réelles). Voie retenue : lecture directe, pas de pont
obs-websocket.

Décisions owner intégrées (2026-07-25) :

1. Réaction **native par effet**, pas un axe générique appliqué à tous — le contrat doit rester
   ouvert pour les effets futurs.
2. Activation **par preset**, comme n'importe quel autre réglage.
3. Perte du micro : dégradation **silencieuse en live**, visible dans le Studio, **avec reprise
   automatique**.

Premier lot d'effets réactifs : **DotGrid, Bubble, WaterRipple**.
Étendu le 2026-07-26 aux **11 effets** : Rain, Fireflies, FloatingSymbols, GeometricPattern,
ColorDrops, StarsParallax, OrbitingShapes, ShapeMorph rejoignent le lot, chacun avec sa réaction
propre (voir §Comportement des effets).

---

## Vocabulaire

- **Niveaux audio** — `{ level, bass, mid, treble }`, quatre nombres dans `[0, 1]` recalculés à
  chaque frame. `level` est le niveau global, les trois autres sont les bandes.
- **Effet réactif** — effet exposant `setAudioLevel(levels)`. Optionnel, exactement comme
  `trigger()` : un effet sans cette méthode n'est jamais réactif, sans erreur.
- **Session micro** — un `AudioContext` + un `MediaStream` uniques par page, partagés.

## Contrat de composant (surface partagée — impacte tous les effets)

Ajout d'une méthode optionnelle à `ComponentInstance` (`types.js`) :

```js
/** @property {(levels: AudioLevels) => void} [setAudioLevel] */
```

Règles :

- appelée au plus une fois par frame, uniquement si l'effet monté l'expose **et** que le preset
  courant a la réactivité activée ;
- l'effet ne démarre ni ne possède rien : il reçoit des nombres, il décide de son rendu ;
- un effet doit rester correct si `setAudioLevel` n'est plus jamais appelée (micro perdu) : il
  revient à son animation normale, il ne fige pas sur la dernière valeur reçue.

Ajouter la réactivité à un effet futur = implémenter cette méthode + déclarer ses champs. Aucun
autre fichier à toucher. Ce point est à répercuter dans `docs/guides/creer-un-composant.md`.

## Fichiers

| Fichier | Rôle | Nature |
|---|---|---|
| `audio-levels.js` | Spectre + `sampleRate` → `{ level, bass, mid, treble }`, lissage attaque/retour | **Pur, testé** |
| `background-audio.js` | Session micro : acquisition, boucle rAF, diffusion, arrêt, reprise | Effets de bord |
| `background-mount.js` | `applyAudio(levels)` — route vers l'instance montée si elle expose `setAudioLevel` | Existant, étendu |
| `components/{DotGridAnimated,BubbleBackground,WaterRippleBackground}.js` | `setAudioLevel` | Existants, étendus |
| `components/audio-reaction.js` | Motif commun : intensité, bornage, remise à zéro, détection de pic | Partagé, testé |
| `dev/component-field-schemas.js` | Champs `audioReactive` / `audioIntensity` sur les 11 effets | Existant, étendu |
| `background.html`, `dev/background-preview-*` | Branchement identique des deux côtés | Existants, étendus |

`background-audio.js` est au même niveau que `background-reactions.js` : partagé mot pour mot entre
l'URL OBS et l'aperçu du tuner, pour qu'ils ne puissent pas diverger.

## Calcul des niveaux (`audio-levels.js`, pur)

- Bandes en Hz, mêmes bornes que le prototype (validées à l'oscillateur) :
  `bass 20–250`, `mid 250–2000`, `treble 2000–8000`.
- Chaque bande = **maximum** des bins couverts / 255 → `[0, 1]` ; `level` = maximum des trois
  bandes. Corrigé le 2026-07-26 : avec des moyennes, une voix ou une basse (quelques bins sur des
  dizaines) tombait sous 10 %, et les effets pilotés par `level` ne bougeaient que de quelques
  pourcents. Mesuré après correction : ton pur → `level` 1,0 ; bruit large → 0,87 sur les trois
  bandes.
- `fftSize` 2048, `smoothingTimeConstant` 0.7.
- **Lissage attaque/retour** par-dessus le lissage natif : montée rapide (facteur 0.5), descente
  lente (facteur 0.08). Sans ça, un fond suit le moindre trou entre deux syllabes et scintille.
- Fonction pure `computeLevels({ spectrum, sampleRate, previous })` → nouveaux niveaux. Aucun accès
  au DOM, à `AudioContext` ni au temps : `previous` est fourni par l'appelant.

## Cycle de vie du micro (`background-audio.js`)

Acquisition **paresseuse** : aucune demande de micro tant qu'aucun preset réactif n'est monté. Une
URL OBS qui n'utilise pas l'audio ne touche jamais `getUserMedia`.

États et transitions :

| État | Déclencheur | Conséquence |
|---|---|---|
| `idle` | Aucun effet réactif monté | Pas de stream, pas de rAF |
| `active` | Effet réactif monté + `getUserMedia` accordé | rAF, `setAudioLevel` par frame |
| `unavailable` | Refus, absence de périphérique, ou piste terminée | Aucun appel, effet en animation normale, reprise programmée |

**Reprise automatique** (exigence owner) — depuis `unavailable`, nouvelle tentative avec recul
progressif : 2 s, 5 s, 15 s, puis toutes les 30 s, sans plafond tant qu'un effet réactif est monté.
Une reprise réussie repasse en `active` sans rien recharger. Un `MediaStreamTrack` qui émet `ended`
(micro débranché) est traité comme une perte, pas comme une erreur fatale.

Le stream est relâché (`track.stop()`) dès qu'aucun effet réactif n'est monté — la LED du micro ne
doit pas rester allumée parce qu'un preset non réactif est affiché.

## Réglages (par preset)

Deux champs, ajoutés au schéma des 3 effets du lot :

| Clé | Type | Défaut | Rôle |
|---|---|---|---|
| `audioReactive` | `select` (`Oui` / `Non`) | `Non` | Active la réactivité pour ce preset |
| `audioIntensity` | `number` 0–2, pas 0.05 | `1` | Amplitude de la réaction |

Ces champs vivent dans `options`, donc la persistance par preset, l'export/import et l'URL OBS
fonctionnent sans nouveau format d'état. Défaut `Non` : aucun preset existant ne change de
comportement après la mise à jour.

`select` plutôt qu'un booléen : les schémas de champs n'ont pas de type booléen aujourd'hui, et en
introduire un pour deux valeurs serait un ajout de vocabulaire non justifié.

## Comportement des effets

| Effet | Réaction |
|---|---|
| DotGrid | Le rayon des points suit `bass`, l'opacité suit `treble`. Se compose avec les réactions d'alerte existantes sans les remplacer. |
| Bubble | La vitesse de montée suit `level` ; un pic de `bass` (dépassement de seuil après le lissage) déclenche l'éclatement aléatoire déjà implémenté. |
| WaterRipple | Un pic de `level` engendre une goutte, en plus de la fréquence réglée. |
| Rain | Le niveau accélère la chute. |
| Fireflies | L'aigu multiplie les éclats, le niveau élargit l'errance. |
| FloatingSymbols | Le niveau accélère la dérive et la rotation. |
| GeometricPattern | Animation CSS : le niveau accélère la lecture et éclaircit le motif. |
| ColorDrops | Un pic relance la goutte la plus basse en haut de l'écran. |
| StarsParallax | Le niveau accélère le défilement, comme une accélération de vitesse. |
| OrbitingShapes | Le grave écarte les formes de leur centre, le niveau accélère la rotation. |
| ShapeMorph | Le grave gonfle les formes, le niveau accélère leur rotation. |

`components/audio-reaction.js` porte le motif commun (lecture de `audioIntensity`, bornage des
niveaux, remise à zéro quand le preset repasse en non réactif, détection de pic), extrait après la
troisième occurrence. Chaque effet garde la main sur **ce que** le son modifie chez lui.

Aucun effet ne doit devenir illisible à `audioIntensity = 2` en musique forte : la réaction module
les paramètres existants, elle ne les remplace pas.

## Dégradation et visibilité

- **En live** : rien ne s'affiche jamais. Micro perdu → l'effet continue son animation normale.
- **Dans le Studio** : le contrôle « Avant le live » gagne un point d'état micro
  (`dev/background-live-readiness.js`) : `ready` si actif, `attention` si indisponible (avec la
  cause : option de lancement manquante, permission refusée, aucun périphérique), et rien du tout si
  le preset courant n'est pas réactif.
- La contrainte permanente `--enable-media-stream` + périphérique par défaut de Windows est
  rappelée dans ce point d'état et dans `docs/guides/tuner-le-fond.md`.

## Critères d'acceptation

1. `computeLevels` sur un spectre de 100 Hz pur → `bass` élevé, `mid`/`treble` quasi nuls (le
   prototype mesurait `0.497 / 0.004 / 0.000`).
2. `computeLevels` sur un spectre vide → les quatre valeurs à 0.
3. Lissage : une chute brutale à 0 décroît progressivement ; une montée brutale est suivie en une
   à deux frames.
4. `applyAudio` sur un effet sans `setAudioLevel` → aucun appel, aucune exception, retour `false`.
5. `applyAudio` sur un effet réactif → `setAudioLevel` appelée une fois avec les niveaux.
6. Preset non réactif monté → `getUserMedia` jamais appelé (vérifié avec un faux fournisseur).
7. Passage d'un preset réactif à un preset non réactif → `track.stop()` appelé.
8. Perte de piste → aucune exception, reprise programmée selon le recul défini, l'effet continue.
9. `bun test` vert, et vérification visuelle en Browser Source réelle sur les 3 effets.

Les critères 1 à 8 sont testables sans micro (fonctions pures + fournisseur injecté). Le 9
appartient à l'owner.

## Hors périmètre

- Les 8 autres effets — le contrat reste ouvert, ils s'ajoutent un par un.
- Détection de tempo/beat au sens musical : on lit des niveaux, pas des mesures.
- Choix du périphérique dans l'overlay : OBS ne l'expose pas à la page, c'est un réglage Windows.
- Capture du son du **bureau** (musique du stream) : `getUserMedia` ne donne que l'entrée par
  défaut. Si le besoin apparaît, il se traite avec un périphérique de bouclage côté Windows, sans
  changement de code.

## Lacunes assumées (LAC)

- **LAC-01** — `audioIntensity` n'a pas de valeur « juste » démontrable avant essai en live ; le
  défaut `1` est un point de départ, à réviser après la première utilisation réelle.
- **LAC-02** — La reprise automatique ne distingue pas un refus définitif (permission refusée) d'une
  panne passagère : elle réessaie dans les deux cas. Simple et sans état caché, au prix d'une
  tentative périodique inutile quand OBS a été lancé sans l'option.
