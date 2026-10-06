#!/usr/bin/env python3
"""Exercise the real production gateway on a disposable Docker host (CI).

Uses localhost HTTPS with Caddy's local CA, local test PostgreSQL, no broker,
no workers and no orders. Requires free ports 80/443. Cleans its own project.
"""

import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import socket
import ssl
import struct
import subprocess
import tempfile
import time
from urllib.error import HTTPError
from urllib.request import build_opener, HTTPSHandler, HTTPRedirectHandler, Request

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://frontend.smoke.test"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def websocket(context, origin, expected=101):
    sock = context.wrap_socket(socket.create_connection(("127.0.0.1", 443), timeout=5), server_hostname="localhost")
    stream = sock.makefile("rb")
    key = base64.b64encode(os.urandom(16)).decode()
    request = (f"GET /ws/market HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\n"
               f"Connection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: {key}\r\n"
               f"Origin: {origin}\r\n\r\n")
    sock.sendall(request.encode())
    status = int(stream.readline().split()[1])
    headers = {}
    while True:
        line = stream.readline()
        if line == b"\r\n":
            break
        check(bool(line), "EOF during WebSocket handshake")
        name, value = line.decode().split(":", 1)
        headers[name.lower()] = value.strip()
    check(status == expected, f"WebSocket status {status}, expected {expected}")
    if status != 101:
        stream.close()
        sock.close()
        return
    accept = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
    check(headers.get("sec-websocket-accept") == accept, "Invalid WebSocket upgrade challenge")

    def send(payload, opcode=1):
        mask = os.urandom(4)
        check(len(payload) < 126, "Smoke client sends only small frames")
        masked = bytes(value ^ mask[index % 4] for index, value in enumerate(payload))
        sock.sendall(bytes([0x80 | opcode, 0x80 | len(payload)]) + mask + masked)

    try:
        send(b'{"action":"ping"}')
        for _ in range(5):
            frame = stream.read(2)
            check(len(frame) == 2, "WebSocket closed before pong")
            opcode, length = frame[0] & 15, frame[1] & 127
            if length == 126:
                length = struct.unpack("!H", stream.read(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", stream.read(8))[0]
            payload = stream.read(length)
            if opcode == 9:
                send(payload, 10)
            elif opcode == 1 and json.loads(payload).get("type") == "pong":
                return
        raise RuntimeError("No application pong through WSS")
    finally:
        stream.close()
        sock.close()


def main():
    with tempfile.TemporaryDirectory(prefix="gateway-smoke-") as temp:
        env_file = Path(temp) / ".env"
        env_file.write_text("\n".join([
            "API_DOMAIN=localhost", "ACME_EMAIL=ci@example.com",
            f"CORS_ALLOWED_ORIGINS={ORIGIN}", "CADDY_INTERNAL_IP=172.30.251.2",
            "GATEWAY_SUBNET=172.30.251.0/29", "GATEWAY_DYNAMIC_RANGE=172.30.251.4/30",
            "MARKET_FEED_MODE=live",
            "DATABASE_URL=postgres://smoke:smoke@postgres:5432/smoke?sslmode=disable",
            f"JWT_SECRET={secrets.token_hex(32)}", "AUTH_RATE_LIMIT_MAX_REQUESTS=3",
            "RATE_LIMIT_WINDOW=10m", "ALLOW_SEEDED_QUOTES=false", "SIMULATION_MODE=false",
            "ALLOW_SEEDED_EXECUTABLE_QUOTES=false", "",
        ]))
        env_file.chmod(0o600)
        env = {**os.environ, "PRODUCTION_ENV_FILE": str(env_file)}
        command = ["docker", "compose", "--project-name", "gateway-smoke-" + secrets.token_hex(4),
                   "--project-directory", str(ROOT), "--env-file", str(env_file),
                   "-f", str(ROOT / "docker-compose.prod.yml"),
                   "-f", str(ROOT / "deploy/oracle/docker-compose.smoke.yml")]

        def compose(*args, capture=False, required=True):
            return subprocess.run(command + list(args), env=env, cwd=ROOT, check=required,
                                  capture_output=capture, text=True)

        try:
            config = json.loads(compose("--profile", "with-frontend", "config", "--format", "json", capture=True).stdout)
            for service in ("backend", "redis", "market-worker", "news-worker", "postgres"):
                check(not config["services"][service].get("ports"), f"{service} publishes a private port")
            check(all(port.get("host_ip") == "127.0.0.1" for port in config["services"]["frontend"]["ports"]),
                  "Optional frontend must bind only to loopback")
            check(config["services"]["backend"]["environment"]["TRUSTED_PROXIES"] == "172.30.251.2",
                  "Go must trust the configured Caddy address")
            compose("run", "--rm", "--no-deps", "caddy", "caddy", "validate", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile")
            compose("up", "-d", "--build", "--wait", "--wait-timeout", "180", "backend", "caddy")

            pem = compose("exec", "-T", "caddy", "cat", "/data/caddy/pki/authorities/local/root.crt", capture=True).stdout
            context = ssl.create_default_context(cadata=pem)
            opener = build_opener(HTTPSHandler(context=context), NoRedirect())

            def request(path, headers=None, body=None, http=False):
                req = Request(("http" if http else "https") + "://localhost" + path, data=body, headers=headers or {})
                try:
                    response = opener.open(req, timeout=10)
                except HTTPError as error:
                    response = error
                with response:
                    return response.status, response.headers, response.read()

            deadline = time.monotonic() + 30
            while True:
                try:
                    status, headers, body = request("/health")
                    if status == 200:
                        break
                except (OSError, TimeoutError):
                    pass
                check(time.monotonic() < deadline, "Gateway HTTPS did not become healthy")
                time.sleep(1)
            check(json.loads(body).get("success") is True, "Health response did not come from Go")
            check(headers.get("Cache-Control") == "no-store", "Health response is cacheable")
            status, headers, _ = request("/health", http=True)
            check(status in (301, 308) and headers.get("Location") == "https://localhost/health", "HTTP did not redirect to HTTPS")
            status, headers, body = request("/ready")
            check(status == 503 and json.loads(body).get("ready") is False, "Missing LIVE worker must remain not ready")
            check(headers.get("Cache-Control") == "no-store", "Readiness response is cacheable")
            status, _, body = request("/openapi.yaml")
            check(status == 200 and b"openapi:" in body, "OpenAPI alias routing failed")
            status, headers, _ = request("/api/v1/health", {"Origin": ORIGIN})
            check(status == 200 and headers.get("Access-Control-Allow-Origin") == ORIGIN, "Allowed frontend CORS failed")
            status, _, _ = request("/api/v1/health", {"Origin": "https://attacker.test"})
            check(status == 403, "Unauthorized frontend origin was accepted")
            websocket(context, ORIGIN)
            websocket(context, ORIGIN)  # A fresh connection must upgrade again.
            websocket(context, "https://attacker.test", expected=403)

            login = json.dumps({"email": "nobody@smoke.test", "password": "ValidPassword123!"}).encode()
            for index in range(4):
                status, _, _ = request("/api/v1/auth/login", {
                    "Origin": ORIGIN, "Content-Type": "application/json",
                    "X-Forwarded-For": f"203.0.113.{index + 1}", "X-Real-IP": f"203.0.113.{index + 10}",
                }, login)
                check(status == 429 if index == 3 else status in (400, 401), "Changing forged headers bypassed rate limiting")
            keys = compose("exec", "-T", "redis", "redis-cli", "--scan", "--pattern", "rate_limit:auth:ip:*", capture=True).stdout.splitlines()
            check(len(keys) == 1, f"Expected one real-client bucket, found {len(keys)}")
            check(not keys[0].endswith(":172.30.251.2") and "203.0.113." not in keys[0], "Go used the gateway or forged IP as client identity")
            for service in ("backend", "redis", "postgres"):
                container = compose("ps", "-q", service, capture=True).stdout.strip()
                ports = subprocess.run(["docker", "inspect", "--format", "{{json .HostConfig.PortBindings}}", container],
                                       check=True, capture_output=True, text=True).stdout
                check(not json.loads(ports), f"{service} has published host ports")
            print("PASS: real HTTPS/WSS, reconnect, CORS, private ports, header spoofing and fail-closed readiness")
        except Exception:
            compose("logs", "--tail", "80", "backend", "caddy", required=False)
            raise
        finally:
            compose("down", "--volumes", "--remove-orphans", required=False)


if __name__ == "__main__":
    main()
