#!/usr/bin/env python3
"""Probe Gemini using the running backend's configuration without printing secrets.

Sends only a fixed test prompt (no account data), consumes a small API request,
and never changes containers, environment files, or application data.
"""
import argparse
import json
import re
import subprocess
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REASONS = {400: "request_rejected", 401: "authentication_failed", 403: "authentication_failed",
           404: "model_unavailable", 429: "rate_limited"}


def check(container, sudo_docker=False):
    command = (["sudo", "-n"] if sudo_docker else []) + ["docker", "inspect", container]
    result = subprocess.run(command, capture_output=True, text=True, timeout=15)
    if result.returncode:
        return {"working": False, "reason": "backend_inspection_failed"}
    rows = json.loads(result.stdout)
    values = dict(item.split("=", 1) for item in rows[0]["Config"]["Env"] if "=" in item)
    key = values.get("GEMINI_API_KEY", "").strip()
    model = values.get("GEMINI_MODEL", "").strip().removeprefix("models/") or "gemini-3.7-flash"
    if not key:
        return {"working": False, "configured": False, "reason": "not_configured"}
    if not re.fullmatch(r"gemini-[A-Za-z0-9.-]+", model):
        return {"working": False, "configured": True, "reason": "invalid_model"}
    config = {"maxOutputTokens": 2048}
    if model.startswith("gemini-3"):
        config["thinkingConfig"] = {"thinkingLevel": "low"}
    payload = {"contents": [{"role": "user", "parts": [{"text": "Reply with the single word OK."}]}], "generationConfig": config}
    request = Request("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
                      data=json.dumps(payload).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": key}, method="POST")
    summary = {"configured": True, "model": model}
    try:
        with urlopen(request, timeout=20) as response:
            body = json.loads(response.read((1 << 20) + 1))
        candidates = body.get("candidates") or []
        candidate = candidates[0] if candidates else {}
        text = "\n".join(p.get("text", "") for p in candidate.get("content", {}).get("parts", []) if not p.get("thought"))
        reason = candidate.get("finishReason", "")
        working = bool(text.strip()) and reason in ("", "STOP") and not body.get("promptFeedback", {}).get("blockReason")
        return dict(summary, working=working, reason="ok" if working else "incomplete_or_blocked_response")
    except HTTPError as error:
        return dict(summary, working=False, http_status=error.code, reason=REASONS.get(error.code, "provider_unavailable"))
    except (URLError, TimeoutError, OSError):
        return dict(summary, working=False, reason="network_or_timeout")
    except (ValueError, TypeError, AttributeError):
        return dict(summary, working=False, reason="invalid_response")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", default="stock-simulator-prod-backend-1")
    parser.add_argument("--sudo-docker", action="store_true")
    args = parser.parse_args()
    try:
        result = check(args.container, args.sudo_docker)
    except (OSError, ValueError, KeyError, TypeError, IndexError, subprocess.SubprocessError):
        result = {"working": False, "reason": "backend_inspection_failed"}
    print(json.dumps(result))
    return 0 if result["working"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
