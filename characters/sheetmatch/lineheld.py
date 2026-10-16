"""The line check against copies of the sheet the calibration never saw
(docs/phase3-fur-plan.md, E: the sheet against its perturbed self passes in
every region): draws of the plan's kinds and sizes in combination from another
seed (linecal.HELD_OUT_SEED), the plan's JPEG 70 laid over each of its other
kinds, and the sizes the earlier calibration held out, each judged by
linematch.judge against the committed calibration on the sheet's own still in
every view.

    python3 characters/sheetmatch/lineheld.py dog [--draws N] [--seed S] [--out <json>]

Prints each view's runs and any region that fails, and writes <json> (every run
and its failures). Exits 0 when every run passes in every region, 1 when one
fails, 2 on any error. About a second a run, four views at a time."""
import argparse
import json
import sys
import tempfile
import traceback
from multiprocessing import Pool
from pathlib import Path

import linecal
import linematch as lm
import lineplants as lp
import match

sheets = match.sheets
VIEWS = ("front", "threeQuarter.L", "side.L", "back", "threeQuarter.R", "side.R")
# The plan's JPEG 70 over each of its other kinds at their extremes (the review's combinations), and the sizes held
# out of the first calibration (between those it drew).
COMBINATIONS = tuple({**spec, "jpeg": 70} for spec in linecal.PLAN_PERTURBATIONS if "jpeg" not in spec)
BETWEEN = ({"move": (0, 0, 1.015, 0)}, {"move": (0, 0, 0.985, 0)}, {"move": (0, 0, 1, 0.75)}, {"move": (0, 0, 1, -0.25)},
           {"jpeg": 75}, {"jpeg": 85}, {"blur": 0.4}, {"move": (0.33, 0.67, 1, 0)}, {"move": (0.67, 0, 1, 0)})


def held_out(draws, seed=linecal.HELD_OUT_SEED):
    """The held-out perturbations: draws from the held-out seed, then the combinations and the sizes between."""
    return linecal.draws(seed, draws) + COMBINATIONS + BETWEEN


def run_view(args):
    """One view's held-out runs: [(perturbation, {region: {measure: [value, threshold]}})] for those that fail."""
    species, view, calibration_path, perturbations = args
    calibration = json.loads(Path(calibration_path).read_text())
    with tempfile.TemporaryDirectory() as tmp:
        scene = lp.sheet_scene(species, view, calibration, linecal.sheet_parts(species, view, calibration), Path(tmp) / view)
        rows = []
        for spec, measured in linecal.perturbed_rows(scene, perturbations):
            moved = scene if "move" not in spec else linecal.perturbed(scene, spec)[1]
            verdict = lm.judge(moved, measured, {}, calibration)
            failed = {name: {m: [row["measures"][m]["value"], row["measures"][m]["threshold"]] for m in row["failed"]}
                      for name, row in verdict.items() if row["failed"]}
            rows.append({"perturbation": linecal.label(spec), "regions": len(verdict), "failed": failed})
    return view, rows


def check(species, calibration_path, perturbations, views=VIEWS, workers=4):
    jobs = [(species, view, str(calibration_path), perturbations) for view in views]
    with Pool(min(workers, len(jobs))) as pool:
        return dict(pool.map(run_view, jobs))


def main(argv):
    parser = argparse.ArgumentParser(usage=__doc__)
    parser.add_argument("species")
    parser.add_argument("--draws", type=int, default=24)
    parser.add_argument("--seed", type=int, default=linecal.HELD_OUT_SEED)
    parser.add_argument("--calibration")
    parser.add_argument("--out")
    args = parser.parse_args(argv)
    calibration = Path(args.calibration or Path(__file__).resolve().parent / "lines" / f"{args.species}.json")
    try:
        result = check(args.species, calibration, held_out(args.draws, args.seed))
    except Exception as error:
        traceback.print_exc()
        print(f"lineheld: {type(error).__name__}: {error}", file=sys.stderr)
        return 2
    runs = [row for rows in result.values() for row in rows]
    failing = [row for row in runs if row["failed"]]
    for view, rows in result.items():
        bad = [row for row in rows if row["failed"]]
        print(f"{view:15s} {len(rows)} runs, {len(bad)} failing" + "".join(f"\n    {row['perturbation']}: {row['failed']}" for row in bad))
    print(f"lineheld: {len(failing)} of {len(runs)} held-out runs fail a region")
    if args.out:
        sheets.write_json(Path(args.out), {"note": "lineheld.py: the sheet's own still against held-out perturbed copies, judged by the committed calibration",
                                           "calibration": match.repo_path(calibration), "draws": args.draws, "seed": args.seed,
                                           "runs": len(runs), "failing": len(failing), "views": result})
    return 1 if failing else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
