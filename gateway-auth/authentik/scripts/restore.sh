#!/usr/bin/env bash
# Restore an Authentik backup produced by scripts/backup.sh.
# Usage: scripts/restore.sh backups/authentik-YYYYmmdd-HHMMSSZ.tar.gz
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' not found" >&2; exit 1; }; }
need docker
need tar
need gzip
need sha256sum

ARCHIVE="${1:-}"
if [[ -z "${ARCHIVE}" || ! -f "${ARCHIVE}" ]]; then
    echo "Usage: $0 <backups/authentik-*.tar.gz>" >&2
    exit 1
fi

if [[ ! -f .env ]]; then echo "ERROR: .env not found" >&2; exit 1; fi
# shellcheck disable=SC1091
set -a; . ./.env; set +a

# ---- Verify checksum --------------------------------------------------
if [[ -f "${ARCHIVE}.sha256" ]]; then
    echo "==> Verifying sha256"
    (cd "$(dirname "${ARCHIVE}")" && sha256sum -c "$(basename "${ARCHIVE}").sha256")
else
    echo "WARN: no ${ARCHIVE}.sha256 next to archive - continuing without checksum verify"
fi

# ---- Extract ----------------------------------------------------------
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
tar -C "${WORK}" -xzf "${ARCHIVE}"

SQL_GZ="$(ls -1 "${WORK}"/postgres-*.sql.gz | head -1)"
FILES_TGZ="$(ls -1 "${WORK}"/files-*.tar.gz | head -1)"

if [[ ! -f "${SQL_GZ}" ]]; then
    echo "ERROR: no postgres dump inside archive" >&2
    exit 1
fi

# ---- Stop server + worker so nothing writes during restore ------------
echo "==> Stopping server + worker"
docker compose stop server worker

# ---- Restore DB -------------------------------------------------------
echo "==> Ensuring db is running"
docker compose up -d db redis
for _ in $(seq 1 30); do
    status="$(docker compose ps --format json db | jq -r 'if type=="array" then .[0].Health else .Health end' 2>/dev/null || echo "")"
    [[ "${status}" == "healthy" ]] && break
    sleep 2
done

echo "==> Restoring PostgreSQL"
gunzip -c "${SQL_GZ}" \
    | docker compose exec -T db psql \
        -U "${PG_USER:-authentik}" \
        -d "${PG_DB:-authentik}" \
        -v ON_ERROR_STOP=1

# ---- Restore file trees ----------------------------------------------
if [[ -f "${FILES_TGZ}" ]]; then
    echo "==> Restoring media / custom-templates / blueprints"
    tar -C "${ROOT_DIR}" -xzf "${FILES_TGZ}"
fi

# ---- Bring services back up ------------------------------------------
echo "==> Starting server + worker"
docker compose up -d server worker

echo "==> Waiting for health"
sleep 10

# ---- Verify -----------------------------------------------------------
if [[ -x "${SCRIPT_DIR}/verify-oidc.sh" ]]; then
    echo "==> Running verify-oidc.sh"
    "${SCRIPT_DIR}/verify-oidc.sh" || {
        echo "WARN: verify-oidc.sh reported failures - inspect logs" >&2
    }
fi

echo "Restore complete."
