@echo off
REM SQLInsight — start the server (Windows).
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo [!] Virtual environment not found. Please ensure .venv is set up.
    pause
    exit /b 1
)

echo ==> Starting SQLInsight on http://127.0.0.1:5000
echo     Press Ctrl+C to stop.
echo.
.venv\Scripts\python.exe backend\app.py
