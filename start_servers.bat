@echo off
title Pharma ERP Launcher
echo ===================================================
echo Starting Pharma ERP - Backend and Frontend Services
echo ===================================================

echo Starting Backend API on http://127.0.0.1:8000 ...
start "Pharma ERP - FastAPI Backend" cmd /k "cd /d "%~dp0backend" && .\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo Starting Frontend on http://localhost:3001 ...
start "Pharma ERP - Next.js Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Both servers have been launched in separate console windows!
echo - Backend API Docs: http://127.0.0.1:8000/docs
echo - Frontend Application: http://localhost:3001
echo ===================================================
