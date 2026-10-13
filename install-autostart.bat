@echo off
cd /d "%~dp0"
title Text Editor - startup

echo.
echo    Add "Text Editor" to Windows startup.
echo    A tray icon will appear automatically after you sign in.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tray.ps1" -Install
if errorlevel 1 (
  echo.
  echo    [FAILED] Could not install. See the message above.
  pause
  exit /b 1
)

echo    Starting the tray icon now...
start "" wscript.exe "%~dp0start-tray.vbs"

echo.
echo    Done. The icon lives in the tray (hidden icons area, bottom right).
echo    Double-click it to open the editor.
echo    To undo, run the other .bat file in this folder.
echo.
pause
