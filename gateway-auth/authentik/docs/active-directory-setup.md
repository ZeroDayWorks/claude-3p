# Active Directory integration

Authentik consumes AD via its built-in **LDAP source** (`Directory -> Federation & Social login -> Create -> LDAP Source`).

## Non-negotiables

- **LDAPS only** (port 636). Plain LDAP is prohibited.
- **Do NOT disable LDAP signing** on the domain controllers. Keep signing
  and channel binding enforced. If the AD admins ask you to weaken signing,
  refuse - it is a known privilege-escalation surface.
- Bind account is a dedicated read-only service account, not a domain admin.
- The AD root CA (and any intermediate) must be present in Authentik's
  trust store. Drop the PEM(s) into `./certs/` and reference them from the
  LDAP source's `Server URI` configuration.

## Environment / source fields

| Field                     | Example value                                                     |
|---------------------------|-------------------------------------------------------------------|
| Name                      | `Corporate AD`                                                    |
| Slug                      | `ad`                                                              |
| Server URI                | `ldaps://dc01.corp.company.com:636 ldaps://dc02.corp.company.com:636` |
| Enable Start TLS          | off (LDAPS uses implicit TLS)                                     |
| Bind CN                   | `CN=svc-authentik,OU=Service Accounts,DC=corp,DC=company,DC=com`  |
| Bind password             | (set in the UI - stored encrypted with AUTHENTIK_SECRET_KEY)      |
| Base DN                   | `DC=corp,DC=company,DC=com`                                       |
| Additional User DN        | `OU=Users`                                                        |
| Additional Group DN       | `OU=Groups`                                                       |
| User object filter        | `(&(objectClass=user)(!(objectClass=computer)))`                  |
| Group object filter       | `(objectClass=group)`                                             |
| Group membership field    | `member`                                                          |
| Object uniqueness field   | `objectSid`                                                       |
| Sync users password       | on (Authentik proxies password checks - no shadow copy stored)    |

## Property mappings

Use the built-in mappings shipped with Authentik:

- `goauthentik.io/sources/ldap/default-name`
- `goauthentik.io/sources/ldap/default-mail`
- `goauthentik.io/sources/ldap/ms-samaccountname`
- `goauthentik.io/sources/ldap/ms-userprincipalname`
- `goauthentik.io/sources/ldap/ms-givenName`
- `goauthentik.io/sources/ldap/ms-sn`
- `goauthentik.io/sources/ldap/groupmembership`

If you need custom attributes (department, cost center, ...), add a source
property mapping under `Customization -> Property Mappings -> Create -> LDAP Source Property Mapping`.

## Gating Claude Desktop access on AD groups

Two common strategies:

1. **Group nesting**: create an AD group `AD_Claude_Users` and nest it into
   Authentik's `claude-users` group via a group membership mapping. Any AD
   member of `AD_Claude_Users` will automatically be a member of
   `claude-users` and satisfy the app's policy binding.
2. **Expression policy on the source**: bind a policy on the LDAP source that
   only permits users whose `memberOf` contains a specific AD group DN.

## Sync verification

- `Directory -> Federation & Social login -> LDAP Source -> Sync status`
  should show a recent successful run with non-zero users + groups.
- Test-authenticate a known AD user via the Authentik login page (do not
  test with the akadmin account).
- Confirm the user appears under `Directory -> Users` with the correct
  `path=/ldap-source/...` and their group memberships mirror AD.

## Troubleshooting LDAP signing errors

If sync fails with `strongerAuthRequired` or `LDAP_INSUFFICIENT_ACCESS_RIGHTS`,
the DC is enforcing signing/channel binding (as it should). Fix:

- Use LDAPS (636), not LDAP (389).
- Ensure the trust chain for the DC cert is in Authentik's trust store.
- Do not tick "Bind with LDAP+StartTLS instead of LDAPS" unless you also
  fix the trust chain and understand the tradeoffs.

Never work around signing enforcement by disabling it on the DC.
