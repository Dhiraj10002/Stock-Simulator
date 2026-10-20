"""Resolve the public health-check host from the Caddy API_DOMAIN setting."""
import re


def primary_api_hostname(value):
    """Validate every comma-separated DNS name; preserve caller's Caddy config."""
    if not isinstance(value, str) or any(char in value for char in "\r\n"):
        raise ValueError("API_DOMAIN must contain comma-separated DNS hostnames")
    domains = [item.strip() for item in value.split(",")]
    label = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?")
    for domain in domains:
        if (not domain or len(domain) > 253 or "." not in domain
                or not all(label.fullmatch(part) for part in domain.split("."))):
            raise ValueError("API_DOMAIN must contain DNS hostnames without schemes, ports or paths")
        if domain.lower() == "example.com" or domain.lower().endswith(".example.com"):
            raise ValueError("Replace the API_DOMAIN placeholder with your own DNS hostname")
    return domains[0]
