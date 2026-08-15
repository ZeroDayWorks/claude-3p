from functools import lru_cache
from typing import Annotated
from urllib.parse import urlparse

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    litellm_base_url: str = "http://litellm:4000"
    litellm_master_key: str = Field(default="", min_length=1)
    allow_all_domains: bool = True
    allowed_domains: str = ""
    max_request_body_mb: Annotated[int, Field(gt=0)] = 100
    connect_timeout_seconds: Annotated[float, Field(gt=0)] = 15
    request_timeout_seconds: Annotated[float, Field(gt=0)] = 600
    stream_read_timeout_seconds: Annotated[float, Field(gt=0)] = 600
    log_level: str = "INFO"
    litellm_config_path: str = "/app/config.yaml"
    oidc_enabled: bool = False
    oidc_issuer: str = ""
    oidc_jwks_url: str = ""
    oidc_audience: str = "ai-gateway"
    oidc_allowed_groups: str = "claude-users,claude-admins"
    oidc_denied_groups: str = "claude-suspended"
    oidc_jwks_cache_ttl_seconds: Annotated[int, Field(gt=0)] = 3600
    litellm_admin_username: str = "admin"
    litellm_admin_password: str = Field(default="", description="Password for LiteLLM Admin UI (falls back to master key in compose)")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("litellm_base_url")
    @classmethod
    def validate_litellm_base_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("LITELLM_BASE_URL must be an absolute HTTP(S) URL")
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("LITELLM_BASE_URL must not include credentials, query, or fragment")
        return value.rstrip("/")

    @model_validator(mode="after")
    def validate_oidc_requires_issuer_and_jwks(self) -> "Settings":
        if self.oidc_enabled and (not self.oidc_issuer or not self.oidc_jwks_url):
            raise ValueError("OIDC_ISSUER and OIDC_JWKS_URL must be set when OIDC_ENABLED=true")
        return self

    @property
    def allowed_domain_list(self) -> list[str]:
        return [item.strip().lower().rstrip(".") for item in self.allowed_domains.split(",") if item.strip()]

    @property
    def oidc_allowed_group_list(self) -> list[str]:
        return [item.strip() for item in self.oidc_allowed_groups.split(",") if item.strip()]

    @property
    def oidc_denied_group_list(self) -> list[str]:
        return [item.strip() for item in self.oidc_denied_groups.split(",") if item.strip()]

    @property
    def max_request_body_bytes(self) -> int:
        return self.max_request_body_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
