#!/usr/bin/env python3
"""Run Sort in a throwaway headless Firefox and check where every tab lands.

Builds a copy of Custom New Tab with harness.js added as a background script,
starts Firefox through `web-ext run` on a fresh profile whose proxy is a closed
local port, so nothing leaves the machine (the harness's web tabs are created
discarded and never load anyway), and checks the windows the harness reports
against the sort rules in readme.md.

    python3 tests/sort-tabs/run.py

FIREFOX names the Firefox binary (default: firefox on PATH), WEB_EXT the
web-ext command (default: npx --yes web-ext).
"""

import http.server
import json
import os
import shlex
import signal
import socket
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import package  # noqa: E402

GMAIL_0 = "https://mail.google.com/mail/u/0/#inbox"
GMAIL_1 = "https://mail.google.com/mail/u/1/#inbox"
CAL_DAY = "https://calendar.google.com/calendar/u/0/r/day"
CAL_WEEK = "https://calendar.google.com/calendar/u/0/r/week"
GITHUB = "https://github.com/example"
EXAMPLE = "https://example.com/a"
SEARCH = "https://www.google.com/search?q=test"
HN = "https://news.ycombinator.com/item?id=1"
DOC = "https://docs.google.com/document/d/doc1/edit"
SHEET = "https://docs.google.com/spreadsheets/d/sheet2/edit"
CHAT = "https://claude.ai/chat/abc"
PINNED_CHAT = "https://claude.ai/chat/def"
X_HOME = "https://x.com/home"
VIDEO = "https://www.youtube.com/watch?v=abc"
COMPOSE = "https://mail.google.com/mail/u/0/?view=cm&fs=1"


class ResultHandler(http.server.BaseHTTPRequestHandler):
    result = None
    received = threading.Event()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        ResultHandler.result = json.loads(self.rfile.read(length))
        self.send_response(204)
        self.end_headers()
        ResultHandler.received.set()

    def log_message(self, *args):
        pass


def closed_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def build_test_extension(dest: Path, result_port: int) -> None:
    package.stage_files(ROOT, dest)
    harness = (HERE / "harness.js").read_text().replace("__RESULT_PORT__", str(result_port))
    (dest / "harness.js").write_text(harness)
    manifest = json.loads((dest / "manifest.json").read_text())
    manifest["background"]["scripts"].append("harness.js")
    manifest["permissions"].append("http://127.0.0.1/*")
    (dest / "manifest.json").write_text(json.dumps(manifest, indent=2))


def isolation_prefs(dead_port: int) -> list[str]:
    prefs = {
        "network.proxy.type": 1,
        "network.proxy.http": "127.0.0.1",
        "network.proxy.http_port": dead_port,
        "network.proxy.ssl": "127.0.0.1",
        "network.proxy.ssl_port": dead_port,
        "network.proxy.share_proxy_settings": "true",
        "network.trr.mode": 5,
        "network.dns.disablePrefetch": "true",
        "network.prefetch-next": "false",
        "network.http.speculative-parallel-limit": 0,
        "network.captive-portal-service.enabled": "false",
        "network.connectivity-service.enabled": "false",
        "dom.push.enabled": "false",
        "browser.safebrowsing.malware.enabled": "false",
        "browser.safebrowsing.phishing.enabled": "false",
        "datareporting.policy.dataSubmissionEnabled": "false",
        "toolkit.telemetry.enabled": "false",
        "app.normandy.enabled": "false",
        "services.settings.server": f"http://127.0.0.1:{dead_port}/",
        # The event page must not be unloaded halfway through the harness.
        "extensions.background.idle.timeout": 600000,
    }
    return [f"--pref={name}={value}" for name, value in prefs.items()]


def run_firefox(log_path: Path) -> dict | None:
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), ResultHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    web_ext = shlex.split(os.environ.get("WEB_EXT", "npx --yes web-ext"))
    with tempfile.TemporaryDirectory(prefix="meh-tabs-sort-test-") as tmp:
        ext = Path(tmp) / "extension"
        build_test_extension(ext, server.server_address[1])
        cmd = [
            *web_ext, "run", "--source-dir", str(ext),
            "--firefox", os.environ.get("FIREFOX", "firefox"),
            "--no-reload", "--no-input", *isolation_prefs(closed_port()),
        ]
        env = {**os.environ, "MOZ_HEADLESS": "1", "NO_UPDATE_NOTIFIER": "1"}
        with log_path.open("w") as log:
            proc = subprocess.Popen(cmd, env=env, stdout=log, stderr=subprocess.STDOUT,
                                    start_new_session=True)
            try:
                ResultHandler.received.wait(timeout=180)
            finally:
                os.killpg(proc.pid, signal.SIGINT)
                try:
                    proc.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL)
                    proc.wait()
    server.shutdown()
    return ResultHandler.result


def layout(win: dict) -> list[tuple[str, bool]]:
    return [(t["url"], t["pinned"]) for t in win["tabs"]]


def window_holding(snapshot: list[dict], url: str) -> dict | None:
    return next((w for w in snapshot if any(t["url"] == url for t in w["tabs"])), None)


def all_tab_ids(snapshot: list[dict]) -> set[int]:
    return {t["id"] for w in snapshot for t in w["tabs"]}


class Checks:
    def __init__(self) -> None:
        self.failures: list[str] = []

    def expect(self, label: str, ok: bool, detail: object = "") -> None:
        print(f"{'PASS' if ok else 'FAIL'}  {label}")
        if not ok:
            if detail != "":
                print(f"      got: {detail}")
            self.failures.append(label)

    def soft(self, label: str, ok: bool, detail: object = "") -> None:
        print(f"{'PASS' if ok else 'NOTE'}  {label}" + ("" if ok else f"  (got {detail})"))

    def group_windows(self, when: str, snapshot: list[dict], ids: dict, new_tab: str,
                      main_tabs: list[tuple[str, bool]], ai: list[tuple[str, bool]]) -> None:
        main = next((w for w in snapshot if w["id"] == ids["winA"]), None)
        self.expect(f"{when}: Sort's window is still the main window", main is not None)
        if main is None:
            return
        self.expect(f"{when}: main window is pinned Gmail (account 0 first), pinned Calendar, "
                    "other pins, then sites, new tab pages last",
                    layout(main) == main_tabs, layout(main))
        docs = window_holding(snapshot, DOC)
        self.expect(f"{when}: Google Docs and Sheets share their own window",
                    docs is not None and docs is not main and layout(docs) == [(DOC, False), (SHEET, False)],
                    docs and layout(docs))
        chats = window_holding(snapshot, CHAT)
        self.expect(f"{when}: AI chats have their own window",
                    chats is not None and chats is not main and layout(chats) == ai,
                    chats and layout(chats))
        x = window_holding(snapshot, X_HOME)
        self.expect(f"{when}: X has its own window",
                    x is not None and x is not main and layout(x) == [(X_HOME, False)],
                    x and layout(x))
        popup = next((w for w in snapshot if w["id"] == ids["popup"]), None)
        self.expect(f"{when}: the Gmail compose popout is left alone",
                    popup is not None and popup["type"] == "popup" and layout(popup) == [(COMPOSE, False)],
                    popup and layout(popup))
        self.soft(f"{when}: main window has focus", main["focused"],
                  [(w["id"], w["focused"]) for w in snapshot])


def check(r: dict) -> int:
    c = Checks()
    if r.get("error"):
        print(f"FAIL  harness error: {r['error']}\n{r.get('stack', '')}")
        return 1
    for note in r["notes"]:
        print(f"NOTE  {note}")
    ids, new_tab = r["ids"], r["newTabUrl"]

    c.expect("A page opened like Ctrl+T reports this extension's new tab URL",
             r["idleTabUrl"] == new_tab, r["idleTabUrl"])
    c.expect("A fresh new tab page is idle; one with the stopwatch started is in use",
             not r["startInUseBefore"] and r["busyInUseBefore"])

    main_before_pages = [
        (GMAIL_0, True), (GMAIL_1, True), (CAL_DAY, True), (CAL_WEEK, True), (GITHUB, True),
        (EXAMPLE, False), (SEARCH, False), (HN, False),
    ]

    print("\n1. Sort Open Tabs, clicked on a new tab page")
    after = r["afterButton"]
    pending_made = ids["pendingTab"] is not None
    c.expect("Button reports the result", r["buttonText"].startswith("Sorted!"), r["buttonText"])
    closed_pages = 2 if pending_made else 1
    for part in ("1 dupes closed", f"{closed_pages} new tab pages closed", "1 AI chats", "1 X", "2 Docs"):
        c.expect(f"Button says '{part}'", part in r["buttonText"], r["buttonText"])
    c.group_windows("after the button", after, ids, new_tab,
                    main_before_pages + [(new_tab, False), (new_tab, False)], [(CHAT, False)])
    main = next((w for w in after if w["id"] == ids["winA"]), {"tabs": []})
    c.expect("The two new tab pages kept are the start page and the one in use",
             {t["id"] for t in main["tabs"][-2:]} == {ids["startTab"], ids["busyTab"]})
    gone = {ids["idleTab"], ids["duplicate"]} | ({ids["pendingTab"]} if pending_made else set())
    c.expect("Idle new tab pages (loaded and unloaded) and the duplicate are closed",
             not (gone & all_tab_ids(after)))
    c.expect("The page in use moved windows and its stopwatch kept running", r["busyInUseAfter"])
    c.expect("No other windows are left (5: main, Docs, AI, X, popup)", len(after) == 5,
             [layout(w) for w in after])

    print("\n2. Sort from the toolbar, Gmail active, with youtube.com as entertainment")
    after = r["afterToolbar"]
    resp = r["toolbarResponse"]
    want = {"success": True, "duplicatesClosed": 0, "newTabsClosed": 2, "entertainmentCount": 1,
            "aiChatCount": 2, "xCount": 1, "googleDocsCount": 2}
    c.expect("Toolbar sort reports the right counts",
             all(resp.get(k) == v for k, v in want.items()), resp)
    c.group_windows("after the toolbar", after, ids, new_tab,
                    main_before_pages + [(new_tab, False)],
                    [(PINNED_CHAT, True), (CHAT, False)])
    c.expect("The old start page and the new idle page are closed; the page in use stays",
             not ({ids["startTab"], ids["idleTab2"]} & all_tab_ids(after))
             and ids["busyTab"] in all_tab_ids(after))
    fun = window_holding(after, VIDEO)
    c.expect("Entertainment has its own window", fun is not None and layout(fun) == [(VIDEO, False)],
             fun and layout(fun))
    c.soft("Entertainment window is minimized", fun is not None and fun["state"] == "minimized",
           fun and fun["state"])
    main = next((w for w in after if w["id"] == ids["winA"]), {"tabs": []})
    active = [t["id"] for t in main["tabs"] if t["active"]]
    c.expect("Gmail, the active tab, stays active", active == [ids["gmailTab"]], active)
    c.expect("No other windows are left (6: main, Docs, AI, X, entertainment, popup)",
             len(after) == 6, [layout(w) for w in after])

    la = r["lastAccessed"]
    print("\nFirefox lastAccessed after Sort-style moves (for the tab-age marker question):")
    for name in ("unloaded", "loaded"):
        print(f"      {name} tab moved within its window: "
              f"{(la['sameWindow'][name] - la['before'][name]) / 1000:+.1f} s; "
              f"to another window: {(la['otherWindow'][name] - la['before'][name]) / 1000:+.1f} s")
    print(f"      tab that seeds a new window: "
          f"{(la['otherWindow']['seed'] - la['before']['seed']) / 1000:+.1f} s")

    print()
    if c.failures:
        print(f"{len(c.failures)} check(s) failed.")
        return 1
    print("All checks passed.")
    return 0


def main() -> int:
    log_path = Path(tempfile.gettempdir()) / "meh-tabs-sort-test-web-ext.log"
    result = run_firefox(log_path)
    if result is None:
        print(f"FAIL  no result from the harness within 180 s; web-ext log: {log_path}")
        print(log_path.read_text()[-4000:])
        return 1
    return check(result)


if __name__ == "__main__":
    sys.exit(main())
