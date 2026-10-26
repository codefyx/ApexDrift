@echo off
setlocal
title Apex Drift
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js was not found on this PC.
  echo  Install the LTS build from https://nodejs.org then run this file again.
  echo.
  pause
  exit /b 1
)

echo.
echo  Starting Apex Drift...
echo  Keep this window open while you play. Press Ctrl+C to stop.
echo.

start "" /b cmd /c "timeout /t 2 >nul & start http://localhost:5173"
node server.js
pause
