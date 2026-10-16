"""Tests for the blush tolerance's calibration (blushcal.py): the views and levels
it keys, the calibration package it writes, and the two ends it reads off the
fitted cheeks. Rendering and fitting are the Faces check's own (still.ts,
facematch.check_blush), tested there; the measured ends are in DECISIONS.md 190.

    python3 -m unittest discover -s characters/sheetmatch -p test_blushcal.py -v"""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import blushcal
import facematch
import test_facematch

sheets = blushcal.sheets
MODEL = test_facematch.MODEL
PRESETS = test_facematch.PRESETS
# What blushcal.py measured on the dog with its blush drawn at the reference level (DECISIONS.md 190): the fit's worst
# error from the resting spread's low end up, and the nearest a cheek keyed at one named level came to another.
MEASURED_WORST_SAME, MEASURED_BEST_DIFFERENT = 0.011, 0.096


class LevelsTest(unittest.TestCase):
    def test_the_views_are_those_the_rig_draws_a_blush_in(self):
        rig = json.loads((sheets.ROOT / "characters/dog/src/rig.json").read_text())
        views = blushcal.blush_views(rig)
        self.assertEqual(views["front"], ["blush.L", "blush.R"])
        for view, parts in views.items():
            self.assertNotEqual(view, "back")
            if view != "front":
                # A turned head blushes on its near cheek only, as phase 2 found the sheet's.
                self.assertEqual(parts, [f"blush.{view[-1]}"], view)

    def test_the_sweep_runs_to_the_reference_and_takes_every_named_level(self):
        named = blushcal.named_levels(PRESETS, MODEL)
        self.assertEqual(named, [MODEL["blush"]["restingLevel"], 0.7, 0.8])
        levels = blushcal.sweep(0.95, named)
        self.assertEqual(levels[0], blushcal.STEP)
        self.assertEqual(levels[-1], 0.95)
        self.assertTrue(set(named) <= set(levels))
        self.assertTrue(all(round(level / 0.95, 3) <= 1 for level in levels))

    def test_the_calibration_package_keys_each_view_and_level_as_the_face_clips_do(self):
        with tempfile.TemporaryDirectory() as tmp:
            package = Path(tmp) / "built"
            (package / "clips").mkdir(parents=True)
            (package / "clips" / "still_front.json").write_text("{}\n")
            (package / "package.json").write_text(json.dumps({"files": {"clips/still_front.json": "x"}}))
            clips = blushcal.calibration_package(package, Path(tmp) / "cal", 0.95, {"front": ["blush.L", "blush.R"], "side.L": ["blush.L"]}, [0.35, 0.8])
            self.assertEqual([c[0] for c in clips], ["blushcal_front_0350", "blushcal_front_0800", "blushcal_side.L_0350", "blushcal_side.L_0800"])
            manifest = json.loads((Path(tmp) / "cal" / "package.json").read_text())
            self.assertIn("clips/still_front.json", manifest["files"])
            for name, view, level, alpha in clips:
                text = (Path(tmp) / "cal" / "clips" / f"{name}.json").read_bytes()
                self.assertEqual(manifest["files"][f"clips/{name}.json"], hashlib.sha256(text).hexdigest())
                clip = json.loads(text)
                self.assertEqual(clip["views"], {"body": [[0, view]], "head": [[0, view]]})
                # faceClips.ts blushAlpha: the level over the reference, to three places.
                self.assertEqual(alpha, round(level / 0.95, 3))
                self.assertEqual(set(clip["alpha"]), {"blush.L", "blush.R"} if view == "front" else {"blush.L"})
            self.assertFalse((package / "clips" / "blushcal_front_0350.json").exists(), "the built package is left as it was")


class EndsTest(unittest.TestCase):
    def rows(self, cheeks):
        return [{"still": f"s{i}", "part": "blush.L", "asked": asked, "fitted": fitted, "error": round(fitted - asked, 4)}
                for i, (asked, fitted) in enumerate(cheeks)]

    def test_the_worst_same_level_error_is_taken_from_the_resting_spread_up(self):
        rows = self.rows([(0.2, 0.263), (0.3, 0.289), (0.7, 0.698), (0.8, 0.806)])
        worst, best = blushcal.ends(rows, [0.35, 0.7, 0.8], 0.29)
        self.assertEqual((worst["asked"], worst["error"]), (0.3, -0.011))
        # Keyed at 0.8 and read 0.806, it lies 0.106 from 0.7; keyed at 0.7, 0.102 from 0.8: the least is the best.
        self.assertEqual((best["keyed"], best["against"], best["off"]), (0.7, 0.8, 0.102))

    def test_the_tolerance_lies_between_the_measured_ends(self):
        # As blushcal.py measured them (DECISIONS.md 190), and within half the gap between two named levels, so a cheek
        # read exactly at one never passes as its neighbour.
        tolerance = facematch.BLUSH_LEVEL_TOLERANCE
        self.assertLess(MEASURED_WORST_SAME, tolerance)
        self.assertLess(tolerance, MEASURED_BEST_DIFFERENT)
        named = blushcal.named_levels(PRESETS, MODEL)
        self.assertLessEqual(tolerance, min(b - a for a, b in zip(named, named[1:])) / 2 + 1e-9)


if __name__ == "__main__":
    unittest.main()
