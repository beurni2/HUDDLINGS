"""Tests for the parity check: it scores the character, not the background, and
fails a missing part (strong, faint or only in coverage), a missing run or frame,
an empty frame and a size change; its evidence shows the frames it names. A soft
part's level, which neither the score nor a patch sees, is fitted in both frames:
a resting blush missing, or drawn at twice its level, fails; a fraction of a pixel
does not."""
import contextlib
import io
import json
import tempfile
import unittest
import unittest.mock
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import parity

# A plain-shapes character on a white frame, like the test character: (shape, part, box in a 100-unit frame, fill).
PARTS = [
    # The ground shadow: 18% black, no outline, like the test character's.
    ("ellipse", "shadow", (28, 79, 72, 87), (209, 209, 209)),
    ("ellipse", "body", (34, 52, 66, 80), (255, 244, 232)),
    ("ellipse", "head", (36, 22, 64, 50), (255, 244, 232)),
    ("ellipse", "ear", (32, 24, 40, 40), (150, 100, 70)),
    ("ellipse", "eye", (44, 32, 48, 36), (40, 30, 30)),
    ("ellipse", "tag", (48, 52, 53, 57), (240, 190, 50)),
    ("ellipse", "paw", (40, 76, 48, 82), (255, 244, 232)),
]


def character(size, leave_out=(), dx=0.0):
    """Draws the character antialiased (4x supersampled), optionally without some parts or shifted by dx frame pixels."""
    k = 4
    image = Image.new("RGB", (size * k, size * k), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    unit = size * k / 100
    for shape, part, (x0, y0, x1, y1), fill in PARTS:
        if part in leave_out:
            continue
        box = [x0 * unit + dx * k, y0 * unit, x1 * unit + dx * k, y1 * unit]
        outline = None if part == "shadow" else (110, 75, 55)
        draw.ellipse(box, fill=fill, outline=outline, width=max(1, round(unit * 0.8)))
    return image.resize((size, size), Image.LANCZOS)


class Parity(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def render(self, side, run, size=200, count=3, **options):
        folder = self.root / side / run / "frames"
        folder.mkdir(parents=True, exist_ok=True)
        for i in range(count):
            character(size, **options).save(folder / f"f{i:04d}.png")
        return folder

    def both(self, spritekit=None, count=3):
        """Renders full (200 px) and small (160 px, as the real small run) on both sides; spritekit maps a run to the options that differ."""
        for run, size in (("full", 200), ("small", 160)):
            self.render("web", run, size, count)
            self.render("spritekit", run, size, count, **(spritekit or {}).get(run, {}))

    def check(self):
        with contextlib.redirect_stdout(io.StringIO()) as printed:
            code = parity.main(self.root / "web", self.root / "spritekit", self.root / "report")
        report = json.loads((self.root / "report" / "report.json").read_text())
        return code, report, printed.getvalue()

    def test_the_same_frames_pass(self):
        self.both()
        code, report, printed = self.check()
        self.assertEqual(0, code, printed)
        self.assertEqual(1.0, report["runs"]["full"]["min"])
        self.assertIn("parity: green", printed)

    def test_edge_softening_passes(self):
        # Antialiasing that differs by a fraction of a pixel, as two GPUs give.
        self.both(spritekit={"full": {"dx": 0.25}, "small": {"dx": 0.25}})
        code, report, printed = self.check()
        self.assertEqual(0, code, printed)
        self.assertGreater(report["runs"]["full"]["min"], parity.THRESHOLD)

    def test_the_background_cannot_dilute_a_difference(self):
        # On a large frame the empty background makes whole-frame SSIM pass a missing ear; on the character it fails.
        self.render("web", "full", size=400)
        self.render("spritekit", "full", size=400, leave_out=("ear",))
        self.render("web", "small", size=160)
        self.render("spritekit", "small", size=160)
        a = parity.load(self.root / "web/full/frames/f0000.png")
        b = parity.load(self.root / "spritekit/full/frames/f0000.png")
        whole = parity.structural_similarity(a, b, channel_axis=2, data_range=255)
        self.assertGreater(whole, parity.THRESHOLD, "the planted failure should fool a whole-frame score")
        code, report, printed = self.check()
        self.assertEqual(1, code)
        self.assertLess(report["runs"]["full"]["min"], parity.THRESHOLD, printed)

    def test_a_missing_small_part_fails_although_the_score_passes(self):
        self.both(spritekit={"full": {"leave_out": ("tag",)}})
        code, report, printed = self.check()
        self.assertEqual(1, code)
        self.assertGreater(report["runs"]["full"]["min"], parity.THRESHOLD, "the patch check, not SSIM, should catch the tag")
        self.assertTrue(any("full/f0000.png: the runtimes disagree" in p for p in report["problems"]), printed)
        # The patch found is where the tag is drawn: (48..53, 52..57) units of 2 px.
        kind, (x0, y0, x1, y1) = report["runs"]["full"]["worst"][0]["patches"][0]
        self.assertEqual("strong", kind)
        self.assertTrue(94 <= x0 and x1 <= 108 and 102 <= y0 and y1 <= 116, (x0, y0, x1, y1))

    def test_a_missing_eye_fails_on_the_small_run(self):
        self.both(spritekit={"small": {"leave_out": ("eye",)}})
        code, report, printed = self.check()
        self.assertEqual(1, code, printed)
        self.assertTrue(any(p.startswith("small/") for p in report["problems"]), report["problems"])

    def test_a_missing_run_fails(self):
        self.render("web", "full")
        self.render("web", "small", size=160)
        self.render("spritekit", "full")
        code, report, _ = self.check()
        self.assertEqual(1, code)
        self.assertIn("small: the SpriteKit render has no small run", report["problems"])

    def test_no_runs_at_all_fail(self):
        (self.root / "web").mkdir()
        (self.root / "spritekit").mkdir()
        code, report, _ = self.check()
        self.assertEqual(1, code)
        self.assertEqual(4, sum("has no" in p for p in report["problems"]))

    def test_an_unexpected_run_fails(self):
        self.both()
        self.render("spritekit", "other")
        code, report, _ = self.check()
        self.assertEqual(1, code)
        self.assertTrue(any("unexpected SpriteKit run" in p for p in report["problems"]))

    def test_a_missing_or_extra_frame_fails(self):
        self.both()
        (self.root / "spritekit/full/frames/f0002.png").unlink()
        character(160).save(self.root / "spritekit/small/frames/f0009.png")
        code, report, _ = self.check()
        self.assertEqual(1, code)
        self.assertIn("full/f0002.png: no SpriteKit frame", report["problems"])
        self.assertIn("small/f0009.png: no web frame", report["problems"])

    def test_stills_are_matched_by_name(self):
        # The dog's parity: one still per clip in each run folder, as render.ts --stills and the SpriteKit test write
        # them. Each is scored against its namesake; one missing on a side fails by name.
        for side in ("web", "spritekit"):
            for run, size in (("full", 200), ("small", 160)):
                folder = self.root / side / run
                folder.mkdir(parents=True)
                for name in ("still_front", "face_shy"):
                    character(size).save(folder / f"{name}.png")
        code, report, printed = self.check()
        self.assertEqual(0, code, printed)
        self.assertEqual(2, report["runs"]["full"]["frames"])
        character(200, leave_out=("eye",)).save(self.root / "spritekit/full/face_shy.png")
        (self.root / "spritekit/small/still_front.png").unlink()
        code, report, _ = self.check()
        self.assertEqual(1, code)
        self.assertIn("small/still_front.png: no SpriteKit frame", report["problems"])
        self.assertTrue(any(p.startswith("full/face_shy.png: the runtimes disagree") for p in report["problems"]), report["problems"])
        self.assertFalse(any(p.startswith("full/still_front.png") for p in report["problems"]))

    def test_a_run_without_frames_fails(self):
        self.both()
        for png in (self.root / "spritekit/small/frames").glob("*.png"):
            png.unlink()
        code, report, _ = self.check()
        self.assertEqual(1, code)
        self.assertIn("small: no SpriteKit frames", report["problems"])

    def test_an_empty_frame_fails_even_when_both_are_empty(self):
        self.both()
        for side in ("web", "spritekit"):
            Image.new("RGB", (200, 200), (255, 255, 255)).save(self.root / side / "full/frames/f0001.png")
        code, report, _ = self.check()
        self.assertEqual(1, code)
        self.assertIn("full/f0001.png: the web frame shows no character", report["problems"])
        self.assertIn("full/f0001.png: the SpriteKit frame shows no character", report["problems"])

    def test_a_size_change_fails(self):
        self.both()
        character(100).save(self.root / "spritekit/full/frames/f0000.png")
        code, report, _ = self.check()
        self.assertEqual(1, code)
        self.assertTrue(any("sizes differ" in p for p in report["problems"]))

    def test_a_missing_faint_shadow_fails_at_both_sizes(self):
        # Never more than 46 from white, so only the coverage check can see it go.
        self.both(spritekit={"full": {"leave_out": ("shadow",)}, "small": {"leave_out": ("shadow",)}})
        code, report, printed = self.check()
        self.assertEqual(1, code)
        for run in ("full", "small"):
            kinds = {kind for frame in report["runs"][run]["worst"] for kind, _ in frame["patches"]}
            self.assertIn("coverage", kinds, (run, printed))

    def test_the_evidence_and_the_worst_frames_are_the_frames_they_name(self):
        # Nine frames; SpriteKit's sit a quarter pixel off (whole pixels at 4x, so they really differ), frame 5 a whole pixel.
        for run, size in (("full", 200), ("small", 160)):
            web = self.render("web", run, size, count=9)
            sk = self.root / "spritekit" / run / "frames"
            sk.mkdir(parents=True)
            for i in range(9):
                character(size, dx=1.0 if i == 5 else 0.25).save(sk / f"f{i:04d}.png")
        with unittest.mock.patch.dict("os.environ", {"PARITY_PRINT_EVIDENCE": "1"}):
            _, report, printed = self.check()
        self.assertIn("PARITY-EVIDENCE-BEGIN small", printed)
        picks = report["runs"]["full"]["evidence frames"]
        self.assertEqual(["f0000.png", "f0002.png", "f0004.png", "f0006.png", "f0008.png"], picks, "five frames from the first to the last")
        strip = np.asarray(Image.open(self.root / "report" / "full-evidence.png").convert("RGB"))
        top = np.concatenate([parity.load(self.root / "web/full/frames" / name) for name in picks], axis=1)
        bottom = np.concatenate([parity.load(self.root / "spritekit/full/frames" / name) for name in picks], axis=1)
        self.assertTrue(np.array_equal(strip[:200], top), "the top row is the web's frames")
        self.assertTrue(np.array_equal(strip[208:], bottom), "the bottom row is SpriteKit's frames")
        self.assertFalse(np.array_equal(top, bottom), "the two rows must differ for this test to mean anything")
        self.assertEqual("f0005.png", report["runs"]["full"]["worst"][0]["frame"], "the worst frame comes first")
        scores = [frame["ssim"] for frame in report["runs"]["full"]["worst"]]
        self.assertEqual(sorted(scores[1:]), scores[1:])

    def test_a_failure_prints_a_sheet_readable_from_the_log(self):
        self.both(spritekit={"full": {"leave_out": ("ear",)}})
        _, _, printed = self.check()
        self.assertIn("PARITY-SHEET-BEGIN full", printed)
        self.assertIn("PARITY-SHEET-END full", printed)


MODEL = json.loads((parity.ROOT / "characters/dog/model.json").read_text())


def hex_rgb(value):
    return np.array([int(value[i:i + 2], 16) for i in (1, 3, 5)], float)


def cheeks(size, level, dx=0.0, levels=None):
    """A head in the dog's printed fur with two soft cheeks of its printed pink, each peaking at its level (levels gives
    each its own), as the blush is drawn, shifted by dx frame pixels; and each cheek's box as render.ts finds a soft part's
    footprint: where its alpha is at least half its peak. A resting cheek peaks at 0.368, about 24 from the fur at
    most, so neither the score nor a patch can see it go."""
    k = 4
    fur, pink = hex_rgb(MODEL["palette"]["fur"]), hex_rgb(MODEL["palette"]["blush"])
    ys, xs = np.mgrid[:size * k, :size * k] / k
    unit = size / 100
    head = ((xs - 50 * unit - dx) / (30 * unit)) ** 2 + ((ys - 50 * unit) / (26 * unit)) ** 2 <= 1
    rgb = np.full((size * k, size * k, 3), 255.0)
    rgb[head] = fur
    boxes = []
    for (cx, cy), peak in zip(((38, 58), (62, 58)), levels or (level, level)):
        spread = 5 * unit
        alpha = peak * np.exp(-(((xs - cx * unit - dx) ** 2 + (ys - cy * unit) ** 2) / (2 * spread ** 2)))
        alpha[~head] = 0
        rgb = rgb * (1 - alpha[..., None]) + pink * alpha[..., None]
        core = peak * np.exp(-(((np.arange(size) + 0.5 - cx * unit) ** 2)[None, :] + ((np.arange(size) + 0.5 - cy * unit) ** 2)[:, None])
                             / (2 * spread ** 2)) >= peak / 2
        yy, xx = np.nonzero(core)
        boxes.append([int(xx.min()), int(yy.min()), int(xx.max()), int(yy.max())])
    eye = (((xs - 50 * unit - dx) / (3 * unit)) ** 2 + ((ys - 44 * unit) / (2 * unit)) ** 2) <= 1
    rgb[eye] = (40, 30, 30)
    image = Image.fromarray(np.clip(np.round(rgb), 0, 255).astype(np.uint8))
    return image.resize((size, size), Image.LANCZOS), boxes


class SoftLevels(unittest.TestCase):
    """The soft parts' levels, fitted in both runtimes' frames where render.ts --stills declares them (soft.json)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def stills(self, web_level=0.368, spritekit=None, parts=("blush.L", "blush.R"), species="dog"):
        """Two stills a run, still_front and face_shy, on both sides; spritekit maps a run to cheeks()'s options for
        SpriteKit's frames; soft.json in each web run names each cheek's box."""
        for run, size in (("full", 200), ("small", 160)):
            declared = {}
            for side in ("web", "spritekit"):
                folder = self.root / side / run
                folder.mkdir(parents=True)
                for name in ("still_front", "face_shy"):
                    options = {"level": web_level} if side == "web" else dict({"level": web_level}, **(spritekit or {}).get(run, {}))
                    image, boxes = cheeks(size, **options)
                    image.save(folder / f"{name}.png")
                    if side == "web":
                        declared[f"{name}.png"] = [{"part": part, "box": box, "pixels": 1} for part, box in zip(parts, boxes)]
            (self.root / "web" / run / "soft.json").write_text(json.dumps({"species": species, "stills": declared}))

    def check(self):
        with contextlib.redirect_stdout(io.StringIO()) as printed:
            code = parity.main(self.root / "web", self.root / "spritekit", self.root / "report")
        return code, json.loads((self.root / "report" / "report.json").read_text()), printed.getvalue()

    def test_the_same_levels_pass_and_are_reported(self):
        self.stills()
        code, report, printed = self.check()
        self.assertEqual(0, code, printed)
        soft = report["runs"]["full"]["soft"]
        self.assertEqual((soft["levels"], soft["apart"], soft["largest difference"], soft["tolerance"]), (4, 0, 0.0, parity.SOFT_LEVEL_TOLERANCE))
        for row in soft["rows"]:
            self.assertAlmostEqual(row["web"], 0.368, delta=0.02)
        self.assertIn("parity: full: soft parts' levels: 4 fitted in both runtimes, the largest difference 0.000, 0 more than 0.05 apart", printed)
        self.assertEqual(report["softLevelTolerance"], parity.SOFT_LEVEL_TOLERANCE)

    def test_a_missing_resting_blush_fails_where_the_score_and_the_patches_pass(self):
        # Planted: SpriteKit reads the blush's missing alpha key as 0, not the rig's rest alpha (DECISIONS.md 191).
        self.stills(spritekit={"full": {"level": 0.0}, "small": {"level": 0.0}})
        code, report, printed = self.check()
        self.assertEqual(1, code)
        for run in ("full", "small"):
            entry = report["runs"][run]
            self.assertGreater(entry["min"], parity.THRESHOLD, "the score alone passes it")
            self.assertEqual(0, entry["with patches"], "and so do the patches")
            self.assertEqual(4, entry["soft"]["apart"], printed)
            self.assertTrue(all(s["soft levels apart"] == ["blush.L", "blush.R"] for s in entry["worst"]), entry["worst"])
        self.assertTrue(any(p.startswith("full/face_shy.png: blush.L's level is 0.3") and p.endswith("more than 0.05 apart")
                            for p in report["problems"]), report["problems"])
        # The worst sheet outlines each cheek's box on the difference, a pixel outside it.
        sheet = np.asarray(Image.open(self.root / "report" / "full-worst.png").convert("RGB"))
        x0, y0, _, _ = report["runs"]["full"]["soft"]["rows"][0]["box"]
        self.assertEqual((220, 0, 160), tuple(sheet[y0 - 1, 400 + x0 - 1]))

    def test_twice_the_resting_level_fails_and_a_level_within_the_tolerance_passes(self):
        self.stills(spritekit={"full": {"level": 0.75}})
        code, report, _ = self.check()
        self.assertEqual(1, code)
        self.assertEqual(4, report["runs"]["full"]["soft"]["apart"])
        self.assertEqual(0, report["runs"]["small"]["soft"]["apart"])
        self.tearDown()
        self.setUp()
        self.stills(spritekit={"full": {"level": 0.39}, "small": {"level": 0.35}})
        code, report, printed = self.check()
        self.assertEqual(0, code, printed)

    def test_one_cheek_wrong_fails_that_cheek_alone(self):
        self.stills(spritekit={"full": {"levels": (0.368, 0.2)}})
        code, report, _ = self.check()
        self.assertEqual(1, code)
        apart = [(r["frame"], r["part"]) for r in report["runs"]["full"]["soft"]["rows"] if not r["pass"]]
        self.assertEqual([("face_shy.png", "blush.R"), ("still_front.png", "blush.R")], apart)

    def test_a_fraction_of_a_pixel_moves_no_level_past_the_tolerance(self):
        self.stills(spritekit={"full": {"dx": 0.5}, "small": {"dx": 0.25}})
        code, report, printed = self.check()
        for run in ("full", "small"):
            self.assertEqual(0, report["runs"][run]["soft"]["apart"], printed)
            self.assertLess(report["runs"][run]["soft"]["largest difference"], parity.SOFT_LEVEL_TOLERANCE / 2)

    def test_a_soft_part_with_no_fit_or_nothing_to_fit_fails(self):
        self.stills(parts=("blush.L", "shadow.ground"))
        code, report, _ = self.check()
        self.assertEqual(1, code)
        self.assertIn("full/still_front.png: shadow.ground is soft, and parity has no fit for its level (SOFT_FITS)", report["problems"])
        self.tearDown()
        self.setUp()
        self.stills()
        dark = Image.new("RGB", (200, 200), (255, 255, 255))
        ImageDraw.Draw(dark).ellipse((40, 40, 160, 160), fill=(40, 30, 30))
        dark.save(self.root / "spritekit/full/still_front.png")
        code, report, _ = self.check()
        self.assertEqual(1, code)
        self.assertTrue(any(p.startswith("full/still_front.png: the SpriteKit frame has no light pixel in blush.L's box") for p in report["problems"]),
                        report["problems"])

    def test_soft_json_must_name_frames_the_web_run_holds_and_a_species_with_a_model(self):
        self.stills(species="nobody")
        code, report, _ = self.check()
        self.assertEqual(1, code)
        self.assertIn("full: soft.json names the species 'nobody', which has no model.json for its colours", report["problems"])
        self.tearDown()
        self.setUp()
        self.stills()
        (self.root / "web/small/face_shy.png").unlink()
        (self.root / "spritekit/small/face_shy.png").unlink()
        code, report, _ = self.check()
        self.assertEqual(1, code)
        self.assertIn("small/face_shy.png: soft.json names a still the web run does not hold", report["problems"])

    def test_frames_without_soft_json_declare_none(self):
        self.stills()
        for run in ("full", "small"):
            (self.root / "web" / run / "soft.json").unlink()
        code, report, printed = self.check()
        self.assertEqual(0, code, printed)
        self.assertNotIn("soft", report["runs"]["full"])
        self.assertIn("parity: full: soft parts' levels: none declared (no soft.json in the web run)", printed)


class Patches(unittest.TestCase):
    """Each kind of disagreement fails from exactly its patch size, and edge-thin lines never do."""

    def frame(self):
        a = np.full((48, 48, 3), 255, np.uint8)
        a[4:36, 4:36] = (200, 180, 160)
        return a

    def kinds(self, b):
        return [kind for kind, _ in parity.disagreements(self.frame(), b)]

    def test_a_drawing_half_a_pixel_off_raises_no_patch(self):
        # Hundreds of pixels differ by more than STRONG along the edges, all in lines thinner than a patch.
        a, b = (np.asarray(character(160, dx=dx).convert("RGB")) for dx in (0, 0.5))
        self.assertGreater(int((np.abs(a.astype(int) - b.astype(int)).max(axis=2) > parity.STRONG).sum()), 100)
        self.assertEqual([], parity.disagreements(a, b))

    def test_strong_from_three_pixels(self):
        b = self.frame()
        b[8:32, 10:12] = 0
        self.assertEqual([], self.kinds(b), "a stripe 2 px wide is an edge")
        b = self.frame()
        b[10:13, 10:13] = 0
        self.assertEqual(["strong"], self.kinds(b))

    def test_coverage_from_three_pixels(self):
        b = self.frame()
        b[38:40, 4:36] = (240, 240, 240)
        self.assertEqual([], self.kinds(b), "a band 2 px wide is an edge")
        b = self.frame()
        b[38:41, 10:13] = (240, 240, 240)
        self.assertEqual(["coverage"], self.kinds(b), "15 from white: drawn, but neither strong nor faint")

    def test_faint_from_seven_pixels(self):
        b = self.frame()
        b[10:16, 10:16] = (230, 210, 190)
        self.assertEqual([], self.kinds(b), "6 px across is below the faint patch")
        b = self.frame()
        b[10:17, 10:17] = (230, 210, 190)
        self.assertEqual(["faint"], self.kinds(b))
        b = self.frame()
        b[10:20, 10:20] = (220, 200, 180)
        self.assertEqual([], self.kinds(b), "20 apart is within FAINT")


if __name__ == "__main__":
    unittest.main()
