@echo off
rem Development: the API (backend\, http://127.0.0.1:8000) in its own window and the site (Vite,
rem http://localhost:5173) in this one; the browser opens by itself. Ctrl+C or closing the windows stops them.
rem The first run installs what is missing (node_modules; uv makes backend\.venv itself).
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo npm install...
  call npm install || goto :error
)

where uv >nul 2>nul
if not errorlevel 1 (
  start "Loader3D API" /d "%~dp0backend" cmd /k uv run python -m app --reload
) else if exist "backend\.venv\Scripts\python.exe" (
  start "Loader3D API" /d "%~dp0backend" cmd /k .venv\Scripts\python.exe -m app --reload
) else (
  echo Нужен uv: https://docs.astral.sh/uv/ ^(или backend\.venv после "uv sync"^)
  goto :error
)

echo API: http://127.0.0.1:8000   Сайт: http://localhost:5173
call npm run dev -- --open
goto :eof

:error
pause
exit /b 1
