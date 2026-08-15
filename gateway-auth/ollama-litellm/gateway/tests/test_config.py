import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings


def test_oidc_disabled_by_default_does_not_require_issuer():
    settings = Settings(litellm_master_key="sk-test")

    assert settings.oidc_enabled is False


def test_oidc_enabled_requires_issuer_and_jwks_url():
    with pytest.raises(ValidationError):
        Settings(litellm_master_key="sk-test", oidc_enabled=True)


def test_oidc_enabled_with_issuer_and_jwks_url_is_valid():
    settings = Settings(
        litellm_master_key="sk-test",
        oidc_enabled=True,
        oidc_issuer="https://auth.example.com/application/o/claude-desktop/",
        oidc_jwks_url="http://authentik-server:9000/application/o/claude-desktop/jwks/",
    )

    assert settings.oidc_enabled is True
    assert settings.oidc_issuer == "https://auth.example.com/application/o/claude-desktop/"


def test_oidc_allowed_group_list_parses_csv_and_trims_whitespace():
    settings = Settings(litellm_master_key="sk-test", oidc_allowed_groups="claude-users, claude-admins ,")

    assert settings.oidc_allowed_group_list == ["claude-users", "claude-admins"]


def test_oidc_denied_group_list_parses_csv():
    settings = Settings(litellm_master_key="sk-test", oidc_denied_groups="claude-suspended")

    assert settings.oidc_denied_group_list == ["claude-suspended"]


def test_oidc_defaults_match_documented_groups():
    settings = Settings(litellm_master_key="sk-test")

    assert settings.oidc_allowed_group_list == ["claude-users", "claude-admins"]
    assert settings.oidc_denied_group_list == ["claude-suspended"]
    assert settings.oidc_audience == "ai-gateway"
