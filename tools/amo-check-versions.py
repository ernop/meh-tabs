"""List AMO versions (incl. unlisted) for the custom-new-tab add-on.

Uses AMO JWT credentials from amo-credentials.local. Read-only.
"""
import base64
import hashlib
import hmac
import json
import time
import urllib.request
from pathlib import Path

ADDON = "custom-new-tab@yourname.com"
CREDS = Path(__file__).resolve().parent.parent / "amo-credentials.local"


def b64url(data: bytes) -> bytes:
    return base64.urlsafe_b64encode(data).rstrip(b"=")


def make_jwt(issuer: str, secret: str) -> str:
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    # Back-date iat: AMO rejects tokens whose iat is even slightly in the
    # future relative to its own clock.
    now = int(time.time()) - 30
    payload = b64url(json.dumps({
        "iss": issuer,
        "jti": str(now) + "-check",
        "iat": now,
        "exp": now + 300,
    }).encode())
    signing_input = header + b"." + payload
    sig = b64url(hmac.new(secret.encode(), signing_input, hashlib.sha256).digest())
    return (signing_input + b"." + sig).decode()


def main() -> None:
    creds = {}
    for line in CREDS.read_text().splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            creds[k.strip()] = v.strip()
    token = make_jwt(creds["AMO_JWT_ISSUER"], creds["AMO_JWT_SECRET"])

    url = (f"https://addons.mozilla.org/api/v5/addons/addon/{ADDON}/versions/"
           "?filter=all_with_unlisted")
    req = urllib.request.Request(url, headers={"Authorization": f"JWT {token}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode(errors='replace')[:500]}")
        raise SystemExit(1)

    for v in data.get("results", []):
        f = v.get("file") or {}
        print(f"version={v.get('version')} channel={v.get('channel')} "
              f"status={f.get('status')} url={f.get('url')}")


if __name__ == "__main__":
    main()
