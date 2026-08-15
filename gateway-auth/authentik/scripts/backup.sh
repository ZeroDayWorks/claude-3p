#!/usr/bin/env bash
# Backup the Authentik stack:
#   - PostgreSQL dump (gzip)
#   - media/, custom-templates/, blueprints/ (tar.gz)
# Everything goes into a single timestamped tarball with a sha256 checksum.
# Retention: keep the most recent 14 backups.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' not found" >&2; exit 1; }; }
need docker
need gzip
need tar
need sha256sum

if [[ ! -f .env ]]; then echo "ERROR: .env not found" >&2; exit 1; fi
# shellcheck disable=SC1091
set -a; . ./.env; set +a

BACKUP_DIR="${ROOT_DIR}/backups"
mkdir -p "${BACKUP_DIR}"

STAMP="$(date -u +%Y%m%d-%H%M%SZ)"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

echo "==> Dumping PostgreSQL"
docker compose exec -T db pg_dump \
    -U "${PG_USER:-authentik}" \
    -d "${PG_DB:-authentik}" \
    --no-owner --clean --if-exists \
    | gzip -9 > "${WORK}/postgres-${STAMP}.sql.gz"

echo "==> Archiving media / custom-templates / blueprints"
tar -C "${ROOT_DIR}" -czf "${WORK}/files-${STAMP}.tar.gz" \
    media custom-templates blueprints 2>/dev/null || true

ARCHIVE="${BACKUP_DIR}/authentik-${STAMP}.tar.gz"
tar -C "${WORK}" -czf "${ARCHIVE}" \
    "postgres-${STAMP}.sql.gz" \
    "files-${STAMP}.tar.gz"

sha256sum "${ARCHIVE}" > "${ARCHIVE}.sha256"

echo "==> Wrote:"
echo "    ${ARCHIVE}"
echo "    ${ARCHIVE}.sha256"

# ---- Retention --------------------------------------------------------
echo "==> Pruning old backups (keep 14)"
mapfile -t OLD < <(ls -1t "${BACKUP_DIR}"/authentik-*.tar.gz 2>/dev/null | tail -n +15 || true)
for f in "${OLD[@]:-}"; do
    [[ -z "${f}" ]] && continue
    rm -f "${f}" "${f}.sha256"
    echo "    pruned $(basename "${f}")"
done

# ---- Encryption hint --------------------------------------------------
cat <<EOF

Backup complete.

To encrypt with GPG (recommended before offsite storage):

    gpg --output "${ARCHIVE}.gpg" \\
        --encrypt --recipient backups@company.com \\
        "${ARCHIVE}"
    shred -u "${ARCHIVE}"   # or: rm -P on macOS/BSD

Then verify integrity of the encrypted file:

    gpg --decrypt "${ARCHIVE}.gpg" | sha256sum
    cat "${ARCHIVE}.sha256"
EOF
