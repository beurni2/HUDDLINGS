"""The character packages in a built app are the bytes the build made
(characters/format/README.md, Rendering): every file package.json lists is in
the app with the same SHA-256, so neither Xcode's PNG handling nor anything
else changed an atlas page on the way in.

    python3 tools/qa/package_in_app.py <built .app>
"""
import hashlib
import json
import sys
from pathlib import Path


def check(app):
    app = Path(app)
    packages = sorted((app / "characters").glob("*/package.json"))
    if not packages:
        return [f"{app}: no character package in the app"]
    problems = []
    for manifest in packages:
        folder = manifest.parent
        for name, expected in json.loads(manifest.read_text(encoding="utf-8"))["files"].items():
            path = folder / name
            if not path.is_file():
                problems.append(f"{folder.name}/{name}: missing from the app")
            elif hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                problems.append(f"{folder.name}/{name}: its bytes changed on the way into the app")
    return problems


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    found = check(sys.argv[1])
    for problem in found:
        print(f"package in app: {problem}")
    print("package in app: " + ("failed" if found else "every file matches package.json"))
    sys.exit(1 if found else 0)
