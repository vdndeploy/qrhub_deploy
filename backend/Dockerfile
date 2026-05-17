FROM python:3.11-slim

WORKDIR /app

# System deps for reportlab/Pillow + curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libjpeg-dev zlib1g-dev libfreetype6-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8001/api/auth/me || exit 0

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001", "--proxy-headers", "--forwarded-allow-ips=*"]
