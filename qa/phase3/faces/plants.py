"""Rule R3's guards (characters/dog/test/faces.test.ts) run on a copy of the committed tree with a fault planted in the
source each time, then with none, written to r3-plants.txt: an open mouth whose lip's ends hang below its centre (a
frown under an open mouth), the neutral brow turned so its inner end sits below its outer (an angry slant), shy's
left ear turned 12° in (a droop past the lowered state), listening's lifted left ear turned 12° out (the drooped ears'
splay), curious keying no head.line state beside its perked ear (the crease in the temple), and on the new faces:
huffy's pressed mouth with its ends bent below its centre (a frown pressed shut), its shut lids slanted with their inner
ends down (the sheets' Angry), its left brow raised, its left ear turned 7 degrees in (a droop), and the puffed cheeks
on another face; and from the last review: mischievous winking the dog's right eye again (Cheeky closes its left),
listening keying no temple beside its lifted ear, the temple drawn into the lifted ear's own drawing again (where it
swings out of the head's side, R16), hungry's eager eye rolled up under its white (the pleading eyes), and huffy's peek
back looking up as it was; and from the founder's eye decisions (DECISIONS 201 to 204): the squeeze's arms steepened
into a scowl, the peek's catchlights left where the open eye has them as its iris moves, and the tiny catchlight grown
to more than half the large one's size. Nothing in the working tree is touched.

    python3 qa/phase3/faces/plants.py qa/phase3/faces/r3-plants.txt"""
import os
import subprocess
import sys
import tarfile
import tempfile
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TEST = "characters/dog/test/faces.test.ts"

# (title, file, text in it, its replacement)
PLANTS = [
    ("open frown: the open mouth's lip curls bent down, its ends 6.6 pt below its centre",
     "characters/dog/src/parts/mouth.ts", "[10.6, 16.75], [11.7, 16], [12.5, 15], [12.9, 14]],",
     "[10.6, 17.6], [11.7, 18.6], [12.5, 19.8], [12.9, 20.8]],"),
    ("angry brow: the neutral brow sheared so its inner end sits 1.6 pt below its outer",
     "characters/dog/src/parts/brow.ts", "[[27.4, -25.4], [26, -27.4], [24.2, -28.8], [22.2, -29.4], [20.2, -28.85], [18.6, -27.7]]",
     "[[27.4, -25.4], [26, -26.77], [24.2, -27.36], [22.2, -27.06], [20.2, -25.61], [18.6, -23.74]]"),
    ("drooped ear: face_shy's left ear turned 12 degrees in",
     "characters/dog/src/clips/face_shy.json", '"ear.L": { "rot": [[0, 3]] }', '"ear.L": { "rot": [[0, 12]] }'),
    ("splayed ear: face_listening's lifted left ear turned 12 degrees out",
     "characters/dog/src/clips/face_listening.json", '"ear.L": { "rot": [[0, 0]] }', '"ear.L": { "rot": [[0, -12]] }'),
    ("creased temple: face_curious keys no head.line state beside its perked ear",
     "characters/dog/src/clips/face_curious.json", ', "head.line": [[0, "templeL"]]', ""),
    ("pressed frown: huffy's pressed mouth with its ends bent 0.9 pt below its centre",
     "characters/dog/src/parts/mouth.ts", "[4.6, 14.5], [5.1, 14.3]];", "[4.6, 15], [5.1, 15.4]];"),
    ("slanted lids: huffy's flat lids with their outer ends lifted 1.5 pt, the inner ends down toward the nose",
     "characters/dog/src/views/front.ts", "rise: -1, drop: 0, thickness: 4.4", "rise: -1, drop: -1.5, thickness: 4.4"),
    ("raised brow: huffy's left brow raised over its shut eye",
     "characters/dog/src/presets.ts", 'ears: "neutral", brows: "neutral", cheeks: "puffed"', 'ears: "neutral", brows: { L: "raised", R: "neutral" }, cheeks: "puffed"'),
    ("drooped ear: face_huffy's left ear turned 7 degrees in",
     "characters/dog/src/clips/face_huffy.json", '"ear.L": { "rot": [[0, 0]] }', '"ear.L": { "rot": [[0, 7]] }'),
    ("puffed cheeks elsewhere: face_happy keys the puffed cheeks",
     "characters/dog/src/clips/face_happy.json", '"ear.R": [[0, "neutral"]] }', '"ear.R": [[0, "neutral"]], "cheeks": [[0, "puffed"]] }'),
    ("wink on the right: mischievous winks the dog's right eye, where Cheeky, its primary, closes the left",
     "characters/dog/src/presets.ts", 'mischievous"], wink: "L"', 'mischievous"], wink: "R"'),
    ("open temple: face_listening keys no temple beside its lifted left ear",
     "characters/dog/src/clips/face_listening.json", '"temple.L": [[0, "up"]], ', ""),
    ("temple on the ear: the lifted ear's drawing carries its temple again, so it swings with the ear's spring",
     "characters/dog/src/views/front.ts",
     'return litPart(`ear.${side}`, lifted[side], paint, [side === "R" ? { from: a, to: b, on: "tan", taper: [3, 3] } : { from: b, to: a, on: "tan", taper: [3, 3] }]);',
     'return join(litPart(`ear.${side}`, lifted[side], paint, [side === "R" ? { from: a, to: b, on: "tan", taper: [3, 3] } : { from: b, to: a, on: "tan", taper: [3, 3] }]), templePiece(side));'),
    ("pleading eyes: hungry's eager eye rolled up, its white under the iris (the last review's probe)",
     "characters/dog/src/views/front.ts", "const EAGER: Eager = { white: { at: 10, width: 2, span: 55 },", "const EAGER: Eager = { white: { at: -90, width: 3, span: 70 },"),
    ("looking up: huffy's peek back with its white at 186 degrees, as it was",
     "characters/dog/src/views/front.ts", 'white: { at: side === "R" ? -6 : 168,', 'white: { at: side === "R" ? -6 : 186,'),
    ("scowling squeeze: the squeeze's arms turned 30 degrees up and 40 down, past the sister sheets' Excited",
     "characters/dog/src/views/front.ts", "length: [16.8, 15.8], angle: [14, 26],", "length: [16.8, 15.8], angle: [30, 40],"),
    ("stuck catchlight: the peek's catchlights left where the open eye has them as its iris moves (Q28)",
     "characters/dog/src/views/front.ts", "return { ...e, shine: riding(e, spec, spec.shine) };\n    }\n    // The sparkle", "return e;\n    }\n    // The sparkle"),
    ("a second large light: the tiny catchlight at 0.6 of the large one's size (Q26 asks about a quarter)",
     "characters/dog/src/parts/eye.ts", "export const TINY = { scale: 0.25,", "export const TINY = { scale: 0.6,"),
]


def tree(into):
    archive = subprocess.run(["git", "-C", str(ROOT), "archive", "HEAD"], check=True, capture_output=True).stdout
    tarfile.open(fileobj=BytesIO(archive)).extractall(into, filter="data")
    os.symlink(ROOT / "node_modules", Path(into) / "node_modules")


def run(into):
    r = subprocess.run(["node", "--test", "--test-reporter=spec", TEST], cwd=into, capture_output=True, text=True)
    keep = [line for line in r.stdout.splitlines() if line.lstrip().startswith(("✔", "✖", "+ '", '+ "', "AssertionError", "error:"))]
    return [line.split(" (")[0] if line.lstrip().startswith(("✔", "✖")) else line for line in keep]


def main(out):
    lines = []
    for title, path, old, new in [("no plant", None, None, None), *PLANTS, ("plants taken out", None, None, None)]:
        with tempfile.TemporaryDirectory() as into:
            tree(into)
            if path:
                f = Path(into) / path
                text = f.read_text()
                assert text.count(old) == 1, f"{path}: the plant's target moved"
                f.write_text(text.replace(old, new))
            lines += [f"== {title}", *run(into)]
    Path(out).write_text("\n".join(lines) + "\n")
    print(out)


if __name__ == "__main__":
    main(sys.argv[1])
