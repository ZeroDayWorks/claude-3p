#!/usr/bin/env bash
# Generate strong secrets and write them into .env.
# Refuses to overwrite an existing .env - remove it first if you really mean it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
ENV_EXAMPLE="${ROOT_DIR}/.env.example"

need() {
    command -v "$1" >/dev/null 2>&1 || {
        echo "ERROR: required dependency '$1' not found in PATH" >&2
        exit 1
    }
}

need openssl

if [[ ! -f "${ENV_EXAMPLE}" ]]; then
    echo "ERROR: ${ENV_EXAMPLE} not found" >&2
    exit 1
fi

if [[ -f "${ENV_FILE}" ]]; then
    echo "ERROR: ${ENV_FILE} already exists. Refusing to overwrite." >&2
    echo "       Remove it first if you really want to regenerate secrets." >&2
    exit 1
fi

echo "Generating secrets..."
PG_PASS_VALUE="$(openssl rand -base64 36 | tr -d '\n')"
SECRET_KEY_VALUE="$(openssl rand -hex 64 | tr -d '\n')"

# Copy the template and substitute the two secret lines.
cp "${ENV_EXAMPLE}" "${ENV_FILE}"

# Use awk to replace lines starting with PG_PASS= and AUTHENTIK_SECRET_KEY=.
tmp="$(mktemp)"
awk -v pg="${PG_PASS_VALUE}" -v sk="${SECRET_KEY_VALUE}" '
    /^PG_PASS=/                { print "PG_PASS=" pg; next }
    /^AUTHENTIK_SECRET_KEY=/   { print "AUTHENTIK_SECRET_KEY=" sk; next }
    { print }
' "${ENV_FILE}" > "${tmp}"
mv "${tmp}" "${ENV_FILE}"

chmod 600 "${ENV_FILE}"

echo "Wrote ${ENV_FILE} (mode 600) with fresh PG_PASS and AUTHENTIK_SECRET_KEY."
echo "Review AUTH_DOMAIN, SMTP settings, and TLS paths before continuing."
