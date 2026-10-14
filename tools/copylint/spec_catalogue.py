"""Derive the copy catalogue from the spec.

The spec is the source of truth for product copy: section 20's canonical
strings, section 9's link-preview lines and section 7's food hints ("both are
part of the catalogue and pass the same lint"), plus the other user-visible
words the spec gives outside that table: the line for the App Store and every
share (section 1), the hatch tiles' names and traits (section 5), the foods
and keepsakes (section 7), the playback speeds (section 11) and the {species}
values (section 20). `copy/catalogue.json` is generated from it and checked
against it by the tests, so the two cannot drift apart silently.

Copy the spec requires but never words (docs/QUESTIONS.md) is added once the
founder approves it.

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

# Section 6: the Lock Screen's rectangular widget shows the status line, so
# these lines appear there too; the Film with Mochi control sits there (section 13).
LOCK_SCREEN = {"widget.onTheWayLock", "widget.visitorLock", "widget.home", "widget.hungry", "cam.entry"}

# Section 11, W1 and section 10: the web page plays the same scenes, note,
# souvenirs, reports and reply veil as the app. Reviewed again when the page is
# built (M3).
WEB_ONLY = {"scene.secret.web", "scene.secret.quietly"}
WEB_AND_APP_PREFIXES = ("scene.", "souvenir.", "report.", "note.speed.")
WEB_AND_APP_KEYS = {
    "note.from", "note.signature", "note.play", "note.report", "send.hold", "send.type",
    "send.line", "send.send", "age.question", "age.continue", "settings.terms",
    "settings.privacy", "settings.safety", "web.unavailable",
}


def surfaces_for(key):
    """Where a string is shown. The lint is stricter on some surfaces."""
    if key.startswith("push."):
        return ["notification"]
    if key.startswith("perm."):
        return ["infoplist"]
    if key in WEB_ONLY:
        return ["web"]
    if key.startswith("widget."):
        return ["widget", "lockscreen"] if key in LOCK_SCREEN else ["widget"]
    if key == "web.previewTitle" or key.startswith("preview."):
        return ["preview"]
    if key == "share.tagline":
        return ["store"]  # the spec says "and every share"; see docs/QUESTIONS.md Q18
    if key in ("send.shareText", "send.shareTime", "cam.shareText"):
        return ["share"]
    if key.startswith("prop."):
        return ["prop"]
    if key == "cam.entry":
        return ["app", "control", "lockscreen"]
    if key.startswith("web.") and key not in WEB_AND_APP_KEYS:
        return ["web"]
    if key.startswith(WEB_AND_APP_PREFIXES) or key in WEB_AND_APP_KEYS:
        return ["app", "web"]
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
        rows.append([c.strip() for c in line.strip().strip("|").split(" | ")])
    return rows


def _entry(key, text, section, note=None, milestone=None):
    entry = {"text": text, "surfaces": surfaces_for(key), "section": section}
    if note:
        entry["note"] = note
    if milestone:
        entry["milestone"] = milestone
    return entry


def _special_rows(key_cell, text_cell):
    """Rows of the section 20 table that are not a plain "keys / texts" split, read from their text."""
    if key_cell == "treats.wear / treats.takeOff":
        m = re.fullmatch(r"(.+?) \((.+?) for (.+?)\) / (.+?) \((.+?)\)", text_cell)
        assert m, text_cell
        return [
            ("treats.wear", m.group(1), None),
            ("treats.wearPlural", m.group(2), f"for {m.group(3)}, as the row says"),
            ("treats.takeOff", m.group(4), None),
            ("treats.takeOffPlural", m.group(5), "for plural keepsakes (section 7)"),
        ]
    if key_cell == "prop.topSecret / prop.missionComplete / prop.nextTime":
        m = re.fullmatch(r"(.+) \(drawn on (.+)\)", text_cell)
        assert m, text_cell
        texts = m.group(1).split(" / ")
        assert len(texts) == 3, texts
        where = ["drawn on the folder", "drawn as the folder's stamp", "drawn on the little sign"]
        return [(k, t, w) for k, t, w in zip(key_cell.split(" / "), texts, where)]
    if key_cell == "report.reasons":
        texts = text_cell.split(" · ")
        assert len(texts) == 3, texts
        ids = ["spam", "hurtful", "other"]  # the reasons of section 17 and Appendix B
        return [(f"report.reasons.{i}", t, "one of the three report reasons") for i, t in zip(ids, texts)]
    return None


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
        if key_cell == "settings.hears.bodyCam (M7)":
            prefix = "The same, with its first sentence as: "
            assert text_cell.startswith(prefix), text_cell
            rest = strings["settings.hears.body"]["text"].split(". ", 1)[1]
            add("settings.hears.bodyCam", _entry(
                "settings.hears.bodyCam", f"{text_cell[len(prefix):]} {rest}", "20",
                "settings.hears.body with its first sentence replaced; its last sentence is an open question "
                "(docs/QUESTIONS.md)", "M7"))
            continue
        special = _special_rows(key_cell, text_cell)
        if special:
            for key, text, note in special:
                add(key, _entry(key, text, "20", note))
            continue
        keys = key_cell.split(" / ")
        texts = text_cell.split(" / ")
        if len(keys) != len(texts):
            raise ValueError(f"row needs a special case: {key_cell!r}")
        for key, text in zip(keys, texts):
            milestone = None
            if key.endswith(" (M7)"):
                key, milestone = key[:-len(" (M7)")], "M7"
            if key.startswith("cam."):
                milestone = "M7"
            add(key, _entry(key, text, "20", milestone=milestone))

    # Section 20, Placeholders: the {species} values.
    m = re.search(r"`\{species\}` ([a-z]+), ([a-z]+), ([a-z]+) or ([a-z]+);", spec)
    for species in m.groups():
        add(f"species.{species}", _entry(f"species.{species}", species, "20", "the {species} value"))

    # Section 1, the line for the App Store and every share.
    m = re.search(r"\*\*The line for the App Store and every share:\*\* (.+)", spec)
    add("share.tagline", _entry("share.tagline", m.group(1).strip(), "1",
                                "how it joins the share texts is an open question (docs/QUESTIONS.md)"))

    # Section 5, the hatch tiles: each companion's name and three traits.
    traits = re.search(r"from a name, an emoji and three traits \((Dog: [^)]*)\)", spec).group(1)
    for part in traits.split("; "):
        name, words = part.split(": ")
        species = name.lower()
        add(f"hatch.species.{species}", _entry(f"hatch.species.{species}", name, "5"))
        add(f"hatch.traits.{species}", _entry(f"hatch.traits.{species}", words, "5"))

    # Section 7, food names, hints and keepsakes.
    block = _section(spec, "| Food | Kind | Hint |", "- Each food is a cartoon prop")
    for cells in _table_rows(block)[1:]:
        name = cells[0].split(" ")[0]
        food = FOOD_IDS[name]
        add(f"treats.food.{food}", _entry(f"treats.food.{food}", name, "7", "the {Food} form"))
        add(f"treats.hint.{food}", _entry(f"treats.hint.{food}", cells[2].strip("`"), "7"))
        add(f"treats.keepsake.{food}", _entry(f"treats.keepsake.{food}", cells[4], "7", "the {keepsake} name"))

    # Section 9, link-preview lines.
    block = _section(spec, "| Scene | Preview line |", "### The voice note")
    for scene, line in _table_rows(block)[1:]:
        key = f"preview.{SCENE_IDS[scene]}"
        add(key, _entry(key, line.strip("`"), "9"))

    # Section 11, the note's playback speeds (written with the multiplication sign there and in sections 14 and 22).
    m = re.search(r"speed \((1×), (1\.5×), (2×)\)", spec)
    for key, text in zip(("note.speed.1", "note.speed.1_5", "note.speed.2"), m.groups()):
        add(key, _entry(key, text, "11"))

    sections = sorted({e["section"] for e in strings.values()}, key=int)
    return {
        "version": 1,
        "about": "Every user-visible string the spec words, from sections " + ", ".join(sections[:-1])
                 + f" and {sections[-1]}. Generated by tools/copylint/spec_catalogue.py and checked against the "
                 "spec by its tests; the copy lint (tools/copylint) runs over it. Copy the spec needs but never "
                 "words is listed in docs/QUESTIONS.md until the founder approves it.",
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
