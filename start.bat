@echo off
title Pharmacy ERP
color 0A

echo.
echo  ====================================================
echo       Pharmacy ERP - One-Click Setup ^& Launch
echo  ====================================================
echo.

REM ── Step 1: Environment File ──────────────────────────
if not exist ".env" (
    echo  [1/4] Creating .env file from .env.example...
    copy .env.example .env >nul
) else (
    echo  [1/4] .env file already exists, skipping...
)

REM ── Step 2: Frontend Dependencies ─────────────────────
echo  [2/4] Installing frontend dependencies...
cd frontend
call pnpm install --force --no-frozen-lockfile 2>nul
if errorlevel 1 (
    echo.
    echo  ERROR: Frontend install failed. Make sure pnpm is installed:
    echo         npm install -g pnpm
    echo.
    pause
    exit /b 1
)
cd ..

REM ── Step 3: Backend Setup ─────────────────────────────
echo  [3/4] Setting up Python backend...
cd backend

if not exist "venv" (
    echo        Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo.
        echo  ERROR: Python venv creation failed. Make sure Python 3.12+ is installed.
        echo         Download from: https://python.org
        echo.
        pause
        exit /b 1
    )
)

echo        Installing Python dependencies...
call .\venv\Scripts\pip install -q -r requirements.txt
if errorlevel 1 (
    echo.
    echo  ERROR: Python dependency install failed.
    echo.
    pause
    exit /b 1
)

cd ..

REM ── Step 4: Seed Database ─────────────────────────────
if not exist "backend\data\pharmacy.db" (
    echo  [4/4] Seeding the database with demo data...
    cd backend
    call .\venv\Scripts\python -m app.seed
    cd ..
    echo.
    echo  ====================================================
    echo   Demo login:  admin@pharmacy.com  /  admin123
    echo  ====================================================
) else (
    echo  [4/4] Database already exists, skipping seed...
)

REM ── Start Servers ─────────────────────────────────────
echo.
echo  ====================================================
echo   Starting Pharmacy ERP...
echo  ====================================================
echo.
echo   Frontend:  http://localhost:3000
echo   Backend:   http://localhost:8000
echo   API Docs:  http://localhost:8000/docs
echo.
echo   Press Ctrl+C to stop both servers.
echo  ====================================================
echo.

call pnpm dev
