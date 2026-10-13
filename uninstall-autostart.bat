@echo off
cd /d "%~dp0"
title Text Editor - remove startup

echo.
echo    Remove "Text Editor" from Windows startup.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tray.ps1" -Uninstall

echo.
echo    Done. If the tray icon is still there, right-click it and choose Exit.
echo.
pause
