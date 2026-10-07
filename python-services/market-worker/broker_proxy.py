"""Explicit broker egress checks. Never log proxy passwords or broker tokens."""
import base64
import os
import socket
import ssl
from urllib.parse import unquote, urlsplit


def configured_proxy():
    raw = os.getenv("HTTPS_PROXY") or os.getenv("HTTP_PROXY") or os.getenv("ALL_PROXY")
    if not raw:
        return None
    parsed = urlsplit(raw)
    if parsed.scheme not in ("http", "socks4", "socks5", "socks5h") or not parsed.hostname:
        raise ValueError("broker proxy must use a supported http/socks URL")
    return parsed


def check_proxy(target, timeout=5):
    """Check CONNECT and verified origin TLS, rather than merely an open port."""
    proxy = configured_proxy()
    if proxy is None:
        return
    if proxy.scheme.startswith("socks"):
        import socks
        sock = socks.socksocket()
        sock.set_proxy(socks.SOCKS4 if proxy.scheme == "socks4" else socks.SOCKS5,
                       proxy.hostname, proxy.port or 1080, rdns=True,
                       username=unquote(proxy.username or "") or None,
                       password=unquote(proxy.password or "") or None)
        sock.settimeout(timeout)
        try:
            sock.connect((target, 443))
        except Exception:
            sock.close()
            raise
    else:
        sock = socket.create_connection((proxy.hostname, proxy.port or 80), timeout=timeout)
        try:
            auth = ""
            if proxy.username:
                value = base64.b64encode(f"{unquote(proxy.username)}:{unquote(proxy.password or '')}".encode()).decode()
                auth = f"Proxy-Authorization: Basic {value}\r\n"
            sock.sendall(f"CONNECT {target}:443 HTTP/1.1\r\nHost: {target}:443\r\n{auth}\r\n".encode())
            response = b""
            while b"\r\n\r\n" not in response and len(response) < 8192:
                chunk = sock.recv(1)
                if not chunk:
                    break
                response += chunk
            line = response.split(b"\r\n", 1)[0].split()
            if len(line) < 2 or line[1] != b"200":
                raise ConnectionError("broker proxy CONNECT failed")
        except Exception:
            sock.close()
            raise
    with sock:
        with ssl.create_default_context().wrap_socket(sock, server_hostname=target):
            pass


if __name__ == "__main__":
    check_proxy(os.getenv("BROKER_PROXY_CHECK_HOST", "smartapisocket.angelone.in"))
