@echo off
REM kill-servers.bat — double-clic pour tuer les serveurs de dev/live du projet restes bloques sur
REM leur port apres une fermeture violente (crash, Gestionnaire des taches, coupure).
REM Filet de securite manuel : studio.bat fait deja ce nettoyage automatiquement a chaque
REM lancement ; ce script sert quand ni studio.bat ni stream.bat ne tourne pour le faire.
REM Ne touche jamais un process qui n'est pas un bun.exe (voir dev/port-check.js) : un port occupe
REM par autre chose est signale, pas tue.

cd /d "%~dp0"

bun dev\kill-servers.js
pause
