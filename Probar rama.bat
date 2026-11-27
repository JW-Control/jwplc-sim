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
rem Una rama queda como rama (no "Detached HEAD"); un PR, desacoplado.
setlocal
cd /d "%~dp0"
rem git: el del PATH o, si no hay, el que trae GitHub Desktop.
where git >nul 2>nul
if errorlevel 1 (
  for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do (
    if exist "%%D\resources\app\git\cmd\git.exe" set "PATH=%%D\resources\app\git\cmd;%PATH%"
  )
)
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
if errorlevel 1 goto rama
rem PR: se prueba su ultimo commit sin rama local (HEAD desacoplado).
echo Trayendo el PR #%RAMA% ...
git fetch origin "refs/pull/%RAMA%/head"
if errorlevel 1 goto sinred
git switch --detach FETCH_HEAD
if errorlevel 1 goto cambios
goto abrir
:rama
rem Rama: se queda EN la rama (GitHub Desktop no muestra "Detached HEAD") y
rem se adelanta a la de GitHub. Si la copia local tiene commits propios que
rem no estan en GitHub, no se tocan: avisa y se detiene.
echo Trayendo %RAMA% ...
git fetch origin "+refs/heads/%RAMA%:refs/remotes/origin/%RAMA%"
if errorlevel 1 goto sinred
git switch "%RAMA%" 2>nul || git switch -c "%RAMA%" --track "origin/%RAMA%"
if errorlevel 1 goto cambios
git merge --ff-only "origin/%RAMA%"
if errorlevel 1 (
  echo La rama local "%RAMA%" tiene commits que no estan en GitHub. Revisela en GitHub Desktop.
  pause
  exit /b 1
)
goto abrir
:sinred
echo No se pudo traer "%RAMA%" de GitHub.
pause
exit /b 1
:cambios
echo Hay cambios locales sin guardar: guardelos o descartelos en GitHub Desktop y vuelva a intentar.
pause
exit /b 1
:abrir
git log -1 --format="Probando %%h  %%s"
call "JWPLC Sim.bat"
