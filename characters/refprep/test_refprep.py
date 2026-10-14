"""Tests for the reference prep (spec section 5b, phase 2), on images whose answers
are known: the colour maths against published values, and each measuring step on
small synthetic drawings.

    python3 -m unittest discover -s characters/refprep -v"""
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

import crop
import markings
import measure
import palette
import sheets
import silhouette

CARD = (251, 245, 236)
FUR = (255, 244, 232)
LINE = (150, 108, 76)
FAINT = (222, 200, 178)
SHADOW = (234, 224, 213)


class ColourTest(unittest.TestCase):
    # Sharma, Wu and Dalal (2005), "The CIEDE2000 colour-difference formula", table 1.
    PAIRS = [
        ((50.0, 2.6772, -79.7751), (50.0, 0.0, -82.7485), 2.0425),
        ((50.0, 3.1571, -77.2803), (50.0, 0.0, -82.7485), 2.8615),
        ((50.0, 2.8361, -74.0200), (50.0, 0.0, -82.7485), 3.4412),
        ((50.0, 0.0, 0.0), (50.0, -1.0, 2.0), 2.3669),
        ((50.0, 2.49, -0.001), (50.0, -2.49, 0.0009), 7.1792),
        ((50.0, 2.49, -0.001), (50.0, -2.49, 0.0011), 7.2195),
        ((50.0, -0.001, 2.49), (50.0, 0.0009, -2.49), 4.8045),
        ((50.0, -0.001, 2.49), (50.0, 0.0011, -2.49), 4.7461),
        ((50.0, 2.5, 0.0), (50.0, 0.0, -2.5), 4.3065),
        ((50.0, 2.5, 0.0), (73.0, 25.0, -18.0), 27.1492),
        ((60.2574, -34.0099, 36.2677), (60.4626, -34.1751, 39.4387), 1.2644),
        ((63.0109, -31.0961, -5.8663), (62.8187, -29.7946, -4.0864), 1.2630),
        ((22.7233, 20.0904, -46.6940), (23.0331, 14.9730, -42.5619), 2.0373),
        ((90.8027, -2.0831, 1.4410), (91.1528, -1.6435, 0.0447), 1.4441),
    ]

    def test_ciede2000_matches_the_published_pairs(self):
        for first, second, expected in self.PAIRS:
            self.assertAlmostEqual(float(sheets.delta_e2000(first, second)), expected, places=4)
            self.assertAlmostEqual(float(sheets.delta_e2000(second, first)), expected, places=4)

    def test_lab_of_known_colours(self):
        white, red = sheets.to_lab(np.array([[255, 255, 255], [255, 0, 0]], np.uint8))
        np.testing.assert_allclose(white, [100, 0, 0], atol=0.01)
        np.testing.assert_allclose(red, [53.24, 80.09, 67.20], atol=0.02)

    def test_hex_round_trip(self):
        self.assertEqual(sheets.rgb_to_hex(sheets.hex_to_rgb("#3a2314")), "#3A2314")


def card(width, height):
    return Image.new("RGB", (width, height), CARD)


def blob_drawing(gap=False, faint_top=True):
    """A cream body on the card, outlined, with a faint stretch of outline at its top (like the sheets'
    fluffy head top) and a ground shadow beneath it. Returns the image and the true silhouette."""
    image = card(160, 160)
    draw = ImageDraw.Draw(image)
    draw.ellipse([30, 132, 130, 150], fill=SHADOW)
    box = [40, 30, 120, 140]
    draw.ellipse(box, fill=FUR, outline=LINE, width=2)
    if faint_top:
        draw.arc(box, 240, 300, fill=FAINT, width=2)
    if gap:
        draw.line([80, 30, 80, 31], fill=FUR)
    truth = Image.new("L", image.size, 0)
    ImageDraw.Draw(truth).ellipse(box, fill=255)
    return np.asarray(image), np.asarray(truth) > 0


def iou(a, b):
    return (a & b).sum() / (a | b).sum()


class SilhouetteTest(unittest.TestCase):
    def test_cream_drawing_on_cream_card(self):
        rgb, truth = blob_drawing()
        found = silhouette.cut_out(rgb)
        self.assertGreater(iou(found, truth), 0.97)

    def test_the_faint_top_holds_with_a_one_pixel_gap(self):
        rgb, truth = blob_drawing(gap=True)
        self.assertGreater(iou(silhouette.cut_out(rgb), truth), 0.97)

    def test_the_ground_shadow_is_not_the_drawing(self):
        rgb, truth = blob_drawing()
        found = silhouette.cut_out(rgb)
        below = np.zeros_like(found)
        below[142:, :] = True
        self.assertEqual(int((found & below).sum()), 0)
        beside = np.zeros_like(found)
        beside[132:, :38] = True
        beside[132:, 123:] = True
        self.assertEqual(int((found & beside).sum()), 0)


class SilhouetteOnTheSheetTest(unittest.TestCase):
    """Each step of the cut-out holds where the dog's own sheets need it: points in the sheet's pixels,
    each checked by eye on the crop, that fail when that step is taken out (DECISIONS.md, the silhouettes)."""
    DRAWING = [
        ("master.turnaround.front", (471, 79), "the tuft on top of the head, outlined only faintly"),
        ("master.turnaround.three-quarter", (1223, 204), "the tail's curl, outlined only faintly"),
        ("master.turnaround.front", (590, 141), "the outline on the ear's outer edge"),
        ("master.turnaround.side", (754, 101), "the outline on the ear's back edge"),
        ("master.turnaround.side", (684, 106), "the cheek, nearly the card's colour"),
        ("motion.key.head-tilt-left", (442, 295), "the chest, nearly the card's colour"),
    ]
    CARD = [
        ("master.turnaround.three-quarter", (1181, 206), "the card between the ear's tip and the back, in its shade"),
        ("master.turnaround.three-quarter", (1201, 213), "the card between the ear's tip and the back"),
        ("master.turnaround.front", (456, 206), "the card between the ear's tip and the shoulder"),
        ("master.turnaround.side", (774, 273), "the shadow under the hind paw"),
        ("master.turnaround.side", (652, 273), "the warm shadow beside the front paw"),
        ("master.turnaround.three-quarter", (1075, 269), "the warm shadow beside the front paw"),
        ("motion.key.head-tilt-left", (535, 338), "the ground shadow beside the hind paw"),
        ("motion.key.head-tilt-left", (396, 198), "the motion marks beside the head"),
    ]

    @classmethod
    def setUpClass(cls):
        panel_map = crop.load_map("dog")
        cls.cut = {}
        for panel, _, _ in cls.DRAWING + cls.CARD:
            if panel not in cls.cut:
                sheet = panel.split(".")[0]
                rgb = sheets.load_sheet("dog", sheet)
                entry = next(p for p in panel_map["sheets"][sheet] if p["id"] == panel)
                box = crop.tighten(sheets.ink_mask(rgb), entry["box"]) if entry.get("tighten", True) else entry["box"]
                x, y, w, h = box
                cls.cut[panel] = ((x, y), silhouette.cut_out(rgb[y:y + h, x:x + w]))

    def inside(self, panel, point):
        (x0, y0), mask = self.cut[panel]
        return bool(mask[point[1] - y0, point[0] - x0])

    def test_the_drawing_is_kept(self):
        for panel, point, what in self.DRAWING:
            with self.subTest(what=what, panel=panel):
                self.assertTrue(self.inside(panel, point), f"{what} at {point} on {panel} was cut away")

    def test_no_cut_out_has_a_hole(self):
        # The dog has no see-through gaps: a hole is a speck the method left behind.
        for panel, ((_, _), mask) in self.cut.items():
            with self.subTest(panel=panel):
                self.assertEqual(int((ndimage.binary_fill_holes(mask) & ~mask).sum()), 0)

    def test_the_card_and_the_shadows_are_left_out(self):
        for panel, point, what in self.CARD:
            with self.subTest(what=what, panel=panel):
                self.assertFalse(self.inside(panel, point), f"{what} at {point} on {panel} was taken as the dog")


class CropTest(unittest.TestCase):
    def test_tighten_keeps_the_ink_and_its_margin(self):
        ink = np.zeros((100, 100), bool)
        ink[30:40, 50:70] = True
        self.assertEqual(crop.tighten(ink, [10, 10, 80, 80]), [50 - crop.PAD, 30 - crop.PAD, 20 + 2 * crop.PAD, 10 + 2 * crop.PAD])
        # Never past the box drawn by hand.
        self.assertEqual(crop.tighten(ink, [48, 28, 30, 20]), [48, 28, 30 - 4, 16])

    def test_an_item_outside_every_box_is_reported(self):
        ink = np.zeros((100, 100), bool)
        ink[10:20, 10:20] = True
        ink[60:70, 60:70] = True
        self.assertEqual(crop.uncovered_items(ink, [[5, 5, 20, 20]]), [[60, 60, 10, 10]])
        self.assertEqual(crop.uncovered_items(ink, [[5, 5, 20, 20], [65, 65, 2, 2]]), [])

    def test_a_box_off_the_sheet_fails(self):
        with self.assertRaises(SystemExit):
            crop.check_box([90, 10, 20, 20], (100, 100, 3), "test")


class MeasureTest(unittest.TestCase):
    def test_line_width_is_area_over_centre_line(self):
        ink = np.zeros((40, 80), bool)
        ink[18:21, 10:70] = True
        self.assertAlmostEqual(measure.line_width(ink), 3.0, delta=0.15)

    def test_toe_lines_width_at_half_depth(self):
        L = np.full((40, 80), 95.0)
        L[:, 30:32] = 80.0
        L[:, 50:53] = 82.0
        sil = np.ones_like(L, bool)
        found = measure.toe_lines(L, sil, [(41, 20)])
        self.assertAlmostEqual(found["widthPx"], 2.5, delta=0.01)  # the median of 2 and 3 px
        self.assertAlmostEqual(found["depthL"], 14.0, delta=0.01)

    def test_outlines_and_grain_are_not_toe_lines(self):
        L = np.full((40, 80), 95.0)
        L[:, 40:42] = 45.0
        self.assertIsNone(measure.toe_lines(L, np.ones_like(L, bool), [(41, 20)]))
        L = np.full((40, 80), 95.0)
        L[:, 36] = 92.0  # JPEG grain, a few L* units deep
        self.assertIsNone(measure.toe_lines(L, np.ones_like(L, bool), [(41, 20)]))

    def test_head_width_leaves_the_ears_out(self):
        sil = np.zeros((100, 140), bool)
        y, x = np.mgrid[:100, :140]
        sil |= (x - 70) ** 2 + (y - 50) ** 2 <= 30 ** 2
        ears = [((x - 30) ** 2 / 15 ** 2 + (y - 55) ** 2 / 30 ** 2) <= 1, ((x - 110) ** 2 / 15 ** 2 + (y - 55) ** 2 / 30 ** 2) <= 1]
        for ear in ears:
            sil |= ear
        head = measure.head_region(sil, ears, 15, 90)
        width, row, left, right = measure.head_width(head)
        self.assertLessEqual(width, 61)
        self.assertGreaterEqual(width, 50)
        self.assertGreater(left, 40)

    def test_points_are_in_points_from_the_ground_y_down(self):
        points = measure.to_points({"head.top": [100, 10], "ground": [100, 210]}, [100, 210], 0.82)
        self.assertEqual(points, {"head.top": [0.0, -164.0], "ground": [0.0, 0.0]})

    def test_a_hand_point_off_the_drawing_fails(self):
        sil = np.zeros((50, 50), bool)
        sil[10:40, 10:40] = True
        measure.check_hand("front", {"paw.front.L": [20, 30]}, sil)
        with self.assertRaises(ValueError):
            measure.check_hand("front", {"paw.front.L": [45, 30]}, sil)
        with self.assertRaises(ValueError):
            measure.check_hand("front", {"paw.front.L": [200, 30]}, sil)

    def test_above_the_collar_follows_its_top(self):
        band = np.zeros((20, 10), bool)
        band[10:13, 2:6] = True
        band[8:11, 6:8] = True
        above = measure.above_collar(band)
        self.assertTrue(above[9, 3])
        self.assertFalse(above[10, 3])
        self.assertTrue(above[7, 6])
        self.assertFalse(above[8, 6])
        self.assertTrue(above[11, 0])  # beside the collar: down to its lowest row
        self.assertFalse(above[12, 0])


class PaletteTest(unittest.TestCase):
    def test_the_dominant_colour_is_the_fullest_bin(self):
        rgb = np.zeros((10, 10, 3), np.uint8)
        rgb[:] = sheets.hex_to_rgb("#D9A379")
        rgb[:3] = sheets.hex_to_rgb("#3A2314")
        colour, count = palette.dominant(rgb, np.ones((10, 10), bool))
        self.assertEqual(sheets.rgb_to_hex(colour), "#D9A379")
        self.assertEqual(count, 100)
        self.assertEqual(palette.dominant(rgb, np.zeros((10, 10), bool)), (None, 0))

    def test_a_swatch_is_sampled_inside_its_disc(self):
        image = Image.new("RGB", (60, 60), CARD)
        ImageDraw.Draw(image).ellipse([5, 5, 55, 55], fill=(125, 183, 232))
        self.assertEqual(sheets.rgb_to_hex(palette.swatch(np.asarray(image))), "#7DB7E8")
        self.assertAlmostEqual(palette.delta(palette.swatch(np.asarray(image)), "#7DB7E8"), 0.0, places=6)

    def test_a_wash_over_the_fur_gives_its_opacity(self):
        fur, blush = sheets.hex_to_rgb("#FFF4E8").astype(float), sheets.hex_to_rgb("#F7B3A6").astype(float)
        rgb = np.zeros((10, 10, 3), np.uint8)
        rgb[:] = np.round(fur + 0.3 * (blush - fur)).astype(np.uint8)
        alpha, _ = palette.blush_opacity(rgb, np.ones((10, 10), bool), "#FFF4E8", "#F7B3A6")
        self.assertAlmostEqual(alpha, 0.3, delta=0.02)


class MarkingsTest(unittest.TestCase):
    def test_a_patch_is_the_region_holding_its_seed_within_its_clip(self):
        area = np.zeros((40, 40), bool)
        area[5:15, 5:30] = True
        area[25:35, 5:15] = True
        found = markings.patch(area, [10, 10], None)
        self.assertEqual(int(found.sum()), 250)
        clipped = markings.patch(area, [10, 10], [0, 0, 20, 40])
        self.assertEqual(int(clipped.sum()), 150)
        self.assertIsNone(markings.patch(area, [20, 20], None))
        self.assertIsNone(markings.patch(area, [25, 10], [0, 0, 20, 40]))


class FilesTest(unittest.TestCase):
    def test_json_keeps_points_on_one_line(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "a.json"
            sheets.write_json(path, {"eye.L": [21.8, -101.2], "box": [1, 2, 3, 4], "names": ["a", "b"]})
            text = path.read_text()
            self.assertIn('"eye.L": [21.8, -101.2]', text)
            self.assertIn('"box": [1, 2, 3, 4]', text)
            self.assertEqual(json.loads(text)["names"], ["a", "b"])

    def test_the_pixel_hash_ignores_the_file_and_sees_the_shape(self):
        a = np.zeros((4, 6, 3), np.uint8)
        self.assertNotEqual(sheets.pixels_sha256(a), sheets.pixels_sha256(a.reshape(6, 4, 3)))
        self.assertEqual(sheets.pixels_sha256(a), sheets.pixels_sha256(a.copy()))


if __name__ == "__main__":
    unittest.main()
