#!/usr/bin/env bash
set -e

echo "========================================="
echo "      Starting Pharmacy ERP Setup"
echo "========================================="

# Check if .env exists, if not copy it
if [ ! -f ".env" ]; then
    echo "[1/4] Creating .env file from .env.example..."
    cp .env.example .env
else
    echo "[1/4] .env file already exists, skipping..."
fi

echo "[2/4] Installing frontend dependencies..."
pnpm run setup:frontend

echo "[2/4] Setting up Python backend..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..

echo "[3/4] Seeding the database with demo data..."
cd backend
source venv/bin/activate
python -m app.seed
cd ..

echo "[4/4] Starting the frontend and backend servers..."
pnpm dev
