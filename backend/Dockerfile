FROM python:3.12-slim AS base

LABEL org.opencontainers.image.title="Pharmacy ERP Backend"
LABEL org.opencontainers.image.description="FastAPI backend for Pharmacy ERP & POS System"
LABEL org.opencontainers.image.source="https://github.com/omersx/pharmacy-erp"
LABEL org.opencontainers.image.licenses="MIT"

# ── Dependencies stage ──────────────────────────────────
FROM base AS deps

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Production stage ────────────────────────────────────
FROM base AS runner

WORKDIR /app

# Create non-root user
RUN groupadd --system --gid 1001 appuser && \
    useradd --system --uid 1001 --gid appuser appuser

# Copy installed packages from deps stage
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

# Copy application code
COPY . .

# Create data directory
RUN mkdir -p /app/data && chown -R appuser:appuser /app/data

# Switch to non-root user
USER appuser

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/docs')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
