"""The Faces check's blush tolerance, measured (docs/QUESTIONS.md Q25;
DECISIONS.md 190): the built package's blush keyed at known levels in every view
that draws one, each still's cheeks fitted exactly as the Faces check fits them
(facematch.check_blush, which is match.py's fit), and the fit's error against
the level asked, beside how far apart the levels the presets name lie.

    python3 characters/sheetmatch/blushcal.py dog [--package <dir>] [--presets <json>] [--out <dir>]

A level is drawn as the blush parts' alpha over the reference level they are
drawn at (presets.ts BLUSH_REFERENCE): alpha = level / reference, rounded to
three places as the face clips round it (faceClips.ts blushAlpha). The package
(default build/characters/<species>/) is copied into <out>/package/ (default
build/blushcal/<species>/) with one clip per view and level, blushcal_<view>_<level
in thousandths>, keying both blush parts' alpha; runtime-web/lab/still.ts draws
them all at 3 px/pt into <out>/stills/. Each cheek's error is its fitted level
less the level asked: the worst of them is the fit's worst same-level error. Each
cheek of a still keyed at one level the presets name (or the resting level)
measured against every other one is a different-level error: the least of
them is the best different-level error. The tolerance facematch.py uses must
lie strictly between the two, and halfway is where DECISIONS.md 117 puts a
threshold. Writes <out>/blushcal.json (every cheek, every number) and
<out>/blushcal.png (fitted against asked per view and cheek, with the
tolerance's band), prints both ends, and exits 0 when the tolerance lies
between them, 1 when it does not and 2 on any error. It takes about a minute.

The worst same-level error is taken from the resting spread's low end up
(model.json's blush, 0.29 on the Grown dog), the levels a clip asks for: the
sweep below it is measured and reported apart (belowRest), since there one
anti-aliased lid-line pixel can join the reddest tenth of a cheek's few light
pixels and read the faint blush high (DECISIONS.md 190), a limit of the fit,
which this never changes."""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np

import facematch
import match

sheets = match.sheets
PPP = 3  # the look loop's stills
STEP = 0.05  # the sweep's step, from STEP up to the reference level


def blush_views(rig):
    """The views each blush part draws in, from rig.json: {view: [parts]}."""
    views = {}
    for part in rig["parts"]:
        if not match.matches(part["name"], match.BLUSH_PARTS):
            continue
        for key, region in part["regions"].items():
            if region is not None:
                views.setdefault(key.split(":")[0], []).append(part["name"])
    return {v: sorted(set(parts)) for v, parts in sorted(views.items())}


def named_levels(presets, model):
    """The levels the presets name, and the resting level the others rest at."""
    named = {round(float(p["blush"]), 3) for p in presets["PRESETS"].values() if p.get("blush") is not None}
    return sorted(named | {round(float(model["blush"]["restingLevel"]), 3)})


def sweep(reference, named):
    """The levels the blush is keyed at: STEP to the reference level, and every named level."""
    levels = {round(STEP * i, 3) for i in range(1, int(np.floor(reference / STEP + 1e-9)) + 1)}
    return sorted(levels | {level for level in named if level <= reference})


def clip_name(view, level):
    return f"blushcal_{view}_{int(round(level * 1000)):04d}"


def calibration_package(package, out, reference, views, levels):
    """The package copied with one clip per view and level, listed in its package.json as the Lab reads them."""
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(package, out)
    manifest = json.loads((out / "package.json").read_text())
    clips = []
    for view, parts in views.items():
        for level in levels:
            alpha = round(level / reference, 3)
            clip = {"name": clip_name(view, level), "lengthMs": 1000, "views": {"body": [[0, view]], "head": [[0, view]]},
                    "alpha": {part: [[0, alpha]] for part in parts}}
            text = (json.dumps(clip, indent=1) + "\n").encode()
            (out / "clips" / f"{clip['name']}.json").write_bytes(text)
            manifest["files"][f"clips/{clip['name']}.json"] = hashlib.sha256(text).hexdigest()
            clips.append((clip["name"], view, level, alpha))
    (out / "package.json").write_text(json.dumps(manifest, indent=1) + "\n")
    return clips


def render(package, stills, names):
    """Every still, drawn by the WebGL runtime in one Chromium (runtime-web/lab/still.ts)."""
    command = ["node", str(sheets.ROOT / "runtime-web/lab/still.ts"), "--package", str(package), "--ppp", str(PPP), "--out", str(stills)]
    for name in names:
        command += ["--still", name]
    done = subprocess.run(command, cwd=sheets.ROOT, capture_output=True, text=True)
    if done.returncode != 0:
        raise RuntimeError(f"still.ts failed ({done.returncode}): {done.stderr.strip()[-2000:]}")


def measure(species, model, stills, clips):
    """Each still's cheeks, fitted as the Faces check fits them, with the level asked."""
    rows = []
    for name, view, level, alpha in clips:
        still = match.Still.load(stills / name)
        blush, _ = facematch.check_blush(species, model, still, level)
        for cheek in blush["cheeks"]:
            if "level" not in cheek:
                raise ValueError(f"{name}: {cheek.get('part')} has no fitted level ({cheek.get('problem')})")
            rows.append({"still": name, "view": view, "part": cheek["part"], "asked": level, "alpha": alpha,
                         "fitted": cheek["level"], "error": round(cheek["level"] - level, 4),
                         "coreDeltaE2000": cheek["coreDeltaE2000"]})
    return rows


def ends(rows, named, floor):
    """The worst same-level error from floor up, and the best different-level error among the named levels, with where
    each lies."""
    worst = max((r for r in rows if r["asked"] >= floor), key=lambda r: abs(r["error"]))
    best = None
    for r in rows:
        if r["asked"] not in named:
            continue
        for other in named:
            if other == r["asked"]:
                continue
            off = abs(r["fitted"] - other)
            if best is None or off < best["off"]:
                best = {"off": round(off, 4), "still": r["still"], "part": r["part"], "keyed": r["asked"], "against": other, "fitted": r["fitted"]}
    return worst, best


def plot(rows, used, named, floor, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    figure, (left, right) = plt.subplots(1, 2, figsize=(12, 5.4), dpi=110)
    top = max(r["asked"] for r in rows) + 0.05
    x = np.array([0, top])
    for axis in (left,):
        axis.fill_between(x, x - used, x + used, color="#cfe3f7", label=f"the tolerance, ±{used:g}")
        axis.plot(x, x, color="#555555", lw=0.8)
    groups = sorted({(r["view"], r["part"]) for r in rows})
    for view, part in groups:
        mine = sorted((r for r in rows if (r["view"], r["part"]) == (view, part)), key=lambda r: r["asked"])
        asked = [r["asked"] for r in mine]
        left.plot(asked, [r["fitted"] for r in mine], marker="o", ms=3, lw=1, label=f"{view} {part}")
        right.plot(asked, [r["error"] for r in mine], marker="o", ms=3, lw=1, label=f"{view} {part}")
    for level in named:
        for axis in (left, right):
            axis.axvline(level, color="#c0392b", lw=0.6, ls=":")
    right.axhspan(-used, used, color="#cfe3f7")
    right.axvspan(0, floor, color="#eeeeee", label="below the resting spread, reported apart")
    right.axhline(0, color="#555555", lw=0.8)
    left.set(xlabel="level asked (alpha × the reference level)", ylabel="level fitted", title="each cheek's fitted level", xlim=(0, top), ylim=(0, top))
    right.set(xlabel="level asked", ylabel="fitted − asked", title="the fit's error; the named levels dotted red")
    right.legend(fontsize=7, loc="upper right")
    left.legend(fontsize=7, loc="upper left")
    figure.tight_layout()
    figure.savefig(path)
    plt.close(figure)


def main(argv):
    parser = argparse.ArgumentParser(usage=__doc__)
    parser.add_argument("species")
    parser.add_argument("--package")
    parser.add_argument("--presets")
    parser.add_argument("--out")
    args = parser.parse_args(argv)
    species = args.species
    package = Path(args.package) if args.package else sheets.ROOT / "build" / "characters" / species
    out = Path(args.out) if args.out else sheets.ROOT / "build" / "blushcal" / species
    model = json.loads((sheets.ROOT / "characters" / species / "model.json").read_text())
    presets = facematch.load_presets(species, args.presets)
    reference = presets.get("BLUSH_REFERENCE")
    if not isinstance(reference, (int, float)) or not 0 < reference <= 1:
        raise ValueError("presets.ts names no BLUSH_REFERENCE, the level its blush is drawn at, so no level can be keyed")
    rig = json.loads((package / "rig.json").read_text())
    views = blush_views(rig)
    named = named_levels(presets, model)
    levels = sweep(reference, named)
    out.mkdir(parents=True, exist_ok=True)
    clips = calibration_package(package, out / "package", reference, views, levels)
    render(out / "package", out / "stills", [c[0] for c in clips])
    rows = measure(species, model, out / "stills", clips)
    floor = float(model["blush"]["restingSpread"][0])
    worst, best = ends(rows, named, floor)
    below = [r for r in rows if r["asked"] < floor]
    below_worst = max(below, key=lambda r: abs(r["error"])) if below else None
    used = facematch.BLUSH_LEVEL_TOLERANCE
    halfway = round((abs(worst["error"]) + best["off"]) / 2, 4)
    between = abs(worst["error"]) < used < best["off"]
    errors = np.array([r["error"] for r in rows])
    result = {"species": species, "reference": reference, "ppp": PPP, "views": views, "levels": levels, "namedLevels": named,
              "cheeks": len(rows), "meanError": round(float(errors.mean()), 4), "meanAbsError": round(float(np.abs(errors).mean()), 4),
              "sameFrom": floor, "worstSame": worst, "bestDifferent": best, "halfway": halfway, "used": used, "usedBetween": between,
              "belowRest": below_worst,
              "byView": {f"{v} {p}": {"maxAbsError": round(max(abs(r["error"]) for r in rows if (r["view"], r["part"]) == (v, p)), 4),
                                      "meanError": round(float(np.mean([r["error"] for r in rows if (r["view"], r["part"]) == (v, p)])), 4)}
                         for v, p in sorted({(r["view"], r["part"]) for r in rows})},
              "rows": rows}
    sheets.write_json(out / "blushcal.json", result)
    plot(rows, used, named, floor, out / "blushcal.png")
    print(f"blushcal: {len(rows)} cheeks in {len(views)} views at {len(levels)} levels (reference {reference:g})")
    for key, row in result["byView"].items():
        print(f"  {key}: worst {row['maxAbsError']:.4f}, mean {row['meanError']:+.4f}")
    if below_worst:
        print(f"blushcal: below the resting spread ({floor:g}), reported apart: worst {abs(below_worst['error']):.4f} "
              f"({below_worst['still']} {below_worst['part']}: {below_worst['fitted']} for {below_worst['asked']})")
    print(f"blushcal: worst same-level error from {floor:g} up {abs(worst['error']):.4f} ({worst['still']} {worst['part']}: {worst['fitted']} for {worst['asked']}); "
          f"best different-level error {best['off']:.4f} ({best['still']} {best['part']}: {best['fitted']}, keyed {best['keyed']}, against {best['against']}); "
          f"halfway {halfway:.4f}; facematch.py uses {used:g}, " + ("between them" if between else "NOT between them"))
    print(f"blushcal: written to {out}")
    return 0 if between else 1


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception as error:  # any error is 2, never a verdict
        print(f"blushcal: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(2)
