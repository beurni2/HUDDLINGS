"""The copy lint: rule R7 and the copy rules of spec section 20.

It reads every user-visible string in the repository and fails when one
breaks a rule:

- a banned word or phrase (R7), as a whole word, ignoring case;
- an exclamation mark, in any form;
- in a notification: hungry, peckish, energy, feed or treat (sections 16, 20),
  or a placeholder other than a first name or a Huddling name;
- the literal word Mochi outside the feature names (section 20, Names);
- a placeholder section 20 does not define, or a printf specifier (%@, %d):
  copy uses {placeholders} only;
- a placeholder in InfoPlist copy, where no companion name is known;
- a friend's name on the Lock Screen (section 6, Widgets).

Text is normalised first (NFKC, invisible characters removed), so a soft
hyphen or a full-width letter cannot hide a word.

Where copy lives: `copy/catalogue.json` is the single source of every
user-visible string. The app's string catalogues, the notification templates
and the web page's copy are generated from it as each is built, and the lint
also reads what an iOS build could carry: *.xcstrings, *.strings,
*.stringsdict, Info.plist files and the Info.plist properties in XcodeGen's
project.yml. User-written text never passes through it. The default name
Mochi is configuration, not copy.

    python3 tools/copylint/copylint.py [paths...]

With no paths it scans the repository it lives in. It exits 1 when anything
fails or a copy file cannot be read.
"""

import json
import plistlib
import re
import sys
import unicodedata
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
# safest reading of R7 (docs/QUESTIONS.md, E11).
BANNED_FORMS = [
    "misses", "missing", "lonelier", "loneliest", "loneliness",
    "forget", "forgets", "forgetting", "died", "dies", "sadder", "saddest",
    "sadly", "sadness", "starved", "starves", "hurries", "hurried", "hurrying",
    "streaks", "last chances",
]

# Section 16: notification templates also refuse these, with their forms.
NOTIFICATION_BANNED = ["hungry", "peckish", "energy", "feed", "treat"]
NOTIFICATION_BANNED_FORMS = [
    "hungrier", "hungriest", "hunger", "peckishness", "energetic",
    "feeds", "fed", "feeding", "treats", "treated", "treating",
]

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

SKIP_DIRS = {".git", "node_modules", ".build", "DerivedData", "Pods"}
INFOPLIST_KEY = re.compile(r"^NS\w+UsageDescription$|^CFBundle(Display)?Name$")
PROJECT_YML_KEY = re.compile(
    r"""^(\s*)(["']?)((?:INFOPLIST_KEY_)?(?:NS\w+UsageDescription|CFBundleDisplayName|CFBundleName))\2\s*:\s*(.*)$""")
PROJECT_YML_FLOW = re.compile(r"\{[^}]*(?:UsageDescription|CFBundleDisplayName|CFBundleName)")

# Unicode's default-ignorable code points: invisible, so they must not hide a word.
IGNORABLE = [(0x00AD, 0x00AD), (0x034F, 0x034F), (0x061C, 0x061C), (0x115F, 0x1160), (0x17B4, 0x17B5),
             (0x180B, 0x180F), (0x200B, 0x200F), (0x202A, 0x202E), (0x2060, 0x206F), (0x3164, 0x3164),
             (0xFE00, 0xFE0F), (0xFEFF, 0xFEFF), (0xFFA0, 0xFFA0), (0xFFF0, 0xFFF8), (0x1BCA0, 0x1BCA3),
             (0x1D173, 0x1D17A), (0xE0000, 0xE0FFF)]


def _words_pattern(words):
    sep = r"[\s\-‐‑]+"
    parts = [sep.join(re.escape(w) for w in phrase.split()) for phrase in words]
    return re.compile(r"(?<![A-Za-z0-9])(?:" + "|".join(parts) + r")(?![A-Za-z0-9])", re.IGNORECASE)


BANNED_RE = _words_pattern(BANNED)
BANNED_FORMS_RE = _words_pattern(BANNED_FORMS)
NOTIFICATION_RE = _words_pattern(NOTIFICATION_BANNED + NOTIFICATION_BANNED_FORMS)
PLACEHOLDER_RE = re.compile(r"\{([^{}]*)\}")
PRINTF_RE = re.compile(r"%#@\w+@|%(?:\d+\$)?[#0\-+']*\d*(?:\.\d+)?(?:hh|h|ll|l|q|L|z|j|t)?[@dDiuUxXoOfFeEgGaAcCsSp]")
MOCHI_RE = re.compile(r"(?<![A-Za-z0-9])mochi", re.IGNORECASE)
FEATURE_RE = re.compile("(?:" + "|".join(re.escape(f) for f in FEATURE_NAMES) + r")(?![A-Za-z0-9])")


def _invisible(ch):
    code = ord(ch)
    return unicodedata.category(ch) == "Cf" or any(low <= code <= high for low, high in IGNORABLE)


def normalise(text):
    """NFKC, with invisible characters (soft hyphens, zero-width spaces, variation selectors) removed."""
    text = "".join(c for c in text if not _invisible(c))
    text = unicodedata.normalize("NFKC", text)
    return "".join(c for c in text if not _invisible(c))


def _is_exclamation(ch):
    name = unicodedata.name(ch, "")
    return ch in "!¡" or "EXCLAMATION" in name or "INTERROBANG" in name


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
        return f"{_display(self.entry.path)}: {self.entry.key}: {self.rule}: {self.message}  [{self.entry.text!r}]"


def _display(path):
    path = Path(path)
    if path.is_absolute() and path.is_relative_to(ROOT):
        return str(path.relative_to(ROOT))
    return str(path)


def lint_text(text, surfaces=("app",)):
    """Return (rule, message) pairs for one string shown on the given surfaces."""
    problems = []
    text = normalise(text)
    placeholders = PLACEHOLDER_RE.findall(text)
    bare = PLACEHOLDER_RE.sub(" ", text)

    for m in BANNED_RE.finditer(bare):
        problems.append(("R7", f"banned word {m.group(0)!r}"))
    for m in BANNED_FORMS_RE.finditer(bare):
        problems.append(("R7 (other form)", f"a form of a banned word: {m.group(0)!r}"))
    marks = [ch for ch in text if _is_exclamation(ch)]
    if marks:
        problems.append(("R7", f"exclamation mark {marks[0]!r}"))

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
    if "{" in bare or "}" in bare:
        problems.append(("placeholder", "a brace without its pair"))
    for m in PRINTF_RE.finditer(bare):
        problems.append(("placeholder", f"printf specifier {m.group(0)!r}; copy uses {{placeholders}}"))
    if "infoplist" in surfaces and placeholders:
        problems.append(("infoplist", "no companion name is known here; say 'your Huddling'"))
    if "lockscreen" in surfaces:
        for p in placeholders:
            if p in PERSON_PLACEHOLDERS:
                problems.append(("lockscreen", f"{{{p}}}: the Lock Screen never shows a friend's name"))
    return problems


def _relative_parts(path):
    path = Path(path).resolve()
    if path.is_relative_to(ROOT):
        return path.relative_to(ROOT).parts
    return path.parts[-3:]


def _surfaces_from_name(path, key):
    surfaces = ["app"]
    if Path(path).name.startswith("InfoPlist.") or Path(path).name.endswith("Info.plist"):
        surfaces = ["infoplist"]
    if key.startswith("push.") or any("Notification" in part for part in _relative_parts(path)[:-1]):
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
        # "Don't translate" strings are still shown, so they are linted too.
        values = list(_xcstrings_values(item.get("localizations", {})))
        # With no localization yet, the key is the English text.
        for value in values or [key]:
            entries.append(Entry(str(path), key, value, surfaces))
    return entries


def _decode_text_file(path):
    raw = Path(path).read_bytes()
    for bom, encoding in ((b"\xef\xbb\xbf", "utf-8-sig"), (b"\xff\xfe", "utf-16"), (b"\xfe\xff", "utf-16")):
        if raw.startswith(bom):
            return raw.decode(encoding)
    if b"\x00" in raw:
        # UTF-16 without a byte-order mark: ASCII leaves its zero byte on the odd side in little-endian.
        odd_zeros = raw[1::2].count(0)
        even_zeros = raw[0::2].count(0)
        return raw.decode("utf-16-le" if odd_zeros >= even_zeros else "utf-16-be")
    return raw.decode("utf-8")


STRINGS_TOKEN = re.compile(r'''
    (?P<ws>\s+)
  | (?P<block>/\*.*?\*/)
  | (?P<line>//[^\n]*)
  | "(?P<quoted>(?:[^"\\]|\\.)*)"
  | (?P<bare>[A-Za-z0-9_.$:/\-]+)
  | (?P<punct>[=;])
''', re.S | re.X)
STRINGS_ESCAPE = re.compile(r'\\(U[0-9A-Fa-f]{4}|u[0-9A-Fa-f]{4}|.)', re.S)
SIMPLE_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", '"': '"', "\\": "\\", "'": "'"}


def _unescape(value):
    def repl(m):
        code = m.group(1)
        if len(code) == 5:
            return chr(int(code[1:], 16))
        return SIMPLE_ESCAPES.get(code, code)
    return STRINGS_ESCAPE.sub(repl, value)


def _strings_tokens(text, path):
    pos = 0
    while pos < len(text):
        m = STRINGS_TOKEN.match(text, pos)
        if not m:
            raise ValueError(f"{path}: cannot read the .strings file at character {pos}: {text[pos:pos + 30]!r}")
        pos = m.end()
        if m.group("quoted") is not None:
            yield ("str", _unescape(m.group("quoted")))
        elif m.group("bare") is not None:
            yield ("str", m.group("bare"))
        elif m.group("punct") is not None:
            yield (m.group("punct"), None)


def load_strings(path):
    """Old-style .strings: `key = value;`, quoted or bare, and the `"key";` shorthand. Anything else is an error."""
    tokens = list(_strings_tokens(_decode_text_file(path), path))
    entries = []
    i = 0
    while i < len(tokens):
        kind, key = tokens[i]
        if kind != "str":
            raise ValueError(f"{path}: expected a key, found {kind!r}")
        if i + 1 < len(tokens) and tokens[i + 1][0] == ";":
            value, i = key, i + 2
        elif i + 3 < len(tokens) and tokens[i + 1][0] == "=" and tokens[i + 2][0] == "str" and tokens[i + 3][0] == ";":
            value, i = tokens[i + 2][1], i + 4
        else:
            raise ValueError(f"{path}: malformed entry for key {key!r}")
        entries.append(Entry(str(path), key, value, _surfaces_from_name(path, key)))
    return entries


def _plist_leaves(node, key=""):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from _plist_leaves(v, k)
    elif isinstance(node, list):
        for v in node:
            yield from _plist_leaves(v, key)
    elif isinstance(node, str):
        yield key, node


def load_stringsdict(path):
    data = plistlib.loads(Path(path).read_bytes())
    entries = []
    for top_key, item in data.items():
        for key, value in _plist_leaves(item, top_key):
            if key in ("NSStringFormatSpecTypeKey", "NSStringFormatValueTypeKey"):
                continue  # format metadata, not copy
            entries.append(Entry(str(path), top_key, value, _surfaces_from_name(path, top_key)))
    return entries


def load_info_plist(path):
    data = plistlib.loads(Path(path).read_bytes())
    return [Entry(str(path), key, value, ("infoplist",))
            for key, value in _plist_leaves(data) if INFOPLIST_KEY.match(key)]


def _yml_scalar(value, where):
    if value.startswith('"'):
        m = re.match(r'"((?:[^"\\]|\\.)*)"\s*(#.*)?$', value)
        if not m:
            raise ValueError(f"{where}: cannot read the quoted value")
        return _unescape(m.group(1))
    if value.startswith("'"):
        m = re.match(r"'((?:[^']|'')*)'\s*(#.*)?$", value)
        if not m:
            raise ValueError(f"{where}: cannot read the quoted value")
        return m.group(1).replace("''", "'")
    return re.split(r"\s+#", value, maxsplit=1)[0].strip()


def load_project_yml(path):
    """The Info.plist copy in XcodeGen's project.yml. Anything this cannot read for sure is an error:
    write such copy on one line, or keep it in InfoPlist.xcstrings."""
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    entries = []
    for i, line in enumerate(lines):
        where = f"{path}:{i + 1}"
        if PROJECT_YML_FLOW.search(line):
            raise ValueError(f"{where}: Info.plist copy in a flow map; write one key per line")
        m = PROJECT_YML_KEY.match(line)
        if not m:
            continue
        indent, key, value = len(m.group(1)), m.group(3), m.group(4).strip()
        if not value or value[0] in "|>":
            raise ValueError(f"{where}: {key} spans several lines; write it on one line")
        for following in lines[i + 1:]:
            if not following.strip() or following.lstrip().startswith("#"):
                continue
            if len(following) - len(following.lstrip()) > indent:
                raise ValueError(f"{where}: {key} continues on the next line; write it on one line")
            break
        value = _yml_scalar(value, where)
        if value.startswith("$("):
            continue  # a build setting reference, resolved from a string catalogue
        entries.append(Entry(str(path), key, value, ("infoplist",)))
    return entries


def _is_copy_file(rel):
    name = rel.name
    if rel.parts[0] == "copy" and rel.suffix == ".json":
        return True
    if rel.suffix in (".xcstrings", ".strings", ".stringsdict"):
        return True
    if name == "Info.plist" or name.endswith("-Info.plist"):
        return True
    return rel.parts[0] == "ios" and name in ("project.yml", "project.yaml")


def discover(root):
    root = Path(root)
    found = []
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root)
        if any(part in SKIP_DIRS for part in rel.parts) or rel.parts[:2] == ("docs", "archive"):
            continue
        if path.is_file() and _is_copy_file(rel):
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
    if path.suffix == ".stringsdict":
        return load_stringsdict(path)
    if path.suffix == ".plist":
        return load_info_plist(path)
    if path.suffix in (".yml", ".yaml"):
        return load_project_yml(path)
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
    try:
        count, problems = lint_paths(paths)
    except (ValueError, KeyError, json.JSONDecodeError, plistlib.InvalidFileException, UnicodeDecodeError) as error:
        print(f"copy lint: {error}")
        return 1
    for problem in problems:
        print(problem)
    if problems:
        print(f"copy lint: {len(problems)} problem(s) in {count} strings")
        return 1
    print(f"copy lint: {count} strings in {len(paths)} file(s), all clean")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
