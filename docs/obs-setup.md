# Configuration OBS — Browser Source

> Étape 1 du lancement stream : afficher l'overlay dans OBS. Ne couvre **pas** les données live
> (viewers, chat, alertes) — voir §Limite actuelle plus bas et `docs/MAP.md` (S4).

## 1. Servir la page localement

Zero-build, mais OBS Browser Source a besoin d'une URL `http://` (pas `file://`, certaines APIs DOM
échouent en `file://`). Servir le dossier du projet avec Bun :

```bash
bunx serve -l 5500 .
```

Depuis la racine du repo (`C:\DEV\overlay`). Laisser tourner pendant tout le stream — c'est un
process séparé d'OBS, à démarrer avant d'ouvrir OBS (ou à relancer si le PC redémarre).

Vérifier que ça répond : `http://localhost:5500/index.html` doit afficher l'overlay (fond noir +
grille de points) dans un navigateur classique avant de le brancher à OBS.

## 2. Ajouter la Browser Source dans OBS

Dans la scène OBS où l'habillage doit apparaître :

1. **Sources → + → Navigateur (Browser Source)**
2. Nouvelle source, nom libre (ex. `Overlay Atelier`)
3. Renseigner :
   - **URL** : `http://localhost:5500/index.html`
   - **Largeur** : `1920`
   - **Hauteur** : `1080`
   - **FPS personnalisé** : laisser la valeur par défaut (30 suffit, l'animation DotGrid tourne en JS, pas en dépendance du FPS de capture)
4. **Décocher** « Actualiser le navigateur quand la scène devient active » — le DotGrid doit rester
   une instance continue (pas de reload à chaque changement de scène OBS, cf. `docs/overview.md`
   §Couche de fond DotGrid).
5. **Décocher** « Arrêter la source si non visible » — sinon les composants perdent leur état/timers
   quand la source est masquée par une autre scène OBS.
6. Placer la source **par-dessus** vos autres captures (webcam, capture d'écran) dans l'ordre des
   calques OBS — l'overlay est conçu pour être au premier plan (widgets + grille), pas en fond.

## 3. Vérification visuelle avant stream

Repasser sur chaque scène de l'overlay (`discussion`, `brb`, `codage`, `jeu`, `interview`, `react`,
`creation`, `fin`) au moins une fois en conditions réelles OBS 1920×1080 avant le premier live —
la vérification de cette session (S3b) s'est arrêtée à `bun test` (voir gap tracé dans
`docs/MAP.md` / `docs/handoffs/handoff-latest.md`), pas de vérification visuelle en navigateur.

Pas de mécanisme de changement de scène depuis OBS pour l'instant (voir limite ci-dessous) : pour
prévisualiser une scène donnée, il faut déclencher l'événement `overlay:scene-change` manuellement
depuis la console DevTools du Browser Source OBS (clic droit → Interagir, ou depuis un navigateur
classique sur `localhost:5500`) :

```js
document.dispatchEvent(new CustomEvent('overlay:scene-change', { detail: { scene: 'discussion' } }));
```

## Limite actuelle — pas de données live

`store.js` tente une connexion WebSocket sur `ws://localhost:4455` (voir `store.js:30`) mais **aucun
serveur n'écoute encore sur ce port** — le relais qui parlerait le vrai protocole OBS WebSocket v5
(handshake, auth SHA256) ou qui relaierait des événements Twitch n'est pas construit (S4 du
`docs/MAP.md`, non démarré).

Conséquence concrète : sans S4, l'overlay tourne en **mode fallback statique** — `viewers`, `chat`,
`alertes`, `guest`, etc. restent aux valeurs par défaut (`STATIC_FALLBACK` dans `store.js`), seule la
**durée** avance via une minuterie locale. C'est suffisant pour streamer avec l'habillage visuel
(bandes dorées, grille de points, structure de scène), mais pas pour un affichage viewers/chat/alertes
en temps réel.

**Prochaine étape recommandée** pour débloquer les données live : cadrer et implémenter S4
(voir `docs/MAP.md` §Découpage des sessions) — relais Bun qui parle OBS WebSocket v5 côté OBS et
expose `{ type, data }` côté overlay (protocole déjà spécifié, `docs/specs/scene-config-protocol.md`).
