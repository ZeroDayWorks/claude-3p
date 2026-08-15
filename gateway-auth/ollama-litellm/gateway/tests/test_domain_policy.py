from app.domain_policy import domain_is_allowed, normalize_domain


def test_normalize_domain_lowercases_and_trims():
    assert normalize_domain(" Docs.GitHub.Com. ") == "docs.github.com"


def test_exact_domain_allowed():
    domain, allowed = domain_is_allowed("github.com", False, ["github.com"])

    assert domain == "github.com"
    assert allowed is True


def test_subdomain_allowed():
    domain, allowed = domain_is_allowed("docs.github.com", False, ["github.com"])

    assert domain == "docs.github.com"
    assert allowed is True


def test_evil_suffix_is_rejected():
    _, allowed = domain_is_allowed("evilgithub.com", False, ["github.com"])

    assert allowed is False


def test_url_with_scheme_is_rejected():
    assert normalize_domain("https://github.com") is None


def test_domain_with_port_is_rejected():
    assert normalize_domain("github.com:443") is None


def test_allow_all_domains_still_requires_valid_hostname():
    _, allowed = domain_is_allowed("https://github.com", True, [])

    assert allowed is False
