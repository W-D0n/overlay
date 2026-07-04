@echo off
REM start-dev.bat — double-clic pour une session de réglage (DotGrid + placement).
REM NE JAMAIS utiliser ce script pendant un live — lance des serveurs de dev qui écrivent
REM sur disque (tuner-server.js, placement-server.js). Pour streamer, utiliser start-stream.bat.
REM
REM Lance : serveur statique + relais OBS (données live + rafraîchissement auto du cache OBS)
REM         + serveur d'écriture DotGrid + serveur d'écriture placement.
REM Ouvre : un onglet de preview auto-reload + les deux panneaux de réglage.

cd /d "%~dp0"

if not exist ".env" (
  echo [ERREUR] Fichier .env manquant.
  echo Copier .env.example en .env et renseigner OBS_WS_PASSWORD + OVERLAY_RELAY_SECRET.
  echo Voir docs/obs-setup.md pour les instructions completes.
  pause
  exit /b 1
)

start "Overlay DEV - Serveur statique (5500)" cmd /k bunx serve -l 5500 .
start "Overlay DEV - Relais OBS" cmd /k bun relay\server.js
start "Overlay DEV - Tuner DotGrid" cmd /k bun dev\tuner-server.js
start "Overlay DEV - Tuner Placement" cmd /k bun dev\placement-server.js

timeout /t 2 /nobreak >nul

start "" "http://localhost:5500/?livereload=1"
start "" "http://localhost:5500/dev/dotgrid-tuner.html"
start "" "http://localhost:5500/dev/placement-panel.html"
