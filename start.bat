@echo off
REM ============================================================
REM  start.bat - Windows one-click launcher
REM  Starts the server and opens the default browser.
REM  Stop: press Ctrl-C in this window.
REM ============================================================
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not in PATH.
  echo Install it from https://nodejs.org and run start.bat again.
  echo.
  pause
  exit /b 1
)

echo Starting Surviv BR ...
echo The server runs in this window and your browser opens at http://localhost:3000
echo (To stop the server later, press Ctrl-C here.)
echo.
node launch.js %*
set RC=%errorlevel%

if not "%RC%"=="0" (
  echo.
  echo Server exited with code %RC%. Check the log above.
  pause
)
endlocal
