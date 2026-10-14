"""The copy lint: rule R7 and the copy rules of spec section 20.

It reads every user-visible string in the repository (the copy catalogue,
Xcode string catalogues and .strings files, InfoPlist.strings included) and
fails when one breaks a rule:

- a banned word or phrase (R7), as a whole word, ignoring case;
- an exclamation mark, anywhere;
- in a notification: hungry, peckish, energy, feed or treat (sections 16, 20),
  or a placeholder other than a first name or a Huddling name;
- the literal word Mochi outside the feature names (section 20, Names);
- a placeholder that section 20 does not define;
- a placeholder in InfoPlist copy, where no companion name is known;
- a friend's name on the Lock Screen (section 6, Widgets).

User-written text never passes through it: it only reads copy files.

    python3 tools/copylint/copylint.py [paths...]

With no paths it scans the whole repository. It exits 1 when anything fails.
"""

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Rule R7, word for word.
BANNED = [
    "miss", "missed", "lonely", "forgot", "forgotten", "dying", "dead", "die",
    "sad", "starving", "starve", "hurry", "last chance", "streak", "waiting for you",
]

# Other forms of the same words. R7 says "whole words", which would let
# "misses", "died" or "hurrying" through; this list refuses them too, as the
# safest default until the founder decides (docs/QUESTIONS.md, the copy lint).
BANNED_FORMS = [
    "misses", "missing", "lonelier", "loneliest", "loneliness",
    "forget", "forgets", "forgetting", "died", "dies", "sadder", "saddest",
    "sadly", "sadness", "starved", "starves", "hurries", "hurried", "hurrying",
    "streaks", "last chances",
]

# Section 16: notification templates also refuse these, with their forms.
NOTIFICATION_BANNED = ["hungry", "peckish", "energy", "feed", "treat"]
NOTIFICATION_BANNED_FORMS = [
    "hungrier", "hungriest", "feeds", "fed", "feeding", "treats", "treated", "treating",
]

EXCLAMATIONS = "!¡！‼⁉❗❕"

# Section 20, Names: the literal word Mochi only in the feature names.
FEATURE_NAMES = ["Film with Mochi", "Mochi Post", "Mochi Treats", "Mochi Cam"]

# Section 20, Placeholders.
PLACEHOLDERS = {
    "mochi", "visitor", "sender", "name", "names", "species", "scene",
    "Food", "aFood", "aRealFood", "keepsake", "time", "m", "ss", "safetyEmail",
}
# Section 16: notifications carry only first names and Huddling names.
NOTIFICATION_PLACEHOLDERS = {"mochi", "visitor", "sender", "name", "names"}
# Section 6: Lock Screen widgets never show a friend's name.
PERSON_PLACEHOLDERS = {"sender", "name", "names"}

SKIP_DIRS = {".git", "node_modules", ".build", "DerivedData", "Pods", "archive"}


def _words_pattern(words):
    parts = [r"\s+".join(re.escape(w) for w in phrase.split()) for phrase in words]
    return re.compile(r"(?<![A-Za-z0-9])(?:" + "|".join(parts) + r")(?![A-Za-z0-9])", re.IGNORECASE)


BANNED_RE = _words_pattern(BANNED)
BANNED_FORMS_RE = _words_pattern(BANNED_FORMS)
NOTIFICATION_RE = _words_pattern(NOTIFICATION_BANNED + NOTIFICATION_BANNED_FORMS)
PLACEHOLDER_RE = re.compile(r"\{([^{}]*)\}")
MOCHI_RE = re.compile(r"(?<![A-Za-z0-9])mochi(?![A-Za-z0-9])", re.IGNORECASE)
FEATURE_RE = re.compile("|".join(re.escape(f) for f in FEATURE_NAMES))


@dataclass
class Entry:
    path: str
    key: str
    text: str
    surfaces: tuple


@dataclass
class Problem:
    entry: Entry
    rule: str
    message: str

    def __str__(self):
        path = Path(self.entry.path)
        if path.is_absolute() and path.is_relative_to(ROOT):
            path = path.relative_to(ROOT)
        return f"{path}: {self.entry.key}: {self.rule}: {self.message}  [{self.entry.text!r}]"


def lint_text(text, surfaces=("app",)):
    """Return (rule, message) pairs for one string shown on the given surfaces."""
    problems = []
    placeholders = PLACEHOLDER_RE.findall(text)
    bare = PLACEHOLDER_RE.sub(" ", text)

    for m in BANNED_RE.finditer(bare):
        problems.append(("R7", f"banned word {m.group(0)!r}"))
    for m in BANNED_FORMS_RE.finditer(bare):
        problems.append(("R7 (other form)", f"a form of a banned word: {m.group(0)!r}"))
    for ch in EXCLAMATIONS:
        if ch in text:
            problems.append(("R7", f"exclamation mark {ch!r}"))
            break

    if "notification" in surfaces:
        for m in NOTIFICATION_RE.finditer(bare):
            problems.append(("notification", f"{m.group(0)!r} is not allowed in a notification"))
        for p in placeholders:
            if p in PLACEHOLDERS and p not in NOTIFICATION_PLACEHOLDERS:
                problems.append(("notification", f"{{{p}}} is not a name; notifications carry only names"))

    for m in MOCHI_RE.finditer(FEATURE_RE.sub(" ", bare)):
        problems.append(("names", f"{m.group(0)!r} outside a feature name; write {{mochi}}"))

    for p in placeholders:
        if p not in PLACEHOLDERS:
            problems.append(("placeholder", f"unknown placeholder {{{p}}}"))
    if "infoplist" in surfaces and placeholders:
        problems.append(("infoplist", "no companion name is known here; say 'your Huddling'"))
    if "lockscreen" in surfaces:
        for p in placeholders:
            if p in PERSON_PLACEHOLDERS:
                problems.append(("lockscreen", f"{{{p}}}: the Lock Screen never shows a friend's name"))
    return problems


def _surfaces_from_name(path, key):
    surfaces = ["app"]
    name = Path(path).name
    if name.startswith("InfoPlist."):
        surfaces = ["infoplist"]
    if key.startswith("push.") or "Notification" in str(path):
        surfaces.append("notification")
    if key.endswith("Lock"):
        surfaces.append("lockscreen")
    return tuple(surfaces)


def load_catalogue(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return [Entry(str(path), key, item["text"], tuple(item.get("surfaces", ["app"])))
            for key, item in data["strings"].items()]


def _xcstrings_values(node):
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "stringUnit" and isinstance(v, dict) and "value" in v:
                yield v["value"]
            else:
                yield from _xcstrings_values(v)
    elif isinstance(node, list):
        for v in node:
            yield from _xcstrings_values(v)


def load_xcstrings(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    entries = []
    for key, item in data.get("strings", {}).items():
        surfaces = _surfaces_from_name(path, key)
        if item.get("shouldTranslate") is False:
            continue
        values = list(_xcstrings_values(item.get("localizations", {})))
        # With no localization yet, the key is the English text.
        for value in values or [key]:
            entries.append(Entry(str(path), key, value, surfaces))
    return entries


STRINGS_LINE = re.compile(r'"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;')
STRINGS_ESCAPE = re.compile(r'\\(U[0-9A-Fa-f]{4}|u[0-9A-Fa-f]{4}|.)')
SIMPLE_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", '"': '"', "\\": "\\", "'": "'"}


def _unescape(value):
    def repl(m):
        code = m.group(1)
        if len(code) == 5:
            return chr(int(code[1:], 16))
        return SIMPLE_ESCAPES.get(code, code)
    return STRINGS_ESCAPE.sub(repl, value)


def _read_strings_file(path):
    raw = Path(path).read_bytes()
    for encoding in ("utf-8-sig", "utf-16"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError(f"{path}: not UTF-8 or UTF-16")


def load_strings(path):
    text = _read_strings_file(path)
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    entries = []
    for key, value in STRINGS_LINE.findall(text):
        key = _unescape(key)
        entries.append(Entry(str(path), key, _unescape(value), _surfaces_from_name(path, key)))
    return entries


def discover(root):
    found = []
    for path in sorted(Path(root).rglob("*")):
        if any(part in SKIP_DIRS for part in path.parts) or not path.is_file():
            continue
        rel = path.relative_to(root)
        if rel.parts[0] == "copy" and path.suffix == ".json":
            found.append(path)
        elif path.suffix in (".xcstrings", ".strings"):
            found.append(path)
    return found


def load(path):
    path = Path(path)
    if path.suffix == ".json":
        return load_catalogue(path)
    if path.suffix == ".xcstrings":
        return load_xcstrings(path)
    if path.suffix == ".strings":
        return load_strings(path)
    raise ValueError(f"{path}: not a copy file")


def lint_paths(paths):
    problems = []
    count = 0
    for path in paths:
        for entry in load(path):
            count += 1
            for rule, message in lint_text(entry.text, entry.surfaces):
                problems.append(Problem(entry, rule, message))
    return count, problems


def main(argv):
    paths = [Path(p) for p in argv] or discover(ROOT)
    count, problems = lint_paths(paths)
    for problem in problems:
        print(problem)
    if problems:
        print(f"copy lint: {len(problems)} problem(s) in {count} strings")
        return 1
    print(f"copy lint: {count} strings in {len(paths)} file(s), all clean")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
