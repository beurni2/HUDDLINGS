"""Tests for the line check (linematch.py, docs/phase3-fur-plan.md B to E): its
parts on drawn shapes, the sheet's own still passing every region of every
view, the calibration being the sheet's own, and the planted faults each
failing in its own region with every other region's verdict unchanged.

    python3 -m unittest discover -s characters/sheetmatch -p test_linematch.py -v

They need no build: the sheet's still is made from the calibration's region
maps (lines/<species>/<view>.png). The faults only a render's own scale shows
(softness, fur, an absolute width) are planted in a build's stills, when there
are any (build/stills/dog, or HUDDLINGS_LINE_STILLS)."""
import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path

import numpy as np
from scipy import ndimage

import linecal
import lineaccept
import linematch as lm
import lineplants as lp
import match

HERE = Path(__file__).resolve().parent
CALIBRATION = HERE / "lines" / "dog.json"
STILLS = Path(os.environ.get("HUDDLINGS_LINE_STILLS", match.sheets.ROOT / "build" / "stills" / "dog"))
VIEWS = ("front", "threeQuarter.L", "side.L", "back", "threeQuarter.R", "side.R")


def own(region):
    """The regions a fault planted in region may fail in: the region and its lines across."""
    names = (region,) if isinstance(region, str) else region
    return {n for name in names for n in (name, f"{name} {lm.ACROSS}")}


class Shapes(unittest.TestCase):
    """The check's parts on shapes whose answer is known."""

    def test_a_region_is_named_by_its_two_parts_the_card_and_ground_last(self):
        self.assertEqual(lm.pair_name("outside", "ear.R"), "ear.R|outside")
        self.assertEqual(lm.pair_name("ground", "front.L"), "front.L|ground")
        self.assertEqual(lm.pair_name("head.base", "ear.L"), "ear.L|head.base")

    def test_regions_are_bands_round_each_boundary_and_each_parts_inside(self):
        hosts = np.full((60, 60), lm.OUTSIDE, dtype=object)
        hosts[10:50, 10:30] = "a"
        hosts[10:50, 30:50] = "b"
        hosts[25:35, 20:25] = lm.LEFT_OUT  # an eye
        names, boundary, band = lm.regions(hosts)
        for name in ("a|b", "a|outside", "b|outside", "a", "b", lm.LEFT_OUT):
            self.assertIn(name, names)
        # The band runs BAND_PX either way of the a|b boundary, the inside beyond it.
        self.assertEqual(names[band[40, 30 - lm.BAND_PX]], "a|b")
        self.assertEqual(names[band[40, 30 + lm.BAND_PX - 1]], "a|b")
        self.assertEqual(names[band[15, 20]], "a")
        # The face's edge is left out, never given to the region beside it.
        self.assertEqual(names[band[30, 19]], lm.LEFT_OUT)

    def test_a_line_is_a_dark_warm_valley_and_a_cool_one_is_not(self):
        rgb = np.full((40, 80, 3), (255, 245, 230), np.uint8)
        rgb[18:21, 5:35] = (0x81, 0x57, 0x3A)  # the line's brown
        rgb[18:21, 45:75] = (110, 150, 200)  # the collar's blue
        found = lm.line_map(rgb, 8.0, np.ones(rgb.shape[:2], bool))
        self.assertGreater(found["skeleton"][:, :40].sum(), 20)
        self.assertEqual(found["lines"][:, 40:].sum(), 0)

    def test_the_longest_run_in_pt(self):
        mask = np.zeros((20, 40), bool)
        mask[5, 2:12] = True
        mask[10, 5:30] = True
        self.assertAlmostEqual(lm.longest_run(mask, 0.5), 12.0, delta=0.6)

    def test_fur_reads_on_a_scalloped_edge_and_not_on_a_smooth_one_however_round(self):
        t = np.linspace(0, 2 * np.pi, 2000, endpoint=False)
        smooth = np.stack([30 * np.sin(t), 30 * np.cos(t)], 1)
        scallops = smooth * (1 + 0.02 * np.cos(36 * t))[:, None]  # 0.6 pt bumps about 5 pt apart
        calm, furry = lm.fur_stats([smooth]), lm.fur_stats([scallops])
        self.assertLess(calm["rmsPt"], 0.02)
        self.assertEqual(calm["crossings10Pt"], 0)
        self.assertGreater(furry["rmsPt"], 0.3)
        self.assertGreater(furry["crossings10Pt"], 3)

    def test_a_crisp_edge_rises_faster_than_a_soft_one(self):
        alpha = np.zeros((40, 40))
        alpha[:, 20:] = 1
        soft = ndimage.gaussian_filter(alpha, 3 * 0.6)
        points = [(y, 20) for y in range(10, 30)]
        self.assertLess(np.median(lm.rises(alpha, points, 3)), np.median(lm.rises(soft, points, 3)) - 0.5)


class Sheet(unittest.TestCase):
    """The sheet's own still in every view, made once."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.calibration = json.loads(CALIBRATION.read_text())
        cls.results = {}
        for view in VIEWS:
            folder = linecal.sheet_still("dog", view, Path(cls.tmp.name) / view, cls.calibration)
            cls.results[view], _ = lm.check("dog", folder, CALIBRATION, shift=(0, 0), fine=False)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_the_sheet_passes_every_region_of_every_view(self):
        for view, result in self.results.items():
            with self.subTest(view=view):
                self.assertEqual(result["failed"], [], result["summary"])
                self.assertTrue(all(row["calibrated"] for row in result["regions"].values()))

    def test_every_view_is_calibrated_and_every_threshold_is_the_worst_perturbed_score_less_the_margin(self):
        self.assertEqual(self.calibration["perturbations"], [f"{k} {a}" for k, a in linecal.PERTURBATIONS])
        for view in VIEWS:
            rec = self.calibration["views"][view]
            scores = rec["perturbed"]
            rows = [((k, a), {n: {m: (v[m][i] if v[m] else None) for m in v} for n, v in scores.items()})
                    for i, (k, a) in enumerate(linecal.PERTURBATIONS)]
            with self.subTest(view=view):
                self.assertEqual(linecal.thresholds(rows), rec["regions"])

    def test_the_calibration_is_the_sheets_own(self):
        """Two perturbations of one view, measured again now, score what the calibration holds: it is in step with
        linematch.py and the crops (rerun linecal.py when this fails)."""
        view = "front"
        scene = lp.sheet_scene("dog", view, self.calibration, linecal.sheet_parts("dog", view, self.calibration),
                               Path(self.tmp.name) / "fresh")
        held = self.calibration["views"][view]["perturbed"]
        for kind, amount in (linecal.PERTURBATIONS[0], linecal.PERTURBATIONS[8]):
            i = linecal.PERTURBATIONS.index((kind, amount))
            (_, rows), = linecal.perturbed_rows(scene, ((kind, amount),))
            with self.subTest(perturbation=f"{kind} {amount}"):
                for name, measures in held.items():
                    for measure, values in measures.items():
                        self.assertEqual(rows.get(name, {}).get(measure), values[i] if values else None, (name, measure))

    def test_the_result_names_its_calibration_and_is_advisory(self):
        result = self.results["front"]
        self.assertTrue(result["advisory"])
        self.assertEqual(result["calibration"], "characters/sheetmatch/lines/dog.json")
        self.assertIn("lines pass", result["summary"])


class CropPlants(unittest.TestCase):
    """The faults the crop's grid shows, planted in the sheet's own still: each fails in its own region and no other
    region's verdict changes."""

    def test_each_plant_fails_in_its_own_region_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            for key, words, view, region, _ in lp.CROP_PLANTS:
                with self.subTest(plant=key, fault=words):
                    base, after, painted, _, _ = lp.plant_crop("dog", key, CALIBRATION, Path(tmp) / key)
                    self.assertGreater(painted.sum(), 0)
                    self.assertEqual(base["failed"], [])
                    flipped, _ = lp.changed(base, after)
                    self.assertTrue(flipped, f"{words}: no region fails")
                    if region is not None:
                        self.assertTrue(set(flipped) & own(region), f"{words}: {flipped}")
                        self.assertLessEqual(set(flipped), own(region), f"{words}: {flipped}")


@unittest.skipUnless((STILLS / "front" / "still.json").exists(), f"no build's stills at {STILLS}")
class RenderPlants(unittest.TestCase):
    """The faults only a render's own scale shows, planted in a build's front still."""

    def test_each_plant_fails_in_its_own_region_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            for key, words, view, region, _ in lp.RENDER_PLANTS:
                with self.subTest(plant=key, fault=words):
                    base, after, painted, _, _ = lp.plant_render("dog", key, STILLS, CALIBRATION, Path(tmp) / key)
                    self.assertGreater(painted.sum(), 0)
                    new = set(after["regions"][region]["failed"]) - set(base["regions"][region]["failed"])
                    self.assertTrue(new, f"{words}: {region} fails nothing new")
                    flipped, _ = lp.changed(base, after)
                    self.assertLessEqual(set(flipped), own(region), f"{words}: {flipped}")


class Cli(unittest.TestCase):

    def test_exits_2_and_writes_no_verdict_on_an_error_and_1_with_both_files_on_a_failing_region(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "out"
            out.mkdir()
            (out / "lines.json").write_text("{}")
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(lm.main(["dog", "--still", str(Path(tmp) / "missing"), "--out", str(out)]), 2)
            self.assertFalse((out / "lines.json").exists())
            base, after, _, _, _ = lp.plant_crop("dog", "sheet-a", CALIBRATION, Path(tmp) / "plant")
            with contextlib.redirect_stdout(io.StringIO()):
                code = lm.main(["dog", "--still", str(Path(tmp) / "plant" / "planted"), "--out", str(out)])
            self.assertEqual(code, 1)
            self.assertFalse(json.loads((out / "lines.json").read_text())["pass"])
            self.assertTrue((out / "lines.png").exists())

    def test_acceptance_reads_each_defects_regions(self):
        with tempfile.TemporaryDirectory() as tmp:
            measures = {"gapPt": {"value": 10.6, "threshold": 1.5}}
            for view in {d[0] for d in lineaccept.DEFECTS}:
                regions = {"ear.L|head.base": {"pass": view != "front", "failed": [] if view != "front" else ["gapPt"], "measures": measures}}
                (Path(tmp) / view).mkdir()
                (Path(tmp) / view / "lines.json").write_text(json.dumps({"regions": regions}))
            rows = lineaccept.accept(tmp)
            caught = {(r["view"], r["defect"]) for r in rows if r["caught"]}
            self.assertEqual(caught, {("front", "#2")})


if __name__ == "__main__":
    unittest.main()
