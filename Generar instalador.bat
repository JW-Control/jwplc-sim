@echo off
rem SPDX-FileCopyrightText: 2026 JW Control
rem SPDX-License-Identifier: GPL-3.0-or-later
rem Genera el instalador y el portable de JWPLC Sim con esta copia del
rem repositorio (node scripts\dist.mjs). Quedan en build\dist\:
rem   JWPLC-Sim-<version>-instalador.exe
rem   JWPLC-Sim-<version>-portable.zip
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instale Node.js 22 LTS desde https://nodejs.org y vuelva a abrir este archivo.
  pause
  exit /b 1
)
node scripts\dist.mjs %*
if errorlevel 1 (
  pause
  exit /b 1
)
rem Regla: no se entrega un instalador sin abrir la app empaquetada y recorrer
rem todas sus pestanas, Planta 3D incluida (app\tests\e2e-empaquetado.mjs).
pushd app
node tests\e2e-empaquetado.mjs
set PRUEBA=%errorlevel%
popd
if not "%PRUEBA%"=="0" (
  echo.
  echo LA APP EMPAQUETADA FALLO LA PRUEBA: NO entregar este instalador. Capturas en build\gates\empaquetado
  explorer "%~dp0build\gates\empaquetado"
  pause
  exit /b 1
)
explorer "%~dp0build\dist"
