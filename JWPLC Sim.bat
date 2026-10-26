@echo off
rem SPDX-FileCopyrightText: 2026 JW Control
rem SPDX-License-Identifier: GPL-3.0-or-later
rem Abre JWPLC Sim desde esta copia del repositorio, con los cambios locales.
rem La primera vez descarga el package fijado, el toolchain y las dependencias
rem de la app (node scripts\app.mjs). Requiere Node.js 22 o superior.
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instale Node.js 22 LTS desde https://nodejs.org y vuelva a abrir este archivo.
  pause
  exit /b 1
)
node scripts\app.mjs %*
if errorlevel 1 pause
