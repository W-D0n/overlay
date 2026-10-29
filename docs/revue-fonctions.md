---
created: 2026-10-29
updated: 2026-10-29
---

# Revue des fonctions de l'outil

Document de travail, **pas une décision**. Inventaire de ce que l'outil expose, croisé avec l'usage
réel de l'owner (2026-10-29 : « je n'utilisais que le background »), puis propositions à trancher.
Les colonnes « Proposition » sont des recommandations, rien n'est engagé.

## Usage réel de l'owner

Mesuré dans `dev/data/background-state.json` : **un seul preset personnel** (`set-1`), `sceneMap`
**vide**, aucune association de scène. La Browser Source pointe sur
`http://localhost:5931/background.html` avec :

- « Désactiver la source quand elle n'est pas visible » : **décochée** ;
- « Rafraîchir le navigateur lorsque la scène devient active » : **cochée** ;
- canvas OBS en **1920×1080**.

## Trois façons de décider ce que le fond affiche

C'est probablement le cœur de la confusion : le même résultat s'obtient par trois mécanismes qui se
recoupent.

| Mécanisme | Comment | Qui décide |
|---|---|---|
| **État courant** | `background.html` suit le tuner en direct | Le dernier réglage du tuner |
| **URL de preset** | `background.html?preset=<id>` | Le preset, figé, ignore le tuner |
| **Association de scène** | Section « Scènes OBS », exige `OBS_WS_PASSWORD` | La scène OBS active, **écrase** l'état courant |

Les deux derniers répondent au même besoin (un fond par scène). Le guide les présente comme « non
exclusifs » ; en pratique ils se marchent dessus (l'association « reprend la main » sur le tuner,
l'URL `?preset=` l'ignore).

## Inventaire

### Points d'entrée et lanceurs

| Élément | Rôle | Usage owner | Proposition |
|---|---|---|---|
| `background.html` | La source OBS | Oui | Garder |
| `dev/studio.html` | Cadre (en-tête + iframe) autour du tuner | Probable | **Fusionner avec le tuner** : `STUDIO_VIEWS` n'a qu'**une** entrée, le cadre n'ajoute qu'une couche et une URL de plus |
| `dev/background-tuner.html` | Tuner du fond | Oui | Garder, devient l'entrée unique |
| `dev/dotgrid-tuner.html` + `tuner-server.js` | Tuner DotGrid historique, **réécrit du code source** (`components/DotGridAnimated.js`) | Non | **Retirer et tagger** : outil de dev qui écrit sur disque, hors du flux fond |
| `start-stream.bat` | Serveurs du live | Oui | Garder (remplacé à terme par l'exécutable, voir spec zéro-installation) |
| `start-dev.bat` | Session de création | Non | Fusionner avec `start-stream.bat` : un seul lanceur, deux lanceurs prêtent à confusion |
| `kill-servers.bat` | Tue un `bun.exe` orphelin | — | Garder tant que les serveurs Bun existent |

### Espaces du tuner

| Espace / section | Rôle | Usage owner | Proposition |
|---|---|---|---|
| Fond · Points de départ | 5 presets intégrés (« atelier-… ») | Probable | Garder |
| Fond · Réglages de l'effet | 11 effets, formulaires générés | Oui | Garder |
| Fond · Tester une réaction | Follow, sub, raid, bits | Non | Garder ; sans source d'événements réelle, c'est une démo |
| Habillage · Branding | Pseudo et réseaux, glisser-déposer | Non confirmé | À confirmer (voir questions) |
| Habillage · Arrivée du preset | Transitions fondu/balayage | Non | **Voir interaction ci-dessous** |
| Diffusion · Mes presets | Créer, renommer, dupliquer, supprimer, tags, URL | Un preset | Garder, simplifier le vocabulaire |
| Diffusion · Export/import | Sauvegarde portable avec prévisualisation | Non | Garder (chemin de migration prévu par la spec zéro-installation) |
| Diffusion · Scènes OBS | Association scène → preset | Non (`sceneMap` vide) | Garder **ou** retirer au profit des URLs de preset : à trancher |
| « Avant le live » | Diagnostic en lecture seule | Inconnu | Garder, **corriger** (voir dette) |
| Qualité Auto / Performance OBS | Plafond DPR 2 ou 1 | Sans effet dans OBS (DPR = 1, mesuré 2026-10-29) | **Retiré du Studio** ; le paramètre d'URL reste lu |
| Vignettes de presets | Image au repos, animation au survol | Inconnu | Garder |

### Paramètres d'URL

`?preset`, `?transparent=1`, `?branding=only|off`, `?quality=performance` : tous documentés, aucun
utilisé par l'owner. **Garder** : ils ne coûtent rien tant qu'ils ne sont pas posés.

## Dette et incohérences relevées

Chaque ligne a été lue dans le dépôt, aucune n'est une hypothèse.

1. **« Prêt pour le live » vérifie un relais qui n'existe plus** :
   `dev/background-live-readiness.js` interroge `http://localhost:4456/`, le relais archivé avec le
   moteur de scènes (tag `scene-engine-v1`). La ligne est « informative » donc silencieuse, mais elle
   affiche un contrôle sur un composant disparu.
2. **Le guide se contredit** (`docs/guides/tuner-le-fond.md`) : §« Un fond par scène OBS » décrit
   l'association automatique comme livrée ; §« Couleurs, palettes et scènes » dit qu'elle « reste une
   extension possible, mais n'est plus nécessaire ».
3. **Vestiges du moteur de scènes archivé** : le guide parle encore du « moteur de scènes complet
   (`index.html`) » ; `start-dev.bat` annonce « l'éditeur de scènes et la preview » ; `studio.html`
   est dit commun « aux fonds et aux scènes complètes » dans le guide.
4. **Le guide recommande l'inverse de votre réglage** : il conseille d'activer « Arrêter la source
   lorsqu'elle n'est pas visible » (§Performance). C'est un conseil pour le cas « une source par
   preset » ; vous avez une seule source, donc il ne s'applique pas à vous.
5. **Le guide impose 2560×1440** (« Largeur et hauteur : celles de ton canvas OBS — 2560 × 1440 »)
   alors que votre canvas est en 1920×1080. La page épouse la source, donc le rendu fonctionne ; mais
   toutes les valeurs de référence (branding 36/18 px, estimation de coût « 1,8× 1080p ») supposent
   1440p.

## Interaction à vérifier : « Rafraîchir quand la scène devient active »

**Hypothèse, non mesurée.** Ce réglage recharge la page à chaque activation de la scène. D'après la
doc, une page qui démarre « n'anime jamais » une transition. Si c'est exact, **les transitions
entre presets ne se joueraient jamais avec votre réglage**, puisque chaque changement de scène
rechargerait la page. À tester dans OBS : activer une scène, observer si un fondu se joue.

Cela n'explique pas à lui seul votre besoin de rafraîchir à chaque démarrage d'OBS. L'hypothèse
« URL qui pointe sur l'ancien port » est **éliminée** : votre URL est bien `localhost:5931`.

## Questions pour l'owner

1. **Canvas de référence** : votre OBS est en 1080p. La référence du projet (2560×1440) doit-elle
   devenir 1080p, ou prévoyez-vous de passer en 1440p ? Cela change les valeurs de référence du
   branding et la cible du QA.
2. **Un fond par scène** : voulez-vous cette fonction ? Si oui, **un seul** mécanisme (association de
   scène *ou* URLs de preset), pas les deux. Si non, la section « Scènes OBS » et le client OBS WebSocket
   peuvent disparaître, ce qui retire aussi le besoin d'un mot de passe OBS.
3. **Branding** : l'utilisez-vous, ou voulez-vous l'utiliser ? Il est actif par défaut dans
   `background.html` (le rendu de test montrait « Hello CouCou :) »).
4. **Transitions** : voulez-vous des transitions à l'écran ? Si oui, il faudra revoir le réglage
   « Rafraîchir quand la scène devient active » ; sinon la fonction est du code sans usage.
5. **Réactions** (follow, sub, raid, bits) : sans intégration Twitch, elles ne se déclenchent que
   depuis le tuner. Voulez-vous brancher EventSub (piste de la roadmap) ou les retirer ?
6. **Lanceurs** : acceptez-vous un seul lanceur et un seul point d'entrée (le tuner, sans le cadre
   Studio) ?

## Décisions de l'owner (2026-10-29)

1. **Canvas de référence : 1920×1080.** Remplace le 2560×1440 de `CLAUDE.md` §2 (à mettre à jour avec
   les valeurs de référence du branding, les guides et le protocole de QA).
2. **Un fond par scène : oui.**
3. **Branding, transitions, réactions : à utiliser, après nettoyage** du projet, du code et des
   fonctions. Objectif posé : une meilleure architecture et un **vrai studio** de création et
   d'utilisation (overlay, transitions, animations de fond).
4. **Un seul point d'entrée / un seul lanceur : accepté**, à condition de pouvoir utiliser des
   contenus différents selon les scènes. *(Réponse numérotée 4 mais qui correspond à ma question 6 ;
   interprétation à confirmer.)*
5. **Revue du code en vue d'une refacto ou d'un rework : demandée.**

## Ordre de travail proposé

1. Corriger ce qui est faux : contrôle du relais mort, contradictions et vestiges du guide.
2. Retirer ce qui est mort : tuner DotGrid historique (retrait + tag, règle « un seul fil »).
3. Trancher les questions 1 à 6, puis simplifier (un mécanisme par scène, un lanceur, un point
   d'entrée).
4. Seulement ensuite, la phase 1 de `docs/specs/zero-install-local-first.md`.
