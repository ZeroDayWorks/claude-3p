import re

HOSTNAME_PATTERN = re.compile(r"^[a-z0-9.-]+$")


def normalize_domain(raw_domain: str | None) -> str | None:
    if raw_domain is None:
        return None

    domain = raw_domain.strip().lower().rstrip(".")
    if not domain:
        return None
    if "://" in domain:
        return None
    if any(char in domain for char in "/\\?#@[]"):
        return None
    if ":" in domain:
        return None
    if len(domain) > 253:
        return None
    if not HOSTNAME_PATTERN.fullmatch(domain):
        return None

    labels = domain.split(".")
    for label in labels:
        if not label or len(label) > 63:
            return None
        if label.startswith("-") or label.endswith("-"):
            return None
    return domain


def domain_is_allowed(raw_domain: str | None, allow_all: bool, allowed_domains: list[str]) -> tuple[str, bool]:
    normalized = normalize_domain(raw_domain)
    response_domain = raw_domain.strip().lower().rstrip(".") if raw_domain else ""
    if normalized is None:
        return response_domain, False
    if allow_all:
        return normalized, True

    normalized_allowed_domains = [domain for domain in (normalize_domain(item) for item in allowed_domains) if domain]
    allowed = any(
        normalized == allowed_domain or normalized.endswith("." + allowed_domain)
        for allowed_domain in normalized_allowed_domains
    )
    return normalized, allowed
