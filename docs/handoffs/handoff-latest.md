**Handoff — 2026-07-17**

Focus courant : **mode background-only**. Le moteur de scènes, l'éditeur et le relais OBS restent
dans le dépôt mais sont mis en pause.

## Flux actif

- OBS live : `http://localhost:5500/background.html`
- OBS par preset : `http://localhost:5500/background.html?preset=Nom&transparent=1`
- Tuner : `http://localhost:5500/dev/background-tuner.html`
- État live/presets : `dev/background-state-server.js`, port 4462
- 12 effets enregistrés, un seul actif à la fois

## Dernier lot

- WaterRipple accepté après redémarrage du serveur obsolète ; serveur d'état auto-rechargé en dev.
- Bubble : éclatement aléatoire réparti dans le viewport et réglages associés.
- MatrixGrid : Canvas 2D continu à la place des plans CSS 3D, 13 réglages exposés et traverses
  bornées par le trapèze de perspective ; débordement latéral automatique selon le point de fuite.
  Le fondu est limité à l'horizon et les lignes de fuite atteignent les bords haut/bas du viewport.
- URL OBS par preset + bouton de copie et synchronisation `/presets-ws`.
- Nettoyage : neuf rendus de scène conservés ; proxy de placement et archives de session obsolètes
  retirés ; `start-dev` recentré sur une seule session de création fonds + scènes.

## Vérification

- `bun test` : **261/261 verts**.
- WaterRipple accepté par le POST `/state` réel ; événement de preset vérifié en WebSocket.
- Tuner, MatrixGrid et URL de preset vérifiés dans Chromium à 1920×1080, sans erreur console.

## Restant

1. Validation visuelle owner de MatrixGrid dans une vraie Browser Source OBS/CEF.
2. Retour détaillé sur ColorDrops.
3. Décider plus tard si l'automatisation OBS WebSocket apporte quelque chose au-delà des URL par
   preset désormais disponibles.

Le worktree contient des changements owner antérieurs et le lot courant non committé : ne pas
nettoyer ni restaurer globalement les fichiers.
