@echo off
REM start-stream.bat — double-clic pour lancer le fond autonome dans OBS.
REM Un seul terminal, logs prefixes par serveur, fermeture (X ou Ctrl+C) tue les 2 serveurs
REM proprement (dev/start-stream.js, Job Object Windows) -- plus de port orphelin (2026-07-10).
REM Lance uniquement le serveur statique et l'état du fond ; aucun secret OBS n'est requis.

cd /d "%~dp0"

bun dev\start-stream.js
if errorlevel 1 (
  echo.
  echo [start-stream] ERREUR : le process s'est arrete de facon inattendue ^(voir ci-dessus^).
  pause
)
