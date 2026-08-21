# ==============================================================================
# Stage 1: Build Frontend (Next.js)
# ==============================================================================
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend

# Install dependencies
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm
COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY frontend/ .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

# ==============================================================================
# Stage 2: Final Unified Image (Python + Node.js + Nginx + Supervisord)
# ==============================================================================
FROM python:3.12-slim

LABEL org.opencontainers.image.title="Pharmacy ERP"
LABEL org.opencontainers.image.description="All-in-one image containing Frontend, Backend, and Proxy"
LABEL org.opencontainers.image.source="https://github.com/omersx/pharmacy-erp"

# Install system dependencies, Node.js, Nginx, and Supervisord
RUN apt-get update && apt-get install -y \
    curl \
    supervisor \
    nginx \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Backend Setup ──────────────────────────────────────────────
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ ./backend/
RUN mkdir -p /app/backend/data

# ── Frontend Setup ─────────────────────────────────────────────
# Copy the Next.js standalone output (includes its own node_modules)
COPY --from=frontend-builder /app/frontend/public ./frontend/public
COPY --from=frontend-builder /app/frontend/.next/standalone ./frontend/
COPY --from=frontend-builder /app/frontend/.next/static ./frontend/.next/static

# ── Services Setup ─────────────────────────────────────────────
# Copy configurations
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY nginx-standalone.conf /etc/nginx/nginx.conf

# Environment Variables
ENV NODE_ENV=production
ENV APP_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=http://localhost/api/v1
# Note: Next.js standalone server runs from /app/frontend/server.js

# Expose HTTP port
EXPOSE 80

# Health check tests Nginx which in turn checks the frontend
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

# Start Supervisord (which starts Nginx, FastAPI, and Next.js)
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
