import json
import time

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey
from jwt.algorithms import RSAAlgorithm


def generate_rsa_keypair() -> RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def build_jwks(private_key: RSAPrivateKey, kid: str = "test-kid") -> dict:
    public_jwk = json.loads(RSAAlgorithm.to_jwk(private_key.public_key()))
    public_jwk["kid"] = kid
    public_jwk["use"] = "sig"
    public_jwk["alg"] = "RS256"
    return {"keys": [public_jwk]}


def make_token(private_key: RSAPrivateKey, kid: str = "test-kid", **claim_overrides) -> str:
    now = int(time.time())
    claims = {
        "iss": "https://auth.example.com/application/o/claude-desktop/",
        "aud": "ai-gateway",
        "sub": "user-123",
        "preferred_username": "alice",
        "groups": ["claude-users"],
        "iat": now,
        "exp": now + 900,
    }
    claims.update(claim_overrides)
    return jwt.encode(claims, private_key, algorithm="RS256", headers={"kid": kid})
