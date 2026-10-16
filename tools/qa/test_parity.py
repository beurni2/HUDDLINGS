"""Tests for the parity check: it scores the character, not the background, and
fails a missing part (strong, faint or only in coverage), a missing run or frame,
an empty frame and a size change; its evidence shows the frames it names."""
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
