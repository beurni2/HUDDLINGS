"""Decision E1 (docs/QUESTIONS.md): nothing from the master sheets reaches the app.

    python3 tools/qa/no_sheet_pixels.py <built .app, .xcarchive or any folder>...

The sheets are concept art: never shipped (CLAUDE.md, R8). A copy of a sheet
need not be byte-identical, re-encoded, cropped or compiled into an asset
catalogue, so the check is an allowlist. It fails when:
- a file in the build is byte-identical to a file under characters/reference/
  or characters/*/ref/, or a path in the build names one of those folders;
- inside an app bundle, an image is neither a file a character package lists,
  with the SHA-256 package.json gives it, nor an app icon Xcode wrote at the
  bundle's root (AppIcon*.png);
- an Assets.car holds an image rendition other than the app icon (read with
  `xcrun assetutil --info`, so on a Mac; elsewhere an Assets.car fails)."""
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IMAGES = {".png", ".jpg", ".jpeg", ".heic", ".heif", ".gif", ".webp", ".tif", ".tiff", ".bmp", ".pdf", ".svg", ".ktx", ".astc"}
APP_ICON = re.compile(r"^AppIcon.*\.png$")


def sheet_files(root=ROOT):
    files = [p for p in (root / "characters" / "reference").rglob("*") if p.is_file()]
    files += [p for p in (root / "characters").glob("*/ref/**/*") if p.is_file()]
    return files


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def asset_catalogue_names(car):
    """(name, type) of every rendition in a compiled asset catalogue, from Apple's assetutil."""
    if not shutil.which("xcrun"):
        raise RuntimeError("needs xcrun assetutil (a Mac) to read it")
    out = subprocess.run(["xcrun", "--sdk", "iphoneos", "assetutil", "--info", str(car)], capture_output=True, text=True, check=True).stdout
    return [(item.get("Name", ""), item.get("AssetType", "")) for item in json.loads(out) if "AssetType" in item]


def app_bundles(build):
    if build.suffix == ".app":
        return [build]
    return sorted(p for p in build.rglob("*.app") if p.is_dir())


def listed_files(app):
    """Every file the app's character packages list, by path inside the app, with its SHA-256."""
    listed = {}
    for manifest in app.glob("characters/*/package.json"):
        for name, sha in json.loads(manifest.read_text(encoding="utf-8"))["files"].items():
            listed[(manifest.parent / name).relative_to(app)] = sha
    return listed


def check_app(app, catalogue_names=asset_catalogue_names):
    problems = []
    listed = listed_files(app)
    for path in sorted(p for p in app.rglob("*") if p.is_file()):
        rel = path.relative_to(app)
        if path.suffix.lower() in IMAGES:
            if rel in listed:
                if digest(path) != listed[rel]:
                    problems.append(f"{app}/{rel}: an image that differs from the one its package lists")
            elif not (len(rel.parts) == 1 and APP_ICON.match(rel.name)):
                problems.append(f"{app}/{rel}: an image no character package lists and not the app icon")
        elif path.name == "Assets.car":
            try:
                names = catalogue_names(path)
            except (RuntimeError, OSError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
                problems.append(f"{app}/{rel}: could not be read ({error})")
                continue
            for name, kind in names:
                if kind != "Color" and not name.startswith("AppIcon"):
                    problems.append(f"{app}/{rel}: holds {kind or 'a rendition'} {name!r}, not the app icon")
    return problems


def check(builds, root=ROOT, catalogue_names=asset_catalogue_names):
    sheets = {digest(p): p for p in sheet_files(root) if p.name != "README.md"}
    problems = []
    for build in builds:
        build = Path(build)
        if not build.exists():
            problems.append(f"{build}: does not exist")
            continue
        for path in [build] if build.is_file() else build.rglob("*"):
            rel = path.relative_to(build) if path != build else Path(path.name)
            parts = [p.lower() for p in rel.parts]
            if "reference" in parts or "ref" in parts:
                problems.append(f"{build}/{rel}: a path named like the sheets' folders")
            if path.is_file() and (h := digest(path)) in sheets:
                problems.append(f"{build}/{rel}: is {sheets[h].relative_to(root)}")
        if build.is_dir():
            for app in app_bundles(build):
                problems += check_app(app, catalogue_names)
    return problems


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    problems = check(argv)
    for problem in problems:
        print(f"no sheet pixels: {problem}")
    if problems:
        return 1
    apps = sum(len(app_bundles(Path(b))) for b in argv if Path(b).is_dir())
    print(f"no sheet pixels: {len(sheet_files())} sheet files, none in {', '.join(argv)}; "
          f"every image in {apps} app bundle(s) is a listed package file or the app icon")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
