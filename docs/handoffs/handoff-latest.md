# Handoff — 2026-07-26

**Commencer par `docs/inbox.md`**, section « À regarder en priorité ». L'audit produit est terminé ;
la prochaine session traite le retour de QA de l'owner, pas une nouvelle fonctionnalité.

## État actuel

- `main` == `origin/main`, working tree propre, **372 tests verts**
- URL OBS : `http://localhost:5500/background.html`
  (variantes : `?preset=<id>`, `?transparent=1`, `?branding=only`, `?branding=off`, `?quality=performance`)
- Studio : `http://localhost:5500/dev/studio.html` — trois espaces : Fond · Habillage · Diffusion
- Serveurs : `start-stream.bat` pour le live (statique + état, port 4462), `start-dev.bat` pour créer
- Canvas de référence : **2560×1440**. Raisonner et vérifier en 1440p, jamais en 1080p.
- Connexion OBS (mapping scène → preset) : active seulement si `OBS_WS_PASSWORD` est dans `.env`
- Moteur de scènes archivé, restaurable via le tag git `scene-engine-v1`
- Une seule branche, locale et distante (convention inscrite dans `CLAUDE.md`)

## Ce qui attend l'owner, et rien d'autre

Quatre jugements humains, tous décrits dans `docs/inbox.md` :

1. la **QA OBS 1440p** — protocole en cases à cocher, résultats à consigner dans §Résultats ;
2. **ShapeMorph** — les cinq contours et leurs interpolations ;
3. **ColorDrops** — rendu, rythme, lisibilité ;
4. l'**amplitude des réactions audio** sur Rain, FloatingSymbols, ColorDrops, OrbitingShapes.

Point de vigilance le plus concret : pendant une transition, **deux effets tournent simultanément**
sur une surface 1,8× plus grande qu'en 1080p. Jamais mesuré en conditions de live.

## Ce que le dernier lot a livré (2026-07-25 → 26)

Audit produit ①→⑦ complet ; détail par lot dans `docs/MAP.md`, spec par spec dans
`docs/specs/_index.md`. Les quatre points saillants :

- **Audio sur les 11 effets**, motif commun dans `components/audio-reaction.js`. Correction de fond
  au passage : `level` moyennait 20–8000 Hz, donc une voix tombait sous 10 % et les effets pilotés
  par lui ne bougeaient que de quelques pourcents. `level` est désormais la **bande la plus
  chargée**, et chaque bande son **maximum**. Conséquence : DotGrid, Bubble et WaterRipple réagissent
  plus fort qu'au moment de leur validation initiale.
- **Transitions** entre presets, déclarées par le preset entrant. La transition présente dans l'état
  diffusé **est** le signal qui distingue une arrivée de preset d'un simple réglage.
- **Branding** (pseudo + réseaux), posé au glisser-déposer, masquable par preset, disponible seul via
  `?branding=only`. Rendu dans un espace de conception 2560×1440 puis mis à l'échelle.
- **Mapping scène OBS → preset** en lecture seule, hébergé par le serveur d'état (aucun process en
  plus, contrairement à l'ancien relais).

## Leçons de méthode, valables au-delà de ce lot

- **Les tests verts n'ont attrapé aucun des défauts visuels réels** : animation qui sautait, calque
  sortant qui disparaissait d'un coup, bord de balayage trop net, masques non complémentaires. Tous
  trouvés en regardant l'écran. Pour du rendu, mesurer dans le navigateur.
- **Le pixel-diff sature** sur les champs de lignes fines : un déplacement d'un pixel change déjà
  tous les pixels de la ligne, donc il ne peut pas valider une accélération (Rain, FloatingSymbols).
- **Un `catch` de chargement qui n'affiche qu'un message** masque aussi les erreurs de
  programmation : c'est ce qui a laissé la section branding du tuner démarrer vide, en silence.
- **Le serveur de dev sert en `no-store`** — sans ça, la Browser Source OBS gardait d'anciens modules
  et exécutait du code corrigé depuis longtemps : beaucoup de temps perdu en diagnostic.
- **Un faux serveur OBS et le vrai OBS peuvent écouter le même port 4455** sous Windows : toute
  vérification avec un faux serveur doit utiliser un port distinct pour savoir ce qu'on teste.

## Différé, assumé

- Intégration Twitch EventSub réelle — le point d'entrée `POST /event` existe et est testé.
- Capture du **son du bureau** plutôt que du micro : se traite avec un périphérique de bouclage
  Windows, sans changement de code.
- Les guides existent en `.md` **et** `.html`, maintenus à la main en parallèle. Divergence facile —
  vérifier les deux quand on documente une fonctionnalité.
