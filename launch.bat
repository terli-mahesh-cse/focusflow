@echo off
title FocusFlow Launcher
setlocal

echo =======================================================
echo          FocusFlow - Pomodoro Study Timer
echo =======================================================
echo.

cd /d "%~dp0"

:: Check for virtual environment python, otherwise use system python
if exist "venv\Scripts\python.exe" (
    set "PYTHON_EXE=venv\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

echo [1/2] Opening FocusFlow in your browser...
start http://127.0.0.1:5000

echo [2/2] Starting local Flask server on http://127.0.0.1:5000 ...
echo.
echo Press Ctrl+C in this window to stop the server when done.
echo =======================================================
echo.

"%PYTHON_EXE%" app.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Failed to start FocusFlow with %PYTHON_EXE%.
    echo Please make sure Python and dependencies are installed.
    echo Try running: pip install -r requirements.txt
    echo.
    pause
)
