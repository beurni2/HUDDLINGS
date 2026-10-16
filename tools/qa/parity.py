"""Parity (spec section 5b, Visual QA): the SpriteKit frames against the WebGL
frames of the same clip on the same clock, frame by frame: SSIM 0.95 or more on
the character, and no part drawn by one runtime and not the other.

python3 tools/qa/parity.py <web folder> <spritekit folder> <report folder>

Each folder holds one subfolder per run (full and small, both required) of PNG
frames, directly or in a frames/ folder (as runtime-web/lab/render.ts writes a
clip's), matched by name: f0000.png ... for a clip's frames, or one still per
clip, still_front.png ... face_shy.png, as render.ts --stills writes the dog's.
Both runtimes must have rendered the same frames, and every frame must show the
character.

"On the character": the SSIM map is averaged over the pixels either frame draws,
grown by the SSIM window's radius, so an empty background cannot dilute a
difference. A part missing from one render can move that average too little to
notice (the tag, the nose, the faint shadow), so a frame also fails on any patch
where the renders disagree (QUESTIONS.md E20), in three ways:
- strongly: a channel differs by more than STRONG over a patch BLOB px across;
- in coverage: one frame draws and the other does not, over a patch BLOB px across;
- faintly: a channel differs by more than FAINT over a patch FAINT_BLOB px across.
Measured on the test character (renders shifted by a quarter or half a pixel, or
blurred by half a pixel): edge softening makes only lines thinner than the
patches, so none of those fail; a diagonal half-pixel shift at the small size
already does. Missing shadow, tag and nose all fail at both sizes.

A soft part's level can be wrong with neither the score nor a patch noticing: the
dog's resting blush, the printed pink at 0.368 over the fur, differs from bare fur
by about 25 at its strongest, so a runtime that drew none passed. Where the web run
has a soft.json (render.ts --stills writes one: each soft part's footprint in each
still), every soft part's level is fitted in both frames, in the same box, as
palette.py fits a cheek's (the reddest tenth of the light pixels, as an opacity of
the printed pink over the printed fur, model.json's palette), and the two must agree
within SOFT_LEVEL_TOLERANCE (characters/dog/DECISIONS.md 191).

Writes report.json, a sheet of the worst frames side by side (web | SpriteKit
| difference) and an evidence strip per run (five frames, web above SpriteKit),
and exits 1 on any failure. With PARITY_PRINT_EVIDENCE=1 the strips are also
printed as base64 JPEG, for logs where artifacts cannot be fetched."""
import base64
import io
import json
import os
import sys
from pathlib import Path

import fnmatch

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.metrics import structural_similarity

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "characters" / "refprep"))
import palette  # noqa: E402

THRESHOLD = 0.95
RUNS = ("full", "small")
# A pixel belongs to the drawing when a channel differs from the background by more than this.
INK = 8
# A channel difference larger than edge softening gives; a part missing or misplaced differs by far more.
STRONG = 64
# The smallest patch of strong or coverage disagreement that fails a frame, in pixels across.
BLOB = 3
# A faint part (a shade, a shadow) missing over another part: a smaller difference over a larger patch.
FAINT = 24
FAINT_BLOB = 7
# skimage's default SSIM window is 7 x 7.
WINDOW_RADIUS = 3
# How far apart the two runtimes' fitted levels of a soft part may be: the Faces check's own tolerance on the level a
# face asks for (facematch.BLUSH_LEVEL_TOLERANCE). Measured on the dog: a quarter- or half-pixel shift or a half-pixel
# blur moves a fitted level by 0.013 at most at full size and 0.038 at the small size; a resting blush drawn at 0.3 or
# 0.45 for 0.368 moves it by 0.06 or more (DECISIONS.md 191).
SOFT_LEVEL_TOLERANCE = 0.05
# Each soft part's level is fitted as an opacity of one of model.json's palette colours over another: (part names,
# the colour under it, its own colour). The blush is the sheet match's (match.py's BLUSH_PARTS, Q25).
SOFT_FITS = ((("blush*",), "fur", "blush"),)


def load(path):
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.uint8)


def drawn(img, background):
    """The pixels the drawing touches: those that differ from the background colour."""
    return np.abs(img.astype(int) - background.astype(int)).max(axis=2) > INK


def character_mask(a, b):
    """Where either frame draws, grown by the SSIM window's radius; the background is the web frame's corner."""
    background = a[0, 0]
    union = drawn(a, background) | drawn(b, background)
    return ndimage.binary_dilation(union, structure=np.ones((3, 3), bool), iterations=WINDOW_RADIUS)


def ssim_on_character(a, b):
    """The SSIM map averaged over the character, or None when neither frame draws anything."""
    mask = character_mask(a, b)
    if not mask.any():
        return None
    _, full = structural_similarity(a, b, channel_axis=2, data_range=255, full=True)
    return float(full.mean(axis=2)[mask].mean())


def patches(mask, size):
    """Patches of a mask at least size pixels across, as (x0, y0, x1, y1) boxes of their whole extent."""
    core = ndimage.binary_erosion(mask, structure=np.ones((size, size), bool))
    if not core.any():
        return []
    # Grow the surviving cores back within the mask, so a box shows the whole patch.
    labels, _ = ndimage.label(ndimage.binary_propagation(core, mask=mask))
    return [(int(s[1].start), int(s[0].start), int(s[1].stop - 1), int(s[0].stop - 1)) for s in ndimage.find_objects(labels)]


def disagreements(a, b):
    """Every patch where the two frames disagree, as (kind, (x0, y0, x1, y1)): strong, coverage or faint."""
    difference = np.abs(a.astype(int) - b.astype(int)).max(axis=2)
    background = a[0, 0]
    coverage = drawn(a, background) ^ drawn(b, background)
    return ([("strong", box) for box in patches(difference > STRONG, BLOB)]
            + [("coverage", box) for box in patches(coverage, BLOB)]
            + [("faint", box) for box in patches(difference > FAINT, FAINT_BLOB)])


def diagnose(a, b):
    """What kind of difference two frames show: where the drawing sits, its best shift, a flip, its colour."""
    background = a[0, 0]

    def box(img):
        ink = drawn(img, background).nonzero()
        if len(ink[0]) == 0:
            return None, None
        return (int(ink[1].min()), int(ink[0].min()), int(ink[1].max()), int(ink[0].max())), (float(ink[1].mean()), float(ink[0].mean()))
    box_a, centre_a = box(a)
    box_b, centre_b = box(b)
    ga, gb = a.astype(float).mean(axis=2), b.astype(float).mean(axis=2)
    best = None
    for dy in range(-24, 25, 2):
        for dx in range(-24, 25, 2):
            err = float(((ga - np.roll(np.roll(gb, dy, axis=0), dx, axis=1)) ** 2).mean())
            if best is None or err < best[0]:
                best = (err, dx, dy)
    flipped = structural_similarity(a, b[::-1], channel_axis=2, data_range=255)
    both = drawn(a, background) & drawn(b, background)
    colour = (b.astype(float) - a.astype(float))[both].mean(axis=0).round(1).tolist() if both.any() else None
    return {"web box": box_a, "spritekit box": box_b, "web centre": centre_a, "spritekit centre": centre_b,
            "best shift moving spritekit (dx, dy)": best[1:], "mse at best shift": round(best[0], 1),
            "ssim if spritekit were flipped": round(float(flipped), 4), "mean colour difference where both draw": colour}


def side_by_side(a, b, boxes=()):
    """Web | SpriteKit | their difference, with the box of each soft part whose levels are apart outlined on it, a pixel
    outside, so the outline never hides the difference it frames."""
    diff = np.abs(a.astype(int) - b.astype(int)).sum(axis=2)
    heat = np.stack([np.clip(255 - diff * 4, 0, 255).astype(np.uint8)] * 3, axis=2)
    h, w = diff.shape
    for x0, y0, x1, y1 in boxes:
        x0, y0, x1, y1 = max(x0 - 1, 0), max(y0 - 1, 0), min(x1 + 1, w - 1), min(y1 + 1, h - 1)
        heat[y0:y1 + 1, [x0, x1]] = heat[[y0, y1], x0:x1 + 1] = (220, 0, 160)
    return np.concatenate([a, b, heat], axis=1)


def sheet_text(rows):
    """A small side-by-side sheet as base64 JPEG, for logs where artifacts cannot be fetched."""
    image = Image.fromarray(np.concatenate(rows, axis=0))
    image.thumbnail((720, 720))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=80)
    text = base64.b64encode(buffer.getvalue()).decode("ascii")
    return [text[i:i + 100] for i in range(0, len(text), 100)]


def evidence(web, spritekit, run, names):
    """Five frames spread across the run, web above SpriteKit."""
    picks = [names[round(i * (len(names) - 1) / 4)] for i in range(5)]
    rows = [np.concatenate([load(frames(root, run) / name) for name in picks], axis=1) for root in (web, spritekit)]
    gap = np.full((8, rows[0].shape[1], 3), 255, np.uint8)
    return Image.fromarray(np.concatenate([rows[0], gap, rows[1]], axis=0)), picks


def frames(root, run):
    nested = root / run / "frames"
    return nested if nested.is_dir() else root / run


def frame_names(root, run):
    folder = frames(root, run)
    return sorted(p.name for p in folder.glob("*.png")) if folder.is_dir() else []


def runs_in(root):
    return sorted(p.name for p in root.iterdir() if p.is_dir()) if root.is_dir() else []


def soft_parts(web, run):
    """The web run's soft.json (render.ts --stills), or None when it declares none, as the test dance's frames do."""
    path = web / run / "soft.json"
    return json.loads(path.read_text()) if path.is_file() else None


def soft_level(img, box, under, over):
    """A soft part's level in a frame: palette.blush's fit in the box [x0, y0, x1, y1] (inclusive pixel indices), or None
    when the box holds no light pixel to fit."""
    x0, y0, x1, y1 = box
    crop = img[y0:y1 + 1, x0:x1 + 1]
    lab = palette.sheets.to_lab(crop.reshape(-1, 3))
    if not ((lab[:, 0] > palette.LIGHT_L_MIN) & (np.hypot(lab[:, 1], lab[:, 2]) < palette.LIGHT_CHROMA_MAX)).any():
        return None
    return palette.blush(crop, under, over)[0]


def compare_soft(web, spritekit, run, declared, problems):
    """Each soft part's level fitted in both frames, where both have the frame; returns the rows."""
    model_path = ROOT / "characters" / str(declared.get("species")) / "model.json"
    if not model_path.is_file():
        problems.append(f"{run}: soft.json names the species {declared.get('species')!r}, which has no model.json for its colours")
        return []
    colours = json.loads(model_path.read_text())["palette"]
    rows = []
    for name, parts in sorted(declared.get("stills", {}).items()):
        if not (frames(web, run) / name).is_file():
            problems.append(f"{run}/{name}: soft.json names a still the web run does not hold")
            continue
        if not (frames(spritekit, run) / name).is_file():
            continue  # already a problem: no SpriteKit frame
        a, b = load(frames(web, run) / name), load(frames(spritekit, run) / name)
        if a.shape != b.shape:
            continue  # already a problem: sizes differ
        for entry in parts:
            part = entry["part"]
            fit = next(((under, over) for patterns, under, over in SOFT_FITS if any(fnmatch.fnmatchcase(part, p) for p in patterns)), None)
            if fit is None:
                problems.append(f"{run}/{name}: {part} is soft, and parity has no fit for its level (SOFT_FITS)")
                continue
            under, over = colours[fit[0]], colours[fit[1]]
            web_level, sk_level = (soft_level(img, entry["box"], under, over) for img in (a, b))
            row = {"frame": name, "part": part, "box": entry["box"], "web": None if web_level is None else round(web_level, 3),
                   "spritekit": None if sk_level is None else round(sk_level, 3)}
            if web_level is None or sk_level is None:
                side = "web" if web_level is None else "SpriteKit"
                row["pass"] = False
                problems.append(f"{run}/{name}: the {side} frame has no light pixel in {part}'s box {entry['box']} to fit its level on")
            else:
                row["difference"] = round(sk_level - web_level, 3)
                row["pass"] = abs(sk_level - web_level) <= SOFT_LEVEL_TOLERANCE
                if not row["pass"]:
                    problems.append(f"{run}/{name}: {part}'s level is {web_level:.3f} on the web and {sk_level:.3f} in SpriteKit, "
                                    f"more than {SOFT_LEVEL_TOLERANCE} apart")
            rows.append(row)
    return rows


def compare_run(web, spritekit, run, problems):
    """Scores one run; returns its report entry, or None when it has nothing to score."""
    web_names, sk_names = frame_names(web, run), frame_names(spritekit, run)
    if not web_names:
        problems.append(f"{run}: no web frames")
    if not sk_names:
        problems.append(f"{run}: no SpriteKit frames")
    for name in sorted(set(web_names) - set(sk_names)):
        problems.append(f"{run}/{name}: no SpriteKit frame")
    for name in sorted(set(sk_names) - set(web_names)):
        problems.append(f"{run}/{name}: no web frame")
    scored = []
    for name in sorted(set(web_names) & set(sk_names)):
        a, b = load(frames(web, run) / name), load(frames(spritekit, run) / name)
        if a.shape != b.shape:
            problems.append(f"{run}/{name}: sizes differ, {a.shape} vs {b.shape}")
            continue
        background = a[0, 0]
        for side, img in (("web", a), ("SpriteKit", b)):
            if not drawn(img, background).any():
                problems.append(f"{run}/{name}: the {side} frame shows no character")
        score = ssim_on_character(a, b)
        if score is None:
            continue
        found = disagreements(a, b)
        scored.append({"frame": name, "ssim": round(score, 4), "patches": [[kind, list(box)] for kind, box in found[:4]]})
        if score < THRESHOLD:
            problems.append(f"{run}/{name}: SSIM on the character {score:.4f}, below {THRESHOLD}")
        if found:
            kind, box = found[0]
            problems.append(f"{run}/{name}: the runtimes disagree over {len(found)} patch(es), the first {kind} at {box} (x0, y0, x1, y1)")
    declared = soft_parts(web, run)
    soft = compare_soft(web, spritekit, run, declared, problems) if declared is not None else None
    if not scored:
        return None
    values = [s["ssim"] for s in scored]
    off = {r["frame"] for r in soft or () if not r["pass"]}
    for s in scored:
        if s["frame"] in off:
            s["soft levels apart"] = [r["part"] for r in soft if r["frame"] == s["frame"] and not r["pass"]]
    # A frame that fails comes first: by a patch or a soft part's level, then by its score.
    worst = sorted(scored, key=lambda s: (not (s["patches"] or s["frame"] in off), s["ssim"]))[:6]
    entry = {"frames": len(scored), "min": min(values), "mean": round(float(np.mean(values)), 4),
             "with patches": sum(1 for s in scored if s["patches"]), "worst": worst}
    if soft is not None:
        differences = [abs(r["difference"]) for r in soft if "difference" in r]
        entry["soft"] = {"tolerance": SOFT_LEVEL_TOLERANCE, "levels": len(soft), "apart": sum(not r["pass"] for r in soft),
                         "largest difference": max(differences) if differences else None, "rows": soft}
    return entry


def main(web, spritekit, out):
    web, spritekit, out = Path(web), Path(spritekit), Path(out)
    out.mkdir(parents=True, exist_ok=True)
    report = {"threshold": THRESHOLD, "softLevelTolerance": SOFT_LEVEL_TOLERANCE, "runs": {}, "problems": []}
    problems = report["problems"]
    for side, root in (("web", web), ("SpriteKit", spritekit)):
        for run in RUNS:
            if run not in runs_in(root):
                problems.append(f"{run}: the {side} render has no {run} run")
        for run in runs_in(root):
            if run not in RUNS:
                problems.append(f"{run}: an unexpected {side} run (expected {', '.join(RUNS)})")
    sheet = None
    for run in RUNS:
        before = len(problems)
        entry = compare_run(web, spritekit, run, problems)
        if entry is None:
            continue
        report["runs"][run] = entry
        print(f"parity: {run}: {entry['frames']} frames, SSIM on the character min {entry['min']:.4f}, mean {entry['mean']:.4f}, "
              f"frames with a part-sized disagreement: {entry['with patches']}")
        if "soft" in entry:
            soft = entry["soft"]
            largest = "none fitted" if soft["largest difference"] is None else f"the largest difference {soft['largest difference']:.3f}"
            print(f"parity: {run}: soft parts' levels: {soft['levels']} fitted in both runtimes, {largest}, "
                  f"{soft['apart']} more than {soft['tolerance']} apart")
        else:
            print(f"parity: {run}: soft parts' levels: none declared (no soft.json in the web run)")
        apart = {}
        for r in entry.get("soft", {}).get("rows", ()):
            if not r["pass"]:
                apart.setdefault(r["frame"], []).append(r["box"])
        rows = [side_by_side(load(frames(web, run) / w["frame"]), load(frames(spritekit, run) / w["frame"]), apart.get(w["frame"], ()))
                for w in entry["worst"]]
        Image.fromarray(np.concatenate(rows, axis=0)).save(out / f"{run}-worst.png")
        first = entry["worst"][0]["frame"]
        entry["diagnosis of " + first] = diagnose(load(frames(web, run) / first), load(frames(spritekit, run) / first))
        print(f"parity: {run}: diagnosis of {first}: {json.dumps(entry['diagnosis of ' + first])}")
        if len(problems) > before and sheet is None:
            # The first failing run's worst frames (web | SpriteKit | difference), readable from the log alone.
            sheet = (run, sheet_text(rows[:2]))
    for run, entry in report["runs"].items():
        names = sorted(set(frame_names(web, run)) & set(frame_names(spritekit, run)))
        try:
            strip, picks = evidence(web, spritekit, run, names)
        except ValueError:
            continue
        strip.save(out / f"{run}-evidence.png")
        entry["evidence frames"] = picks
        if os.environ.get("PARITY_PRINT_EVIDENCE") == "1":
            strip.thumbnail((1000, 1000))
            buffer = io.BytesIO()
            strip.save(buffer, format="JPEG", quality=85)
            text = base64.b64encode(buffer.getvalue()).decode("ascii")
            print(f"PARITY-EVIDENCE-BEGIN {run} {' '.join(picks)}")
            for i in range(0, len(text), 100):
                print(text[i:i + 100])
            print(f"PARITY-EVIDENCE-END {run}")
    for problem in problems[:40]:
        print(f"parity: {problem}")
    if len(problems) > 40:
        print(f"parity: ... and {len(problems) - 40} more (report.json)")
    if sheet:
        run, lines = sheet
        print(f"PARITY-SHEET-BEGIN {run}")
        for line in lines:
            print(line)
        print(f"PARITY-SHEET-END {run}")
    (out / "report.json").write_text(json.dumps(report, indent=1) + "\n")
    print("parity: green" if not problems else f"parity: {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(*sys.argv[1:]))
