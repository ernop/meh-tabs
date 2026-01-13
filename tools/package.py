import json
import zipfile
from pathlib import Path


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


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    manifest = load_manifest(root)
    version = manifest.get("version")
    if not version:
        raise RuntimeError("manifest.json missing 'version'")

    rel_files = [
        "manifest.json",
        "newtab.html",
        "newtab.js",
        "background.js",
        "todo.js",
        "styles.css",
        "bootstrap.min.css",
        "bootstrap.bundle.min.js",
        "Sortable.min.js",
        "links.json",
        "personal-config.json",
        "icons/icon-32.png",
        "icons/icon-48.png",
        "icons/icon-96.png",
        "icons/icon-128.png",
    ]

    dist_zip = root / "dist" / f"mynewtab-{version}.zip"
    upload_zip = root / "mynewtab-upload.zip"
    unsigned_xpi = root / "mynewtab.xpi"

    make_zip(root, dist_zip, rel_files)
    make_zip(root, upload_zip, rel_files)
    make_zip(root, unsigned_xpi, rel_files)

    print("Wrote:")
    print(f" - {dist_zip}")
    print(f" - {upload_zip}")
    print(f" - {unsigned_xpi}")


if __name__ == "__main__":
    main()

