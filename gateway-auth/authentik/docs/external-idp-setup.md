# External IdP integration

Authentik can federate to Entra ID (Azure AD), Google Workspace, Okta, or
any generic OIDC/SAML provider. Users sign in at *their* IdP, get redirected
back to Authentik, and Authentik brokers the login to Claude Desktop.

After adding a source, you must also **expose it on the identification stage**
so a login button appears - see the "Show the source on the login page"
section at the bottom of this file.

## Microsoft Entra ID (Azure AD)

**Entra side:**
1. Entra admin center -> App registrations -> New registration.
2. Redirect URI (Web): `https://auth.company.com/source/oauth/callback/entra/`
3. Certificates & secrets -> New client secret. Save the value.
4. Token configuration -> add optional claim `email` (ID + Access).
5. API permissions -> Microsoft Graph -> `openid`, `profile`, `email`,
   `User.Read`. Grant admin consent.

**Authentik side:** `Directory -> Federation & Social login -> Create -> Azure AD OAuth Source`
- Name: `Entra ID`, Slug: `entra`
- Client ID / Secret: from Entra registration
- Consumer key / secret: same as Client ID / Secret
- Scopes: `openid profile email`
- User matching mode: `Link with identical email`

## Google Workspace

**Google side:** Cloud Console -> APIs & Services -> Credentials ->
OAuth 2.0 Client ID (Web application).
- Authorized redirect URI: `https://auth.company.com/source/oauth/callback/google/`
- OAuth consent screen: internal (Workspace-only)

**Authentik side:** `Create -> Google OAuth Source`
- Slug: `google`
- Client ID / Secret from Google
- Scopes: `openid profile email`

## Okta (as OIDC)

**Okta side:** Admin -> Applications -> Create App Integration ->
OIDC / Web application.
- Sign-in redirect URI: `https://auth.company.com/source/oauth/callback/okta/`
- Grant type: Authorization Code
- Assign the app to the users/groups you want federated

**Authentik side:** `Create -> OpenID Connect OAuth Source` (generic)
- Slug: `okta`
- Authorization URL: `https://<tenant>.okta.com/oauth2/v1/authorize`
- Token URL: `https://<tenant>.okta.com/oauth2/v1/token`
- User info URL: `https://<tenant>.okta.com/oauth2/v1/userinfo`
- OIDC JWKS URL: `https://<tenant>.okta.com/oauth2/v1/keys`
- Scopes: `openid profile email`

## Generic OIDC (any provider)

Use `OpenID Connect OAuth Source`. You need four URLs from the provider's
discovery document (`.well-known/openid-configuration`):

- `authorization_endpoint`
- `token_endpoint`
- `userinfo_endpoint`
- `jwks_uri`

Plus the client ID/secret they gave you and the redirect
`https://auth.company.com/source/oauth/callback/<slug>/`.

## Show the source on the login page

By default, a newly created source will NOT appear as a button on the login
page. You must add it to the identification stage:

1. `Flows and Stages -> Stages` -> find `default-authentication-identification`
   (or your custom identification stage).
2. Edit -> `Sources` -> add every source you want visible (Entra, Google,
   Okta, ...) to the **Selected sources** list.
3. Save. The login page will now show branded buttons for each selected
   source.

## Attribute-driven group membership

To auto-place federated users into `claude-users` (so they satisfy the
Claude Desktop policy binding), either:

- **Enrollment flow group action**: use the source's enrollment flow to run
  a `user_write` stage that assigns the user to `claude-users`, OR
- **Expression policy** on the source: on successful auth, add the user to
  the group if a claim matches (e.g. `groups` contains `AI-Users` from
  Entra).

Do not blanket-add every federated user to `claude-users` unless that
matches your access model.
