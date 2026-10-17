"""Tests for the line check (linematch.py, docs/phase3-fur-plan.md B to E): its
parts on drawn shapes, the sheet's own still passing every region of every
view and copies of it the calibration never saw passing too, the calibration
being the sheet's own, and the planted faults each failing in its own region
with every other region's verdict unchanged.

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
import lineheld
import linematch as lm
import lineplants as lp
import match

HERE = Path(__file__).resolve().parent
CALIBRATION = HERE / "lines" / "dog.json"
STILLS = Path(os.environ.get("HUDDLINGS_LINE_STILLS", match.sheets.ROOT / "build" / "stills" / "dog"))
VIEWS = ("front", "threeQuarter.L", "side.L", "back", "threeQuarter.R", "side.R")
# What a still equal to its crop measures: every line found, matched and as dark, nothing extra, no seam.
IDEAL = {"recall": 1.0, "precision": 1.0, "gapPt": 0.0, "weakPt": 0.0, "extraPt": 0.0, "toneDelta": 0.0, "inkLog": 0.0,
         "regionInkLog": 0.0, "hardSeamPt": 0.0, "lightSeamPt": 0.0}


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

    def test_a_crisp_edge_over_a_soft_shadow_rises_crisp(self):
        """The ground shadow's haze lies outside its own ID and grows away from the paw: the paw's crisp edge over it
        rises from the haze at the edge, as crisp as over the card (the review's hind paw, read soft before)."""
        alpha = np.zeros((60, 60))
        alpha[:, 30:] = 1
        haze = np.clip(0.06 + 0.04 * (30 - np.arange(60)) / 5, 0, 0.3)[None, :] * np.ones((60, 1))
        over = np.where(alpha > 0, 1, haze)
        points = [(y, 29.5) for y in range(10, 50)]
        crisp = np.median(lm.rises(alpha, points, 3))
        self.assertAlmostEqual(np.median(lm.rises(over, points, 3)), crisp, delta=0.05)
        self.assertLess(crisp, linecal.crisp()["thresholdPt"])

    def test_the_width_reads_a_line_of_known_width_at_the_heros_scale(self):
        """A line drawn 1 to 2 pt wide, sampled as the render is for its widths (at the hero's px per pt): the median
        width reads within 5%, the lower quartile within 8% (the review: the 1.75 pt plant read 1.59)."""
        ppp = json.loads(CALIBRATION.read_text())["panels"]["widthPpp"]
        sub = 8
        for width_pt in (1.0, 1.5, 1.75, 2.0):
            with self.subTest(width_pt=width_pt):
                n = int(40 * ppp)
                y = (np.arange(n * sub) + 0.5) / sub / ppp
                yy, xx = np.meshgrid(y, y, indexing="ij")
                ink = (np.abs(yy - (20 + 2 * np.sin(xx / 7))) <= width_pt / 2).astype(float).reshape(n, sub, n, sub).mean(axis=(1, 3))
                rgb = np.round(np.array((255, 245, 230)) * (1 - ink[..., None]) + np.array((0x81, 0x57, 0x3A)) * ink[..., None]).astype(np.uint8)
                lines = lm.line_map(rgb, 8.0, np.ones(rgb.shape[:2], bool), radius=lm.FINE_TOPHAT_PT * ppp)
                band = np.full(rgb.shape[:2], -1)
                band[:, 6:-6] = 0
                stats = lm.width_stats(lines, band, ["x|edge"], ppp)["x|edge"]
                self.assertAlmostEqual(stats["widthMedianPt"], width_pt, delta=0.05 * width_pt)
                self.assertAlmostEqual(stats["widthPt"], width_pt, delta=0.08 * width_pt)

    def test_the_tone_along_a_line_reads_how_far_it_lightens_and_darkens_along_itself(self):
        """The advisory tone along the line (dog DECISIONS 284): a line one tone all along reads no spread; one that runs
        from L* 45 to 80 along itself reads most of it, its pixel noise under 1.5 pt smoothed away; neither its width
        nor how many pixels it has moves it."""
        def line(tones, width_px=3, length=120):
            rgb = np.full((40, length + 20, 3), (255, 245, 230), np.uint8)
            for x in range(length):
                t = tones(x / (length - 1))
                rgb[20 - width_px // 2:20 - width_px // 2 + width_px, 10 + x] = lm_rgb(t)
            return rgb

        def lm_rgb(L):
            """A warm brown at lightness L* (the line ladder's hue, a* 14, b* 25), in sRGB."""
            fy = (L + 16) / 116
            fx, fz = fy + 14 / 500, fy - 25 / 200
            inv = lambda t: t ** 3 if t ** 3 > 0.008856 else (t - 16 / 116) / 7.787  # noqa: E731
            X, Y, Z = 0.95047 * inv(fx), inv(fy), 1.08883 * inv(fz)
            rgb = (3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z, -0.969266 * X + 1.8760108 * Y + 0.041556 * Z, 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z)
            return tuple(int(round(255 * min(1, max(0, 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055)))) for c in rgb)

        def read(rgb):
            lines = lm.line_map(rgb, 8.0, np.ones(rgb.shape[:2], bool))
            pts = np.argwhere(lines["plain"])
            return lm.tone_along(lm.tone_map(lines)[tuple(pts.T)], pts, 0.5)

        even, ramp = read(line(lambda u: 50)), read(line(lambda u: 45 + 35 * u))
        self.assertLess(even["spreadL"], 1.0)
        self.assertLess(even["sdL"], 0.5)
        self.assertGreater(ramp["spreadL"], 15)
        self.assertGreater(ramp["sdL"], 5)
        self.assertGreater(read(line(lambda u: 45 + 35 * u, width_px=4))["spreadL"], 15)
        self.assertIsNone(lm.tone_along(np.array([50.0, 51.0]), np.array([[0, 0], [0, 1]]), 0.5))

    def test_a_long_break_outranks_a_few_scattered_pixels_when_the_worst_is_named(self):
        """The review: the front's headline was 19 px of fur strokes in six pieces read as recall 0."""
        scattered = {"measures": {"recall": {"value": 0.0, "threshold": 0.9}, "gapPt": {"value": 3.9, "threshold": 1.9}}, "failed": ["recall"]}
        broken = {"measures": {"gapPt": {"value": 10.6, "threshold": 1.9}}, "failed": ["gapPt"]}
        self.assertEqual(lm.worst({"head.base": scattered, "ear.L|head.base": broken})["region"], "ear.L|head.base")

    def test_the_shift_is_chosen_on_the_lines_round_a_piece_not_on_what_it_leaves_in_it(self):
        """A shift that moves an image's lines out of the region, or into a region the other leaves empty, never wins
        (the review: an empty side scored 0 and chose a shift)."""
        line = np.zeros((40, 40), bool)
        line[10:30, 20] = True
        near = ndimage.distance_transform_edt(~line)
        pts = np.argwhere(line)
        self.assertEqual(lm.region_shift(pts, pts, near, near), (0, 0))
        self.assertEqual(lm.region_shift(pts[:0], pts, near, near), (0, 0))
        moved = np.zeros_like(line)
        moved[10:30, 22] = True
        # Ours drawn 2 px right of the sheet: ours' q lies beside the sheet's q + d, d = (-2, 0).
        self.assertEqual(lm.region_shift(pts, np.argwhere(moved), near, ndimage.distance_transform_edt(~moved)), (-2, 0))


class Sheet(unittest.TestCase):
    """The sheet's own still in every view, made once."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.calibration = json.loads(CALIBRATION.read_text())
        cls.results, cls.parts = {}, {}
        for view in VIEWS:
            folder = linecal.sheet_still("dog", view, Path(cls.tmp.name) / view, cls.calibration)
            cls.results[view], cls.parts[view] = lm.check("dog", folder, CALIBRATION, shift=(0, 0), fine=False)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_the_sheet_passes_every_region_of_every_view(self):
        for view, result in self.results.items():
            with self.subTest(view=view):
                self.assertEqual(result["failed"], [], result["summary"])
                self.assertTrue(all(row["calibrated"] for row in result["regions"].values()))
                self.assertEqual(result["uncalibrated"], [])
                self.assertEqual(result["regionsMoved"], 0.0)

    def test_the_sheet_against_itself_measures_ideal_in_every_region(self):
        """Every shift 0 and every measure its ideal: the review found ink 0.3 on the identity still, a shift chosen
        for an empty side."""
        for view, (result, parts) in ((v, (self.results[v], self.parts[v])) for v in VIEWS):
            for name, row in parts["rows"].items():
                with self.subTest(view=view, region=name):
                    self.assertTrue(all(d == [0, 0] for d in row.get("piecesShiftPx", [row["shiftPx"]])))
                    for measure, ideal in IDEAL.items():
                        if row.get(measure) is not None:
                            self.assertEqual(row[measure], ideal, measure)

    def test_every_threshold_is_the_tail_worst_10_percent_looser_never_under_its_floor(self):
        self.assertEqual(self.calibration["perturbations"], [linecal.label(s) for s in linecal.PERTURBATIONS])
        tail = self.calibration["tail"]
        for view in VIEWS:
            floors = linecal.floors(self.calibration["views"][view]["kPt"])
            for name, region in self.calibration["views"][view]["regions"].items():
                for measure, rec in region.items():
                    if rec.get("threshold") is None:
                        continue
                    with self.subTest(view=view, region=name, measure=measure):
                        share = lm.MEASURES[measure][0] > 0 and measure not in lm.TWO_SIDED
                        turn = (lambda v: 1 - v) if share else (lambda v: v)
                        m = max(tail["least"], int(round(rec["draws"] * tail["share"])))
                        u, worst = turn(rec["tailFrom"]), turn(rec["worst"])
                        expected = max(worst, u + rec["tailExcess"] * np.log(m * tail["draws"] / rec["draws"]))
                        expected = (1 - expected) * (1 - lm.MARGIN) if share else max(expected * (1 + lm.MARGIN), floors.get(measure, 0))
                        self.assertAlmostEqual(rec["threshold"], expected, delta=2e-3)

    def test_the_calibration_is_the_sheets_own(self):
        """Two of the plan's perturbations of one view, measured again now, score what the calibration holds: it is in
        step with linematch.py and the crops (rerun linecal.py when this fails)."""
        view = "front"
        scene = lp.sheet_scene("dog", view, self.calibration, linecal.sheet_parts("dog", view, self.calibration), Path(self.tmp.name) / "fresh")
        held = self.calibration["views"][view]["checkedScores"]
        self.assertEqual(self.calibration["checked"], [linecal.label(linecal.PERTURBATIONS[i]) for i in linecal.CHECKED])
        for j, i in enumerate(linecal.CHECKED):
            spec = linecal.PERTURBATIONS[i]
            (_, rows), = linecal.perturbed_rows(scene, (spec,))
            with self.subTest(perturbation=linecal.label(spec)):
                for name, measures in held.items():
                    for measure, values in measures.items():
                        self.assertEqual(rows.get(name, {}).get(measure), values[j], (name, measure))

    def test_copies_of_the_sheet_the_calibration_never_saw_pass_in_every_region(self):
        """The plan's E: held-out draws of the plan's kinds and sizes in combination (another seed), and the plan's
        JPEG 70 over each of its other kinds, judged in every view (lineheld.py runs more)."""
        result = lineheld.check("dog", CALIBRATION, linecal.draws(linecal.HELD_OUT_SEED, 3) + lineheld.COMBINATIONS)
        for view, rows in result.items():
            for row in rows:
                with self.subTest(view=view, perturbation=row["perturbation"]):
                    self.assertEqual(row["failed"], {})

    def test_the_result_names_its_calibration_and_is_advisory(self):
        result = self.results["front"]
        self.assertTrue(result["advisory"])
        self.assertEqual(result["calibration"], "characters/sheetmatch/lines/dog.json")
        self.assertIn("lines pass", result["summary"])

    def test_a_region_the_calibration_lacks_is_held_to_its_views_median_and_said(self):
        scene = self.parts["front"]["scene"]
        rows = dict(self.parts["front"]["rows"])
        rows["new.part|outside"] = dict(rows["ear.L|outside"])
        held = lm.thresholds_for(scene, ["new.part|outside"], self.calibration)["new.part|outside"]
        view = self.calibration["views"]["front"]["regions"]
        median = float(np.median([r["gapPt"]["threshold"] for r in view.values() if r["gapPt"]["threshold"] is not None]))
        self.assertFalse(held["calibrated"])
        self.assertAlmostEqual(held["thresholds"]["gapPt"], median, delta=1e-3)
        result = {**self.results["front"], "uncalibrated": ["new.part|outside"], "regionsMoved": 0.05}
        line = lm.summary(result)
        self.assertIn("1 regions uncalibrated", line)
        self.assertIn("rerun linecal.py", line)
        self.assertIn("5%", line)

    def test_the_tone_along_the_line_is_reported_never_judged_and_reads_the_sheet_against_itself_alike(self):
        """The advisory tone along the line (dog DECISIONS 284): in every view, each region the sheet lines carries it,
        the sheet's and ours alike on the sheet's own still, and it is no measure the check judges."""
        self.assertFalse(set(lm.ADVISORY) & set(lm.MEASURES))
        for view, result in self.results.items():
            with self.subTest(view=view):
                read = [row["advisory"]["toneAlong"] for row in result["regions"].values() if (row.get("advisory", {}).get("toneAlong") or {}).get("sheet")]
                self.assertGreater(len(read), 10)
                for t in read:
                    self.assertEqual(t["sheet"], t["ours"])
                    self.assertGreaterEqual(t["sheet"]["spreadL"], 0)
                self.assertEqual(result["failed"], [])


class CropPlants(unittest.TestCase):
    """The faults the crop's grid shows, planted in the sheet's own still: each fails in its own region and no other
    region's verdict changes."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.calibration = json.loads(CALIBRATION.read_text())
        cls.judges = {}

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def judge(self, view):
        if view not in self.judges:
            self.judges[view] = lp.SheetJudge("dog", view, self.calibration, Path(self.tmp.name) / view)
        return self.judges[view]

    def test_each_plant_fails_in_its_own_region_only(self):
        for key, words, view, region, plant in lp.CROP_PLANTS:
            if region == lp.JOINTS:
                continue
            with self.subTest(plant=key, fault=words):
                judge = self.judge(view)
                base = judge.judge()
                self.assertTrue(all(row["pass"] for row in base.values()))
                after, painted = judge.plant(plant)
                self.assertGreater(painted.sum(), 0)
                flipped = {n for n in after if not after[n]["pass"]}
                self.assertTrue(flipped & own(region), f"{words}: {sorted(flipped)}")
                self.assertLessEqual(flipped, own(region), f"{words}: {sorted(flipped)}")

    def test_tapers_fail_every_region_with_a_joint(self):
        """The plan's 8 pt tapers at every span's joint (D2) fail in every region a joint falls in, the leg edges among
        them (the review: five of them passed), and in no part's inside."""
        judge = self.judge("front")
        _, joints = lp.taper_joints(judge.scene, judge.sheet)
        after, _ = judge.plant(lp.tapers)
        self.assertGreater(len(joints), 10)
        for name in joints:
            with self.subTest(region=name):
                self.assertFalse(after[name]["pass"] and after.get(f"{name} {lm.ACROSS}", {"pass": True})["pass"], after[name]["measures"])
        self.assertEqual([n for n in after if "|" not in n and not after[n]["pass"]], [])

    def test_a_pale_contact_line_fails_on_every_right_facing_contact_edge(self):
        """Plant 11 on every contact edge of threeQuarter.R and side.R whose own line the sheet draws (the review:
        planted on one chosen edge, it passed on others): each fails in its own region; one whose line lies clear of
        its neighbours changes no other region's verdict."""
        rows = lp.pale_everywhere("dog", CALIBRATION)
        self.assertGreaterEqual(len(rows), 12)
        for row in rows:
            with self.subTest(view=row["view"], region=row["region"]):
                self.assertTrue(row["failing"], row)
                if not row["short"]:
                    self.assertEqual(row["elsewhere"], [], row)


@unittest.skipUnless((STILLS / "front" / "still.json").exists(), f"no build's stills at {STILLS}")
class RenderPlants(unittest.TestCase):
    """The faults only a render's own scale shows, planted in a build's front still."""

    def test_each_plant_fails_in_its_own_region_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            for key, words, view, region, _ in lp.RENDER_PLANTS:
                with self.subTest(plant=key, fault=words):
                    base, after, painted, _, _ = lp.plant_render("dog", key, STILLS, CALIBRATION, Path(tmp) / key)
                    self.assertGreater(painted.sum(), 0)
                    new = {(n, m) for n in own(region) if n in after["regions"]
                           for m in set(after["regions"][n]["failed"]) - set(base["regions"].get(n, {"failed": []})["failed"])}
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
            lp.plant_crop("dog", "sheet-a", CALIBRATION, Path(tmp) / "plant")
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
