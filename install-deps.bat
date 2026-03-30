@echo off
cd /d "%~dp0"
echo Installing dependencies (node_modules)...
call npm.cmd install
if errorlevel 1 (
  echo.
  echo Install failed.
  pause
  exit /b 1
)
echo.
echo Done. Run run.bat to start the app.
pause
