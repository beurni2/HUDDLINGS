"""Decision E1 (docs/QUESTIONS.md): nothing from the master sheets reaches the app.

    python3 tools/qa/no_sheet_pixels.py <built .app or any folder>...

Fails when a file in the build is byte-identical to a file under
characters/reference/ or characters/*/ref/, or when a path in the build names
one of those folders. The sheets are concept art: never shipped (CLAUDE.md,
R8)."""
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def sheet_files(root=ROOT):
    files = [p for p in (root / "characters" / "reference").rglob("*") if p.is_file()]
    files += [p for p in (root / "characters").glob("*/ref/**/*") if p.is_file()]
    return files


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check(builds, root=ROOT):
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
    print(f"no sheet pixels: {len(sheet_files())} sheet files, none in {', '.join(argv)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
