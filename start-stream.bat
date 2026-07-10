@echo off
REM start-stream.bat — double-clic pour lancer le serveur statique + le relais OBS.
REM Un seul terminal, logs prefixes par serveur, fermeture (X ou Ctrl+C) tue les 2 serveurs
REM proprement (dev/start-stream.js, Job Object Windows) -- plus de port orphelin (2026-07-10).
REM Nécessite un fichier .env local (copier .env.example -> .env, voir docs/obs-setup.md §4.2).

cd /d "%~dp0"

bun dev\start-stream.js
if errorlevel 1 (
  echo.
  echo [start-stream] ERREUR : le process s'est arrete de facon inattendue ^(voir ci-dessus^).
  pause
)
