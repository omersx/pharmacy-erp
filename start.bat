@echo off
echo =========================================
echo       Starting Pharmacy ERP Setup
echo =========================================

REM Check if .env exists, if not copy it
if not exist ".env" (
    echo [1/4] Creating .env file from .env.example...
    copy .env.example .env
) else (
    echo [1/4] .env file already exists, skipping...
)

echo [2/4] Installing frontend dependencies and setting up Python backend...
call pnpm run setup

echo [3/4] Seeding the database with demo data...
call pnpm run seed

echo [4/4] Starting the frontend and backend servers...
call pnpm dev
