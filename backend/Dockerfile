FROM python:3.11-slim

WORKDIR /app

# System deps for reportlab/Pillow + curl for healthcheck + flyctl for
# the in-app "Deploy Backend Code" button (Super Admin → Deploy panel).
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libjpeg-dev zlib1g-dev libfreetype6-dev curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install flyctl so the backend can self-deploy via the dashboard. Token
# is read at runtime from db.config.flyio_api_key — never baked into the image.
RUN curl -L https://fly.io/install.sh | FLYCTL_INSTALL=/usr/local sh \
    && ln -sf /usr/local/bin/flyctl /usr/local/bin/fly

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8001/api/auth/me || exit 0

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001", "--proxy-headers", "--forwarded-allow-ips=*"]
