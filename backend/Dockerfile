# ---------------------------------------------------------------------------
# Stage 1: builder — install dependencies into a clean venv
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS builder

WORKDIR /build

# System deps for asyncpg / psycopg compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ---------------------------------------------------------------------------
# Stage 2: runtime image
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

# Non-root user
RUN useradd --system --create-home --uid 1000 jarvis

WORKDIR /home/jarvis

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application source
COPY app/ app/

# Ensure the app directory is owned by the non-root user
RUN chown -R jarvis:jarvis /home/jarvis

USER jarvis

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
