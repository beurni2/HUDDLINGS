"""Derive the copy catalogue from the spec.

The spec is the source of truth for product copy: section 20's canonical
strings, section 9's link-preview lines and section 7's food hints ("both are
part of the catalogue and pass the same lint"), plus the other user-visible
names the spec gives in its tables: the foods and keepsakes (section 7) and
the hatch tiles' names and traits (section 5). `copy/catalogue.json` is
generated from it once and then checked against it by the tests, so the two
can never drift apart silently.

Run `python3 tools/copylint/spec_catalogue.py --write` to regenerate the
catalogue after the spec changes.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = ROOT / "docs" / "huddlings-spec.md"
CATALOGUE = ROOT / "copy" / "catalogue.json"

# Rows of the section 20 table that are not a plain "keys / texts" split.
# Each maps the row's key cell to the entries it stands for, with a note
# saying how they were read.
SPECIAL_ROWS = {
    "treats.wear / treats.takeOff": [
        ("treats.wear", "Wear it", None),
        ("treats.wearPlural", "Wear them", "the row's note: 'Wear them for glasses and shades'"),
        ("treats.takeOff", "Take it off", None),
        ("treats.takeOffPlural", "Take them off", "the row's note: 'Take them off', for plural keepsakes (section 7)"),
    ],
    "prop.topSecret / prop.missionComplete / prop.nextTime": [
        ("prop.topSecret", "TOP SECRET", "drawn on the folder"),
        ("prop.missionComplete", "Mission complete", "drawn as the folder's stamp"),
        ("prop.nextTime", "Next time", "drawn on the little sign"),
    ],
    "report.reasons": [
        ("report.reasons.spam", "Spam", "one of the three report reasons"),
        ("report.reasons.hurtful", "Hurtful", "one of the three report reasons"),
        ("report.reasons.other", "Something else", "one of the three report reasons"),
    ],
    # Composed: settings.hears.body with its first sentence replaced.
    "settings.hears.bodyCam (M7)": "compose",
    "perm.camera / perm.cameraCam (M7)": "strip-milestone",
}

FOOD_IDS = {
    "Banana": "banana", "Apple": "apple", "Orange": "orange", "Carrot": "carrot",
    "Strawberry": "strawberry", "Grapes": "grapes", "Watermelon": "watermelon",
    "Pineapple": "pineapple", "Avocado": "avocado", "Broccoli": "broccoli",
    "Pumpkin": "pumpkin", "Coconut": "coconut",
}

SCENE_IDS = {
    "Giggle": "giggle", "Royal": "royal", "Secret Agent": "secret",
    "Hug": "hug", "Grumpy": "grumpy", "Hungry": "hungry",
}


def surfaces_for(key):
    """Where a string is shown, from its key. The lint is stricter on some surfaces."""
    if key.startswith("push."):
        return ["notification"]
    if key.startswith("perm."):
        return ["infoplist"]
    if key.startswith("widget.") and key.endswith("Lock"):
        return ["widget", "lockscreen"]
    if key.startswith("widget."):
        return ["widget"]
    if key == "web.previewTitle" or key.startswith("preview."):
        return ["preview"]
    if key.startswith("web."):
        return ["web"]
    if key in ("send.shareText", "send.shareTime", "cam.shareText"):
        return ["share"]
    if key.startswith("prop."):
        return ["prop"]
    if key == "cam.entry":
        return ["app", "control"]
    return ["app"]


def _section(spec, heading, next_heading):
    start = spec.index(heading)
    end = spec.index(next_heading, start)
    return spec[start:end]


def _table_rows(block):
    rows = []
    for line in block.splitlines():
        if not line.startswith("| ") or line.startswith("| ---"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split(" | ")]
        rows.append(cells)
    return rows


def _entry(key, text, section, note=None, milestone=None):
    entry = {"text": text, "surfaces": surfaces_for(key), "section": section}
    if note:
        entry["note"] = note
    if milestone:
        entry["milestone"] = milestone
    return entry


def derive(spec):
    strings = {}

    def add(key, entry):
        if key in strings:
            raise ValueError(f"duplicate key {key}")
        strings[key] = entry

    # Section 20, canonical strings.
    block = _section(spec, "### Canonical strings", "## 21.")
    rows = _table_rows(block)
    assert rows[0] == ["Key", "Text"], rows[0]
    for key_cell, text_cell in rows[1:]:
        special = SPECIAL_ROWS.get(key_cell)
        if special == "compose":
            prefix = "The same, with its first sentence as: "
            assert text_cell.startswith(prefix), text_cell
            first = text_cell[len(prefix):]
            body = strings["settings.hears.body"]["text"]
            rest = body.split(". ", 1)[1]
            add("settings.hears.bodyCam", _entry(
                "settings.hears.bodyCam", f"{first} {rest}", "20",
                "settings.hears.body with its first sentence replaced", "M7"))
            continue
        if special == "strip-milestone":
            keys = [k.replace(" (M7)", "") for k in key_cell.split(" / ")]
            texts = text_cell.split(" / ")
            assert len(keys) == len(texts) == 2
            add(keys[0], _entry(keys[0], texts[0], "20"))
            add(keys[1], _entry(keys[1], texts[1], "20", milestone="M7"))
            continue
        if special:
            for key, text, note in special:
                add(key, _entry(key, text, "20", note))
            continue
        keys = key_cell.split(" / ")
        texts = text_cell.split(" / ")
        if len(keys) != len(texts):
            raise ValueError(f"row needs a special case: {key_cell!r}")
        for key, text in zip(keys, texts):
            milestone = "M7" if key.startswith("cam.") else None
            add(key, _entry(key, text, "20", milestone=milestone))

    # Section 9, link-preview lines.
    block = _section(spec, "| Scene | Preview line |", "### The voice note")
    for scene, line in _table_rows(block)[1:]:
        key = f"preview.{SCENE_IDS[scene]}"
        add(key, _entry(key, line.strip("`"), "9"))

    # Section 7, food names, hints and keepsakes.
    block = _section(spec, "| Food | Kind | Hint |", "- Each food is a cartoon prop")
    for cells in _table_rows(block)[1:]:
        name = cells[0].split(" ")[0]
        food = FOOD_IDS[name]
        add(f"treats.food.{food}", _entry(f"treats.food.{food}", name, "7", "the {Food} form"))
        add(f"treats.hint.{food}", _entry(f"treats.hint.{food}", cells[2].strip("`"), "7"))
        add(f"treats.keepsake.{food}", _entry(f"treats.keepsake.{food}", cells[4], "7", "the {keepsake} name"))

    # Section 5, the hatch tiles: each companion's name and three traits.
    traits = re.search(r"from a name, an emoji and three traits \((Dog: [^)]*)\)", spec).group(1)
    for part in traits.split("; "):
        name, words = part.split(": ")
        species = name.lower()
        add(f"hatch.species.{species}", _entry(f"hatch.species.{species}", name, "5"))
        add(f"hatch.traits.{species}", _entry(f"hatch.traits.{species}", words, "5"))

    return {
        "version": 1,
        "about": "Every user-visible string in Huddlings, from spec sections 7, 9 and 20. "
                 "Generated by tools/copylint/spec_catalogue.py and checked against the spec by its tests. "
                 "The copy lint (tools/copylint) runs over it.",
        "strings": strings,
    }


def main(argv):
    catalogue = derive(SPEC.read_text(encoding="utf-8"))
    rendered = json.dumps(catalogue, indent=2, ensure_ascii=False) + "\n"
    if "--write" in argv:
        CATALOGUE.parent.mkdir(parents=True, exist_ok=True)
        CATALOGUE.write_text(rendered, encoding="utf-8")
        print(f"wrote {CATALOGUE.relative_to(ROOT)} ({len(catalogue['strings'])} strings)")
        return 0
    sys.stdout.write(rendered)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
