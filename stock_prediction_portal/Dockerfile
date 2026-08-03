 # ── Backend Dockerfile ──────────────────────────────────────
# Multi-stage build for the Django + LSTM stock prediction API

# Stage 1: Builder — install Python deps into a virtual env
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build-essential for any C-extension wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential gcc && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN grep -v "tensorflow" requirements.txt > requirements_no_tf.txt && \
    python -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir --upgrade pip && \
    /opt/venv/bin/pip install --no-cache-dir --default-timeout=1000 --retries 10 -r requirements_no_tf.txt

RUN /opt/venv/bin/pip install --no-cache-dir --default-timeout=1000 --retries 10 tensorflow-cpu


# Stage 2: Runtime — slim image with only what we need
FROM python:3.12-slim AS runtime

# Install libgomp (required by TensorFlow / numpy at runtime)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 && \
    rm -rf /var/lib/apt/lists/*

# Copy the pre-built virtualenv from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Set working directory
WORKDIR /app

# Copy project files
COPY . .

# Collect static files (django admin, etc.)
RUN python manage.py collectstatic --noinput 2>/dev/null || true

# Make entrypoint executable
RUN chmod +x /app/entrypoint.sh

# Expose the API port
EXPOSE 8000

# Entrypoint: wait for DB, run migrations, then start server
ENTRYPOINT ["/app/entrypoint.sh"]

# Run with Gunicorn for production
CMD ["gunicorn", "core.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "2", \
     "--timeout", "300", \
     "--access-logfile", "-"]
