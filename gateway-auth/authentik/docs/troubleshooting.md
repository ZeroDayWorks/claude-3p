# Troubleshooting

## Discovery returns 404

`GET https://auth.company.com/application/o/claude-desktop/.well-known/openid-configuration -> 404`

Causes:

- The `Claude Desktop` application does not exist. Check
  `docker compose logs worker | grep -i blueprint` for reconciliation
  errors.
- The application slug is not `claude-desktop`. The path segment MUST match
  the slug exactly. Fix in `blueprints/claude-desktop.yaml` under the
  application entry.
- The provider is not attached to the application. In the UI, open
  `Applications -> Applications -> Claude Desktop` and confirm Provider is
  set to `Claude Desktop OIDC`.

## `redirect_uri` mismatch

Error: `Redirect URI does not match any of the allowed URIs`.

- The blueprint uses a **regex** redirect URI:
  `^http://127\.0\.0\.1:[0-9]{1,5}/callback$`. Check that Claude Desktop is
  sending exactly `http://127.0.0.1:<port>/callback` - not `localhost`,
  not a trailing slash, not `:0`.
- If the client is using `localhost` instead of `127.0.0.1`, either add a
  second regex allowing `localhost` or fix the client. `127.0.0.1` is the
  RFC 8252 preferred form.

## PKCE failure (`invalid_grant` at token endpoint)

- The provider is a **public client** and PKCE S256 is **required**. The
  client must send `code_challenge` on `/authorize` and the matching
  `code_verifier` on `/token`.
- The token exchange must NOT include a `client_secret` - public clients
  have none. Sending one produces `invalid_client`.
- `code_challenge_method` must be `S256`. `plain` is rejected.

## Access token missing `aud`

- The client did not request the `inference` scope. Ensure Claude Desktop's
  scope list contains `inference`. `aud=ai-gateway` is emitted by the
  `inference` scope mapping - no other scope adds it.
- Consent was granted for a subset that excludes `inference`. Re-run the
  consent flow.
- The scope mapping was disabled or removed. Check
  `Customization -> Property Mappings -> Claude: inference` exists and is
  attached to the `Claude Desktop OIDC` provider.

## Policy denies the login ("You do not have access to this application")

- The user is not in `claude-users` or `claude-admins`. Add them via
  `Directory -> Users -> <user> -> Groups`.
- The user is in `claude-suspended` - deny wins. Remove them from that
  group.
- Group sync from AD/LDAP hasn't run. Trigger a sync from the source page
  and confirm the user's group memberships.

## WebSocket connection drops behind nginx

Symptom: outposts flap; UI event feed empties.

- Confirm the `/ws/` location block uses `proxy_http_version 1.1`,
  `Upgrade`/`Connection` headers, and a long `proxy_read_timeout` (3600s
  in this repo).
- Cloudflare / other proxies in front: enable WebSocket support and
  disable "Rocket loader" / any HTML rewriting on the `auth.` hostname.

## Blueprint appears to apply but nothing changes

- `docker compose logs worker | grep -i blueprint` will show file
  parsing/apply errors. Fix the reported line.
- `!Find` references cannot resolve - the target object (flow, cert) may
  not exist yet. Wait 30s for Authentik's built-in blueprints to finish,
  then restart the worker.
- The `identifiers:` block matches an existing object but with unexpected
  fields. Delete the stale object in the UI or align the identifiers.

## TLS handshake fails in `verify-oidc.sh`

- The cert is self-signed / from an internal CA the tool doesn't trust.
  Import the root into the OS trust store on the host running the script,
  or use `curl --cacert` and modify the script for your environment.
- The cert doesn't include intermediates (only the leaf). Rebuild
  `fullchain.pem` = leaf + intermediates and reload nginx.

## Initial-setup URL 404s

Use the exact URL with the trailing slash:

```
https://auth.company.com/if/flow/initial-setup/
```

Without the slash you'll get a 404 because Django resolves `if/flow/...`
strictly.

## `AUTHENTIK_SECRET_KEY` mismatch after restore

If you restore a PG dump into a stack whose `AUTHENTIK_SECRET_KEY` differs
from the one that produced the dump, provider client secrets, source
secrets, and any encrypted attribute will fail to decrypt. Symptom: OIDC
flows return 500 or providers appear "broken" in the UI. Fix: restore the
original key from your secrets vault.
