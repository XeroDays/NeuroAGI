@echo off
cd /d "%~dp0"
echo Running model latency benchmark...
echo Requires OPENROUTER_API_KEY in .env
echo.
call npm.cmd run benchmark:latency
if errorlevel 1 (
  echo.
  echo Benchmark failed.
  pause
  exit /b 1
)
echo.
pause
