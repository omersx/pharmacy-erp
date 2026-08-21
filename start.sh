#!/usr/bin/env bash
set -e

echo "===================================================="
echo "      Pharmacy ERP - One-Click Setup & Launch"
echo "===================================================="
echo ""

# ── Step 1: Environment File ──────────────────────────
if [ ! -f ".env" ]; then
    echo "[1/4] Creating .env file from .env.example..."
    cp .env.example .env
else
    echo "[1/4] .env file already exists, skipping..."
fi

# ── Step 2: Frontend Dependencies ─────────────────────
echo "[2/4] Installing frontend dependencies..."
cd frontend
pnpm install --force --no-frozen-lockfile
cd ..

# ── Step 3: Backend Setup ─────────────────────────────
echo "[3/4] Setting up Python backend..."
cd backend
if [ ! -d "venv" ]; then
    echo "      Creating virtual environment..."
    python3 -m venv venv
fi
echo "      Installing Python dependencies..."
source venv/bin/activate
pip install -q -r requirements.txt
cd ..

# ── Step 4: Seed Database ─────────────────────────────
if [ ! -f "backend/data/pharmacy.db" ]; then
    echo "[4/4] Seeding the database with demo data..."
    cd backend
    source venv/bin/activate
    python -m app.seed
    cd ..
    echo ""
    echo "===================================================="
    echo " Demo login:  admin@pharmacy.com  /  admin123"
    echo "===================================================="
else
    echo "[4/4] Database already exists, skipping seed..."
fi

# ── Start Servers ─────────────────────────────────────
echo ""
echo "===================================================="
echo " Starting Pharmacy ERP..."
echo "===================================================="
echo ""
echo " Frontend:  http://localhost:3000"
echo " Backend:   http://localhost:8000"
echo " API Docs:  http://localhost:8000/docs"
echo ""
echo " Press Ctrl+C to stop both servers."
echo "===================================================="
echo ""

pnpm dev
