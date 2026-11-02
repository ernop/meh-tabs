import argparse
import json
import shutil
import subprocess
import zipfile
from pathlib import Path

# Since v1.0.22 config is served by Caddy (home.localhost), so no
# links.json / personal-config.json is bundled. personal-config.json holds
# private URLs and must never go into an AMO upload.
PACKAGE_FILES = [
    "manifest.json",
    "newtab.html",
    "newtab.js",
    "background.js",
    "todo.js",
    "styles.css",
    "bootstrap.min.css",
    "bootstrap.bundle.min.js",
    "Sortable.min.js",
    "icons/icon-32.png",
    "icons/icon-48.png",
    "icons/icon-96.png",
    "icons/icon-128.png",
]


def load_manifest(root: Path) -> dict:
    return json.loads((root / "manifest.json").read_text(encoding="utf-8"))


def make_zip(root: Path, output_path: Path, rel_files: list[str]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()

    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for rel in rel_files:
            src = root / rel
            if not src.exists():
                raise FileNotFoundError(f"Missing required file: {rel}")
            z.write(src, arcname=rel.replace("\\", "/"))


def stage_files(root: Path, dest: Path) -> None:
    """Copy exactly the packaged files into dest, e.g. for `web-ext sign`."""
    for rel in PACKAGE_FILES:
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / rel, target)


def prune_old_builds(root: Path, dist: Path, version: str) -> None:
    """Leave only this version's builds in dist/: git rebuilds older ones.

    An older archive holding a file git does not track (v1.0.17 bundled a
    personal config) is not rebuildable, so it is kept and reported.
    """
    tracked = set(
        subprocess.run(
            ["git", "ls-files"], cwd=root, capture_output=True, text=True, check=True
        ).stdout.splitlines()
    )
    for path in sorted(dist.glob("*")):
        if path.suffix not in (".zip", ".xpi") or path.stem.endswith(f"-{version}"):
            continue
        with zipfile.ZipFile(path) as z:
            untracked = [
                name
                for name in z.namelist()
                if not name.endswith("/")
                and not name.startswith("META-INF/")
                and name not in tracked
            ]
        if untracked:
            print(f" - kept {path.name}: holds files git does not track: {', '.join(untracked)}")
            continue
        path.unlink()
        print(f" - deleted old build {path.name}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Package Custom New Tab.")
    parser.add_argument(
        "--stage", type=Path, metavar="DIR",
        help="only copy the packaged files into DIR (for web-ext sign)",
    )
    parser.add_argument(
        "--prune", action="store_true",
        help="only delete older versions' builds from dist/",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    if args.stage:
        stage_files(root, args.stage)
        print(f"Staged {len(PACKAGE_FILES)} files in {args.stage}")
        return

    manifest = load_manifest(root)
    version = manifest.get("version")
    if not version:
        raise RuntimeError("manifest.json missing 'version'")

    dist = root / "dist"
    if args.prune:
        prune_old_builds(root, dist, version)
        return

    dist_zip = dist / f"custom-new-tab-{version}.zip"
    upload_zip = root / "custom-new-tab-upload.zip"
    unsigned_xpi = root / "custom-new-tab.xpi"

    make_zip(root, dist_zip, PACKAGE_FILES)
    make_zip(root, upload_zip, PACKAGE_FILES)
    make_zip(root, unsigned_xpi, PACKAGE_FILES)

    print("Wrote:")
    print(f" - {dist_zip}")
    print(f" - {upload_zip}")
    print(f" - {unsigned_xpi}")
    prune_old_builds(root, dist, version)


if __name__ == "__main__":
    main()
