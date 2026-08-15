#!/usr/bin/env bash
# Bootstrap the Authentik stack.
# - Verifies deps
# - Pulls pinned images
# - Starts db + redis, waits for health
# - Starts server + worker
# - Polls /-/health/live/ until Authentik answers
# - Prints the initial setup URL
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

need() {
    command -v "$1" >/dev/null 2>&1 || {
        echo "ERROR: required dependency '$1' not found in PATH" >&2
        exit 1
    }
}

need docker
need curl
need jq
docker compose version >/dev/null 2>&1 || {
    echo "ERROR: 'docker compose' (v2) is required" >&2
    exit 1
}

if [[ ! -f .env ]]; then
    echo "ERROR: .env not found. Run: make init && make secrets" >&2
    exit 1
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a

: "${AUTH_DOMAIN:?AUTH_DOMAIN must be set in .env}"

echo "==> Pulling pinned images"
docker compose pull

echo "==> Starting db + redis"
docker compose up -d db redis

echo "==> Waiting for db health"
for i in $(seq 1 60); do
    status="$(docker compose ps --format json db | jq -r 'if type=="array" then .[0].Health else .Health end' 2>/dev/null || echo "")"
    if [[ "${status}" == "healthy" ]]; then
        echo "    db healthy"
        break
    fi
    sleep 2
    if [[ $i -eq 60 ]]; then
        echo "ERROR: db did not become healthy in 120s" >&2
        docker compose logs --tail=50 db >&2
        exit 1
    fi
done

echo "==> Starting server + worker"
docker compose up -d server worker

echo "==> Polling https://${AUTH_DOMAIN}/-/health/live/"
# Try up to 5 minutes - first boot runs DB migrations.
ok=0
for i in $(seq 1 60); do
    if curl -fsS --max-time 5 -k "https://${AUTH_DOMAIN}/-/health/live/" >/dev/null 2>&1; then
        ok=1
        break
    fi
    # Fall back to loopback if the reverse proxy isn't up yet (dev override).
    if curl -fsS --max-time 5 "http://127.0.0.1:9000/-/health/live/" >/dev/null 2>&1; then
        ok=1
        break
    fi
    sleep 5
done

if [[ ${ok} -ne 1 ]]; then
    echo "WARN: Authentik health endpoint did not respond after ~5 minutes." >&2
    echo "      Check: docker compose logs -f server worker" >&2
else
    echo "    Authentik responded to /-/health/live/"
fi

cat <<EOF

============================================================================
Authentik is starting.

  Initial setup:  https://${AUTH_DOMAIN}/if/flow/initial-setup/
  (trailing slash is intentional)

Next steps:
  1. Open the URL above and set the akadmin password.
  2. Enable TOTP or WebAuthn on the akadmin account IMMEDIATELY.
  3. Confirm the Claude Desktop application appears under Applications.
     Blueprints under ./blueprints/ auto-apply within ~1 minute of worker
     startup. Re-run 'make apply-blueprint' to force a reconcile.
  4. Run 'make verify' to sanity-check the OIDC discovery document.
============================================================================
EOF
