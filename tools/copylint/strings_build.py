"""The app's strings, both ways round (spec section 20; PLAN, phase 1).

    python3 tools/copylint/strings_build.py catalogue <out.xcstrings>
        Writes the app's string catalogue from copy/catalogue.json: every string
        whose surfaces include the app, keyed by its catalogue key. It is
        generated, never written by hand.

    python3 tools/copylint/strings_build.py check <exported .xliff or .xcloc>
        Checks what `xcodebuild -exportLocalizations` extracted from the Swift
        build: every string passes the copy lint, and every string in the app's
        own tables is a catalogue key, so a string written in code that the
        catalogue lacks fails the build. Info.plist strings are linted as
        Info.plist copy.
"""

import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import copylint  # noqa: E402

XLIFF = "{urn:oasis:names:tc:xliff:document:1.2}"


def app_strings(catalogue):
    strings = json.loads(Path(catalogue).read_text(encoding="utf-8"))["strings"]
    return {key: item["text"] for key, item in strings.items() if "app" in item.get("surfaces", [])}


def make_catalogue(out, catalogue=copylint.ROOT / "copy" / "catalogue.json"):
    strings = {
        key: {"extractionState": "manual", "localizations": {"en": {"stringUnit": {"state": "translated", "value": text}}}}
        for key, text in sorted(app_strings(catalogue).items())
    }
    document = {"sourceLanguage": "en", "strings": strings, "version": "1.0"}
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return len(strings)


def _xliff_files(path):
    path = Path(path)
    return sorted(path.rglob("*.xliff")) if path.is_dir() else [path]


def check_extracted(path, catalogue=copylint.ROOT / "copy" / "catalogue.json"):
    """Problems as readable lines; an empty list means the build's strings are sound."""
    keys = set(json.loads(Path(catalogue).read_text(encoding="utf-8"))["strings"])
    problems = []
    files = _xliff_files(path)
    if not files:
        return [f"{path}: no .xliff file to check"]
    for xliff in files:
        root = ET.parse(xliff).getroot()
        for file in root.iter(f"{XLIFF}file"):
            original = file.get("original", "")
            infoplist = original.endswith("InfoPlist.xcstrings") or original.endswith("InfoPlist.strings")
            surfaces = ("app", "infoplist") if infoplist else ("app",)
            for unit in file.iter(f"{XLIFF}trans-unit"):
                key = unit.get("id", "")
                source = unit.find(f"{XLIFF}source")
                text = source.text if source is not None and source.text else ""
                for rule, message in copylint.lint_text(text, surfaces):
                    problems.append(f"{original}: {key}: {rule}: {message}  [{text!r}]")
                if not infoplist and key not in keys:
                    problems.append(f"{original}: {key!r} is not in copy/catalogue.json; app copy comes only from the catalogue")
    return problems


def main(argv):
    if len(argv) == 2 and argv[0] == "catalogue":
        count = make_catalogue(argv[1])
        print(f"strings: wrote {count} app strings to {argv[1]}")
        return 0
    if len(argv) == 2 and argv[0] == "check":
        problems = check_extracted(argv[1])
        for problem in problems:
            print(problem)
        if problems:
            print(f"strings: {len(problems)} problem(s) in what the build extracted")
            return 1
        print("strings: every extracted string is catalogue copy and clean")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
