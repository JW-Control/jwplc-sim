@echo off
rem SPDX-FileCopyrightText: 2026 JW Control
rem SPDX-License-Identifier: GPL-3.0-or-later
rem Prueba una rama o un PR de JWPLC Sim sin instalar nada: trae la rama de
rem GitHub y abre la app desde esta copia del repositorio (JWPLC Sim.bat).
rem
rem   Probar rama.bat                      pregunta la rama (Enter = main)
rem   Probar rama.bat feature/alpha17-x    esa rama
rem   Probar rama.bat 20                   el PR #20
rem
rem No borra cambios locales: si hay archivos modificados, avisa y se detiene.
setlocal
cd /d "%~dp0"
where git >nul 2>nul
if errorlevel 1 (
  echo No se encontro git. Instale Git para Windows o GitHub Desktop.
  pause
  exit /b 1
)
set "RAMA=%~1"
if "%RAMA%"=="" set /p "RAMA=Rama o numero de PR a probar (Enter = main): "
if "%RAMA%"=="" set "RAMA=main"
echo %RAMA%| findstr /r "^[0-9][0-9]*$" >nul
if errorlevel 1 (
  set "REF=refs/heads/%RAMA%"
) else (
  set "REF=refs/pull/%RAMA%/head"
)
echo Trayendo %REF% ...
git fetch origin "%REF%"
if errorlevel 1 (
  echo No se pudo traer "%RAMA%" de GitHub.
  pause
  exit /b 1
)
git switch --detach FETCH_HEAD
if errorlevel 1 (
  echo Hay cambios locales sin guardar: guardelos o descartelos en GitHub Desktop y vuelva a intentar.
  pause
  exit /b 1
)
git log -1 --format="Probando %%h  %%s"
call "JWPLC Sim.bat"
