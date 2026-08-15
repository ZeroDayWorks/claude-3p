#!/usr/bin/env bash
# Sanity-check the OIDC discovery + JWKS for the Claude Desktop provider.
# Does NOT attempt password login. Does NOT hit any user-facing flow.
# Exit code is non-zero if any check fails.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

need() {
    command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' not found" >&2; exit 1; }
}
need curl
need jq

if [[ ! -f .env ]]; then
    echo "ERROR: .env not found" >&2
    exit 1
fi
# shellcheck disable=SC1091
set -a; . ./.env; set +a
: "${AUTH_DOMAIN:?AUTH_DOMAIN must be set in .env}"

DISCOVERY_URL="https://${AUTH_DOMAIN}/application/o/claude-desktop/.well-known/openid-configuration"

fails=0
pass() { printf '  [PASS] %s\n' "$1"; }
fail() { printf '  [FAIL] %s\n' "$1" >&2; fails=$((fails+1)); }

echo "Checking Authentik OIDC for claude-desktop at ${AUTH_DOMAIN}"

# ---- DNS ---------------------------------------------------------------
echo
echo "1. DNS resolution"
if getent hosts "${AUTH_DOMAIN}" >/dev/null 2>&1 \
   || host "${AUTH_DOMAIN}" >/dev/null 2>&1 \
   || nslookup "${AUTH_DOMAIN}" >/dev/null 2>&1; then
    pass "DNS resolves for ${AUTH_DOMAIN}"
else
    fail "DNS does not resolve for ${AUTH_DOMAIN}"
fi

# ---- TLS ---------------------------------------------------------------
echo
echo "2. HTTPS certificate"
if echo | openssl s_client -connect "${AUTH_DOMAIN}:443" -servername "${AUTH_DOMAIN}" \
       -verify_return_error </dev/null >/dev/null 2>&1; then
    pass "TLS handshake verified"
else
    fail "TLS handshake failed or cert not trusted"
fi

# ---- Discovery document -----------------------------------------------
echo
echo "3. OIDC discovery"
tmp="$(mktemp)"
http_code="$(curl -sS -o "${tmp}" -w '%{http_code}' "${DISCOVERY_URL}" || echo "000")"
if [[ "${http_code}" == "200" ]]; then
    pass "GET ${DISCOVERY_URL} -> 200"
else
    fail "GET ${DISCOVERY_URL} -> ${http_code}"
    rm -f "${tmp}"
    echo
    echo "Result: ${fails} failure(s)"
    exit 1
fi

if ! jq empty "${tmp}" 2>/dev/null; then
    fail "Discovery response is not valid JSON"
    rm -f "${tmp}"
    exit 1
fi

check_field() {
    local field="$1"
    local val
    val="$(jq -r --arg f "${field}" '.[$f] // empty' "${tmp}")"
    if [[ -n "${val}" ]]; then
        pass "${field} present"
    else
        fail "${field} missing"
    fi
}

check_field issuer
check_field authorization_endpoint
check_field token_endpoint
check_field jwks_uri

check_array_contains() {
    local field="$1" want="$2"
    if jq -e --arg f "${field}" --arg v "${want}" '.[$f] | index($v)' "${tmp}" >/dev/null; then
        pass "${field} contains '${want}'"
    else
        fail "${field} missing '${want}'"
    fi
}

check_array_contains response_types_supported     code
check_array_contains grant_types_supported        authorization_code
check_array_contains grant_types_supported        refresh_token
check_array_contains code_challenge_methods_supported S256
for s in openid profile email offline_access inference; do
    check_array_contains scopes_supported "${s}"
done

# ---- JWKS --------------------------------------------------------------
echo
echo "4. JWKS"
JWKS_URI="$(jq -r '.jwks_uri' "${tmp}")"
jwks_tmp="$(mktemp)"
if curl -fsS "${JWKS_URI}" -o "${jwks_tmp}"; then
    pass "GET ${JWKS_URI} -> 200"
else
    fail "GET ${JWKS_URI} failed"
fi

if jq -e '.keys | length > 0' "${jwks_tmp}" >/dev/null 2>&1; then
    pass "JWKS contains at least one key"
else
    fail "JWKS keys array empty or malformed"
fi

if jq -e '.keys[] | select(.kty)' "${jwks_tmp}" >/dev/null 2>&1; then
    pass "Every JWK has kty"
else
    fail "JWK missing kty"
fi

# Private material check - none of d, p, q, dp, dq, qi, k should appear.
if jq -e '.keys[] | select(has("d") or has("p") or has("q") or has("dp") or has("dq") or has("qi") or has("k"))' \
       "${jwks_tmp}" >/dev/null 2>&1; then
    fail "JWKS contains PRIVATE key material - do not proceed"
else
    pass "JWKS contains only public key material"
fi

rm -f "${tmp}" "${jwks_tmp}"

echo
if [[ ${fails} -eq 0 ]]; then
    echo "All OIDC checks passed."
    exit 0
fi
echo "${fails} check(s) failed."
exit 1
