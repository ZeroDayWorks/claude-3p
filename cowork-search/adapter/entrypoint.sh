#!/bin/sh
set -e

CERT_DIR="/certs"
KEY="$CERT_DIR/key.pem"
CERT="$CERT_DIR/cert.pem"

mkdir -p "$CERT_DIR"

if [ ! -f "$KEY" ] || [ ! -f "$CERT" ]; then
  echo "[entrypoint] No SSL cert found, generating self-signed cert..."
  openssl req -x509 -newkey rsa:2048 -keyout "$KEY" -out "$CERT" \
    -days 365 -nodes \
    -subj "/C=TH/O=Cowork/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
  echo "[entrypoint] Self-signed cert generated at $CERT_DIR"
else
  echo "[entrypoint] Using existing cert at $CERT_DIR"
fi

exec uvicorn main:app \
  --host 0.0.0.0 \
  --port 8090 \
  --ssl-keyfile "$KEY" \
  --ssl-certfile "$CERT"