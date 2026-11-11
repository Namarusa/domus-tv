@echo off
title Domus - Freebox Player
cd /d "%~dp0"
set "PY="
py -3 --version >"%TEMP%\domus-check.txt" 2>&1 && set "PY=py -3"
if not defined PY python --version >"%TEMP%\domus-check.txt" 2>&1 && set "PY=python"
if not defined PY python3 --version >"%TEMP%\domus-check.txt" 2>&1 && set "PY=python3"
if not defined PY (
  echo Python introuvable : installez-le depuis https://www.python.org/downloads/
  pause
  exit /b 1
)
%PY% --version
%PY% -c "import zeroconf" >"%TEMP%\domus-check.txt" 2>&1 || (echo Installation de zeroconf ^(detection auto du Player^)... & %PY% -m pip install --quiet zeroconf)
echo Lancement de Domus sur le Freebox Player...
%PY% tools\deploy.py %*
pause
