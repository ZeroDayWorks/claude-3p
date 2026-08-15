# Backup and restore

## What backups cover

`scripts/backup.sh` produces a single timestamped tarball containing:

- **PostgreSQL dump** (`pg_dump ... | gzip -9`) - includes all users,
  groups, providers, applications, policies, sources, sessions, event log
  history, and encrypted secrets. This is the primary source of truth.
- **`./media/`** - user-uploaded avatars and branding assets.
- **`./custom-templates/`** - custom email/UI templates.
- **`./blueprints/`** - blueprint YAML files. Redundant if you keep them in
  version control (you should), but included for completeness.

**Not** covered (out of scope for this backup):

- `.env` - it holds `AUTHENTIK_SECRET_KEY`. Back it up **separately** in a
  password manager or secrets vault. Without it the PG dump is useless
  because field-level secrets are encrypted with the key.
- TLS material under `./certs/` - live from your PKI/ACME, not from
  Authentik.
- Redis contents - session cache; ephemeral by design.

## File layout

```
backups/
├── authentik-20260722-031500Z.tar.gz
├── authentik-20260722-031500Z.tar.gz.sha256
├── authentik-20260721-031500Z.tar.gz
└── authentik-20260721-031500Z.tar.gz.sha256
```

Each archive contains:

```
postgres-<stamp>.sql.gz
files-<stamp>.tar.gz     # media/ custom-templates/ blueprints/
```

## Retention

`backup.sh` keeps the newest **14** archives and prunes older ones. Adjust
in the script if you have separate offsite retention.

## Encryption

Backups are unencrypted by default. For anything leaving the host:

```bash
gpg --output backups/authentik-20260722-031500Z.tar.gz.gpg \
    --encrypt --recipient backups@company.com \
    backups/authentik-20260722-031500Z.tar.gz
shred -u backups/authentik-20260722-031500Z.tar.gz
```

Verify integrity end-to-end:

```bash
gpg --decrypt authentik-20260722-031500Z.tar.gz.gpg | sha256sum
cat authentik-20260722-031500Z.tar.gz.sha256  # compare hashes
```

The GPG recipient key should be a *backup* key held offline, not an
individual's daily-driver key.

## Restore drill checklist

Do this at least once per quarter on a staging host.

- [ ] Stand up a fresh host with identical Docker/Compose versions.
- [ ] Copy `.env` from your secrets vault (same `AUTHENTIK_SECRET_KEY`).
- [ ] Copy `compose.yml`, `blueprints/`, `nginx/`, `scripts/` from Git.
- [ ] Copy the target backup archive + `.sha256` file next to it.
- [ ] Run `./scripts/restore.sh backups/authentik-<stamp>.tar.gz`.
- [ ] Confirm `make verify` passes.
- [ ] Sign in as a test user.
- [ ] Compare user + group + provider counts to prod.
- [ ] Document time-to-restore in your DR runbook.

## What the restore script does

1. Verifies the `.sha256` next to the archive (warns if absent).
2. Extracts to a temp directory.
3. Stops `server` + `worker` (no writes during restore).
4. Ensures `db` + `redis` are healthy.
5. `gunzip -c postgres-*.sql.gz | psql -v ON_ERROR_STOP=1` into the DB.
6. Restores `media/`, `custom-templates/`, `blueprints/` in place.
7. Starts `server` + `worker`.
8. Runs `verify-oidc.sh`.

## Recovery point / recovery time

- **RPO**: the last successful backup - typically 24h if you cron nightly.
- **RTO**: ~10 minutes for the automated steps once the archive and
  `.env` are on the target host. DNS TTL and certificate provisioning are
  usually the long pole.
