@echo off
REM start-dev.bat — double-clic pour une session de réglage (DotGrid + placement).
REM NE JAMAIS utiliser ce script pendant un live — lance des serveurs de dev qui écrivent
REM sur disque (tuner-server.js, placement-server.js, scene-data-server.js). Pour streamer,
REM utiliser start-stream.bat.
REM
REM Un seul terminal : dev/start-dev.js gère les 5 serveurs (statique, relais OBS, tuner DotGrid,
REM placement, données de scènes) comme des process enfants d'un unique process Bun, tués
REM proprement à la fermeture (Ctrl+C). Remplace l'ancienne version à 5 fenêtres détachées,
REM source récurrente de process orphelins tournant pendant des heures (voir docs/inbox.md).
REM Ouvre aussi : un onglet de preview auto-reload + les deux panneaux de réglage.

cd /d "%~dp0"

if not exist ".env" (
  echo [ERREUR] Fichier .env manquant.
  echo Copier .env.example en .env et renseigner OBS_WS_PASSWORD + OVERLAY_RELAY_SECRET.
  echo Voir docs/obs-setup.md pour les instructions completes.
  pause
  exit /b 1
)

bun dev\start-dev.js
if errorlevel 1 (
  echo.
  echo [start-dev] ERREUR : le process s'est arrete de facon inattendue ^(voir ci-dessus^).
  pause
)
