@echo off
cd /d "%~dp0"
title Text Editor

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js 18 or newer:
  echo         https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\codemirror\lib\codemirror.js" (
  echo First run: installing dependencies, please wait...
  call npm install --cache ".npm-cache" --no-audit --no-fund
  if errorlevel 1 (
    echo [ERROR] npm install failed. Please check your network.
    pause
    exit /b 1
  )
)

node server.js
pause
