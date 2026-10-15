"""Tests for the placement guide (tools/guide/grid.py).

    python3 -m unittest discover -s tools/guide -v"""
import json
import tempfile
import unittest
from pathlib import Path

import grid
import match

MODEL = json.loads((grid.ROOT / "characters/dog/model.json").read_text())


class GuideTest(unittest.TestCase):
    def test_a_model_point_lands_where_the_sheet_match_puts_it(self):
        guide = grid.Guide("dog", "front", 7)
        rec = MODEL["crops"]["front"]
        gx, gy = rec["anchorsCropPx"]["ground"]
        for name, pt in MODEL["landmarks"]["front"].items():
            with self.subTest(landmark=name):
                # The landmark's pixel index (phase 2's) at its centre, enlarged 7 times.
                want = ((gx + pt[0] / rec["ptPerCropPx"] + 0.5) * 7, (gy + pt[1] / rec["ptPerCropPx"] + 0.5) * 7)
                self.assertAlmostEqual(guide.to_image(pt)[0], want[0], places=6)
                self.assertAlmostEqual(guide.to_image(pt)[1], want[1], places=6)
                back = guide.to_pt(guide.to_image(pt))
                self.assertAlmostEqual(back[0], pt[0], places=6)
                self.assertAlmostEqual(back[1], pt[1], places=6)

    def test_a_mirrored_facing_mirrors_its_landmarks(self):
        guide = grid.Guide("dog", "side.R", 6)
        self.assertEqual(guide.landmarks["eye.R"], [-MODEL["landmarks"]["side.L"]["eye.L"][0], MODEL["landmarks"]["side.L"]["eye.L"][1]])
        # The mirrored crop's ground column is the mirror of the .L crop's.
        width = guide.sil.shape[1]
        self.assertAlmostEqual(guide.ground[0], width - 1 - MODEL["crops"]["side.L"]["anchorsCropPx"]["ground"][0])
        # The eye's landmark lands on the mirrored crop's dark eye.
        x, y = guide.to_crop(guide.landmarks["eye.R"])
        self.assertLess(guide.crop[int(y), int(x)].mean(), 60)

    def test_a_box_crops_to_its_points(self):
        guide = grid.Guide("dog", "front", 8, [-20, -110, 20, -80])
        self.assertAlmostEqual(guide.to_pt((0, 0))[0], -20, places=6)
        self.assertAlmostEqual(guide.to_pt(guide.size)[1], -80, delta=0.15)

    def test_a_guide_never_goes_where_drawing_code_reads_or_anything_ships(self):
        args = grid.argparse.Namespace(out=None, species="dog", view="front", box=None)
        for place in ("characters/dog/ref/guide.png", "build/characters/dog/guide.png", "ios/App/guide.png", "web/guide.png",
                      "runtime-web/lab/guide.png", "Characters/dog/guide.png", "build/../ios/guide.png"):
            with self.subTest(out=place):
                args.out = str(grid.ROOT / place)
                with self.assertRaises(SystemExit):
                    grid.out_path(args)
        with tempfile.TemporaryDirectory() as folder:
            # Nor through a link that leads there.
            link = Path(folder) / "link"
            link.symlink_to(grid.ROOT / "web")
            args.out = str(link / "g.png")
            with self.assertRaises(SystemExit):
                grid.out_path(args)
            args.out = str(Path(folder) / "g.png")
            self.assertEqual(grid.out_path(args), Path(folder).resolve() / "g.png")
        for place in ("build/guides/dog/front.png", "build/guides/g.png"):
            args.out = str(grid.ROOT / place)
            self.assertEqual(grid.out_path(args), grid.ROOT / place)
        args.out = None
        self.assertEqual(grid.out_path(args), grid.ROOT / "build/guides/dog/front.png")

    def test_the_guide_uses_the_sheet_matchs_frame(self):
        self.assertIs(grid.match, match)


if __name__ == "__main__":
    unittest.main()
