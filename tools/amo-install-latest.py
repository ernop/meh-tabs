"""Download the latest signed meh-tabs XPI from AMO and install it into the
default-release Firefox profile on Windows.

Windows counterpart of firefox-userchrome/install-meh-tabs-firefox.py, using
only the stdlib (no PyJWT/requests). Firefox picks up the replaced XPI on
its next restart.
"""
import base64
import hashlib
import hmac
import json
import shutil
import time
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CREDS = ROOT / "amo-credentials.local"
DIST = ROOT / "dist"
ADDON_SLUG = "afbf11016ec54c478061"
EXT_ID = "custom-new-tab@yourname.com"
PROFILES = Path.home() / "AppData/Roaming/Mozilla/Firefox/Profiles"


def b64url(data: bytes) -> bytes:
    return base64.urlsafe_b64encode(data).rstrip(b"=")


def make_jwt() -> str:
    creds = {}
    for line in CREDS.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            creds[k.strip()] = v.strip()
    now = int(time.time()) - 30
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = b64url(json.dumps({
        "iss": creds["AMO_JWT_ISSUER"],
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + 300,
    }).encode())
    signing_input = header + b"." + payload
    sig = b64url(hmac.new(creds["AMO_JWT_SECRET"].encode(), signing_input,
                          hashlib.sha256).digest())
    return (signing_input + b"." + sig).decode()


def api_get(url: str, to_file: Path | None = None):
    req = urllib.request.Request(url, headers={"Authorization": f"JWT {make_jwt()}"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        if to_file:
            to_file.write_bytes(resp.read())
            return None
        return json.load(resp)


def main() -> None:
    url = (f"https://addons.mozilla.org/api/v5/addons/addon/{ADDON_SLUG}/versions/"
           "?filter=all_with_unlisted")
    data = api_get(url)
    latest = None
    for v in data["results"]:
        f = v.get("file") or {}
        if f.get("status") == "public" and f.get("url"):
            latest = (v["version"], f["url"])
            break
    if not latest:
        raise SystemExit("No public signed XPI found on AMO")
    version, dl_url = latest
    print(f"Latest signed AMO version: {version}")

    DIST.mkdir(exist_ok=True)
    xpi = DIST / f"custom-new-tab-{version}.xpi"
    print(f"Downloading -> {xpi}")
    api_get(dl_url, to_file=xpi)
    print(f"Downloaded {xpi.stat().st_size / 1024:.1f} KiB")

    profile = next(PROFILES.glob("*.default-release"))
    target = profile / "extensions" / f"{EXT_ID}.xpi"
    print(f"Installing into profile: {target}")
    shutil.copy2(xpi, target)
    print("Done. Restart Firefox to load the update.")


if __name__ == "__main__":
    main()
