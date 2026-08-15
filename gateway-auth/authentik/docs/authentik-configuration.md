# Authentik configuration

Everything that must exist in Authentik is declared in
[`blueprints/claude-desktop.yaml`](../blueprints/claude-desktop.yaml). The
blueprint is idempotent - the worker reconciles it on start and every time
the file changes.

## What the blueprint creates

### Groups (`authentik_core.group`)

| Name              | Purpose                                          |
|-------------------|--------------------------------------------------|
| `claude-users`    | Allow list. Standard members.                    |
| `claude-admins`   | Allow list. Elevated `roles` claim.              |
| `claude-suspended`| Deny list. Overrides `claude-users` membership.  |

### Scope mappings (`authentik_providers_oauth2.scopemapping`)

| Scope       | Claims added                                                        |
|-------------|---------------------------------------------------------------------|
| `openid`    | `sub`                                                               |
| `profile`   | `preferred_username`, `name`                                        |
| `email`     | `email`, `email_verified`                                           |
| `inference` | `groups` (list), `roles` (list), `aud: "ai-gateway"`                |

The `inference` mapping expression:

```python
return {
    "groups": [group.name for group in request.user.ak_groups.all()],
    "roles": [group.name for group in request.user.ak_groups.all()],
    "aud": "ai-gateway",
}
```

`offline_access` is a standard OIDC scope and is provided by Authentik out of
the box (it does not need a mapping); requesting it causes a refresh token
to be issued.

### Provider (`authentik_providers_oauth2.oauth2provider`)

| Field                         | Value                                                          |
|-------------------------------|----------------------------------------------------------------|
| Name                          | `Claude Desktop OIDC`                                          |
| Client type                   | Public (no secret)                                             |
| Client ID                     | `claude-desktop`                                               |
| Redirect URIs                 | regex `^http://127\.0\.0\.1:[0-9]{1,5}/callback$`              |
| Grant types                   | authorization_code + refresh_token (PKCE S256 required)        |
| Access token validity         | 15 minutes                                                     |
| Refresh token validity        | 8 hours                                                        |
| Include claims in id_token    | true                                                           |
| Signing key                   | default self-signed cert (rotate in production, see below)     |
| Authorization flow            | `default-provider-authorization-explicit-consent`              |
| Invalidation flow             | `default-provider-invalidation-flow`                           |
| Property mappings             | openid, profile, email, inference                              |

### Application (`authentik_core.application`)

- Slug: `claude-desktop` (drives the discovery URL:
  `/application/o/claude-desktop/.well-known/openid-configuration`).
- Group: `Company AI` (display grouping in the user portal).
- Policy engine mode: `all` (all bindings must pass).

### Policy + binding

An expression policy `policy-claude-desktop-access` is bound to the
application. It denies members of `claude-suspended` and permits members
of `claude-users` or `claude-admins`.

## What to verify in the UI

1. **Applications -> Applications**: `Claude Desktop` appears.
2. **Applications -> Providers**: `Claude Desktop OIDC` shows Client ID
   `claude-desktop`, Public client, PKCE required.
3. **Customization -> Property Mappings**: four `OIDC:` and `Claude:` scope
   mappings are present.
4. **Directory -> Groups**: `claude-users`, `claude-admins`,
   `claude-suspended` exist.
5. **Applications -> Applications -> Claude Desktop -> Policy / Group / User bindings**:
   the expression policy binding is enabled at order 0.
6. Hit `https://<AUTH_DOMAIN>/application/o/claude-desktop/.well-known/openid-configuration`
   from a browser and confirm the JSON.

## Changing flows or branding

- **Flows**: The blueprint references flows by slug via `!Find`. To use a
  custom authorization flow (e.g. one that adds MFA), change the
  `authorization_flow` value in the `context:` block of the blueprint and
  re-apply (`make apply-blueprint`).
- **Branding**: Under `System -> Brands`, edit the default brand to set logo,
  favicon, and custom CSS. Templates live in `./custom-templates/` (mounted
  at `/templates`) and can be referenced from the brand.
- **Signing key rotation**: Create a new certificate under
  `System -> Certificates`, then change `signing_key_name` in the blueprint
  `context:` and re-apply. Existing sessions continue to validate against
  the old key until they expire.
