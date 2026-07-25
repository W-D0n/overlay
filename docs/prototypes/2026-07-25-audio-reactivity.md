# Prototype — Réactivité audio (② de l'audit produit)

**Question** : un fond peut-il réagir au son sans plugin ni process supplémentaire, c'est-à-dire en
lisant l'audio directement depuis la Browser Source OBS ?

Statut : **prototype livré, verdict OBS en attente de l'owner** (test à faire sur sa machine, OBS
ouvert). Aucune spec ne sera écrite avant ce verdict.

Prototype jetable : `dev/prototype-audio-reactivity.html`, servi par le serveur statique existant.

```text
http://localhost:5500/dev/prototype-audio-reactivity.html
```

## Ce qui est déjà vérifié (cette session, navigateur)

- La chaîne `AnalyserNode` → bandes grave/medium/aigu fonctionne : un oscillateur à 100 Hz donne
  `grave 0.497`, `medium 0.004`, `aigu 0.000` (mesuré, `fftSize` 2048, lissage 0.7, 48 kHz).
  Le découpage par bandes est donc exploitable tel quel pour piloter un effet.
- La page se sert et se rend sans erreur console.
- **Non vérifiable ici** : l'autorisation micro. Dans un Chrome normal, la page reste bloquée sur la
  demande d'autorisation tant que personne ne clique — c'est justement ce que le contexte OBS change.

## Le test que l'owner doit faire

1. Autoriser le micro dans le navigateur interne d'OBS. Ce n'est pas une case à cocher dans
   l'interface : c'est une **option de lancement** à ajouter au raccourci OBS, une fois pour
   toutes.
   - Fermer OBS complètement.
   - Clic droit sur le raccourci OBS → **Propriétés**.
   - Champ **Cible**, ajouter l'option après les guillemets fermants :
     `"C:\Program Files\obs-studio\bin\64bit\obs64.exe" --enable-media-stream`
   - Valider, puis relancer OBS **par ce raccourci** (un lancement depuis le menu Démarrer ou la
     barre des tâches n'aurait pas l'option).
2. Ajouter une source **Navigateur**, URL ci-dessus, 1920×1080.
3. Parler dans le micro et lire le panneau en haut à gauche.

Résultats possibles, tous concluants :

| Affichage | Signification |
|---|---|
| `audio LU — la Browser Source entend le micro` | Voie navigateur viable → on spécifie sur cette base |
| `getUserMedia ABSENT` | OBS n'a pas reçu l'option de lancement (étape 1 manquée, ou OBS relancé autrement que par le raccourci modifié) |
| `getUserMedia REFUSÉ — NotAllowedError` | Option présente mais permission refusée par le conteneur |
| `getUserMedia REFUSÉ — NotFoundError` | Aucun périphérique d'entrée par défaut côté OBS |

Le panneau affiche aussi le périphérique retenu : OBS ne propose pas de sélecteur, il prend
l'entrée **par défaut de Windows**. Si ce n'est pas le bon micro, c'est un réglage système, pas un
réglage overlay.

## Voies possibles selon le verdict

1. **Voie navigateur** (si le test passe) — `background.html` ouvre lui-même le micro, calcule les
   bandes et les passe à l'effet. Zéro process en plus, zéro secret. Contrainte permanente : OBS
   doit toujours être lancé avec l'option, et l'entrée suit le périphérique par défaut de Windows.
2. **Voie obs-websocket** (repli) — un petit pont s'abonne aux niveaux audio publiés par OBS et les
   relaie sur le serveur d'état, comme les événements `/event`. Fonctionne sans option de lancement
   et suit exactement les sources OBS, mais réintroduit un process, un secret et une dépendance à
   OBS ouvert — c'est-à-dire ce qui vient d'être archivé avec le relais.

Le choix se fait au vu du verdict, pas avant.

## Fin de vie

Code jetable : `dev/prototype-audio-reactivity.html` est supprimé dès que la spec ② est écrite (ou
dès que la voie navigateur est écartée). Ne rien construire dessus.
