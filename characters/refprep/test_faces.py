"""Tests for the face panels' crop records (spec section 5b, the Faces check,
L525; the crop records, L529): the face rules and the shapes on drawings with
known answers, the committed records, one primary panel per preset, rule R3,
and anchors planted off their features, which must fail.

    python3 -m unittest discover -s characters/refprep -p test_faces.py -v"""
import copy
import json
import unittest

import numpy as np
from PIL import Image, ImageDraw

import faces
import model
import sheets

PLAN = json.loads((sheets.ROOT / "characters/dog/refmap/faces.json").read_text())
PANELS = {p["id"]: p for p in json.loads((sheets.ROOT / "characters/dog/ref/panels.json").read_text())["panels"]}
CARD, FUR, LINE, TAN, DARK = (251, 245, 236), (255, 244, 232), (150, 108, 76), (217, 163, 121), (32, 12, 2)
HAPPY = "expressions.expression.happy"
MASTER = "master.expression."
# The presets the spec gives a sheet panel (L480-498): all but hungry and huffy, new drawings the founder approves.
WITH_PANELS = [n for n in faces.PRESETS if n not in ("hungry", "huffy")]


def face_drawing(roll=0.0):
    """A head on the card with features where they are known: tan ears behind a closed outline round the cheeks (as a
    render draws it), round dark eyes with a catchlight, a dark nose, a straight mouth line under it and a tuft on top,
    drawn at four times the size and reduced, so its edges are soft, then rolled about the nose. Returns the pixels
    and each feature's true place, in pixel indices (a pixel's centre is its index)."""
    big = 4
    w, h = 240, 220
    image = Image.new("RGB", (w * big, h * big), CARD)
    draw = ImageDraw.Draw(image)

    def s(*values):
        return [v * big for v in values]

    cx, cy = 120, 120  # the nose
    draw.ellipse(s(30, 60, 80, 170), fill=TAN)  # ears, behind the head
    draw.ellipse(s(160, 60, 210, 170), fill=TAN)
    draw.ellipse(s(50, 40, 190, 160), fill=FUR, outline=LINE, width=2 * big)  # head: cheeks 140 wide on row 100
    draw.ellipse(s(108, 30, 132, 50), fill=FUR, outline=LINE, width=2 * big)  # the tuft's lobe, its top at y 30
    draw.rectangle(s(110, 42, 130, 52), fill=FUR)
    for ex in (cx - 32, cx + 32):
        draw.ellipse(s(ex - 10, 90 - 10, ex + 10, 90 + 10), fill=DARK)
        draw.ellipse(s(ex - 5, 84 - 2, ex - 1, 84 + 2), fill=(255, 255, 255))
    draw.ellipse(s(cx - 9, cy - 6, cx + 9, cy + 6), fill=DARK)
    draw.line(s(cx, cy + 5, cx, cy + 12), fill=DARK, width=2 * big)
    draw.rectangle(s(cx - 16, cy + 11, cx + 16, cy + 13), fill=DARK)  # the mouth line, 32 long and 2 wide
    image = image.resize((w, h), Image.BOX)
    truth = {"nose": [cx, cy], "eye.R": [cx - 32, 90], "eye.L": [cx + 32, 90], "mouth.R": [cx - 16, cy + 12],
             "mouth.L": [cx + 16, cy + 12]}
    t = np.radians(roll)
    turn = np.array([[np.cos(t), -np.sin(t)], [np.sin(t), np.cos(t)]])
    truth = {n: turn @ (np.array(p, float) - [cx, cy]) + [cx, cy] for n, p in truth.items()}
    # The head top is the highest point of the tuft's outline on the sheet: its lobe's top, wherever the roll turns it.
    truth["head.top"] = turn @ (np.array([120.0, 40.0]) - [cx, cy]) + [cx, cy] - [0, 10]
    if roll:
        # PIL turns counter-clockwise on the screen for a positive angle: the roll is clockwise.
        image = image.rotate(-roll, resample=Image.BICUBIC, center=(cx, cy), fillcolor=CARD)
    return np.asarray(image), {n: list(p - 0.5) for n, p in truth.items()}


class RulesTest(unittest.TestCase):
    """Each rule finds its feature on a drawing with known answers, upright and rolled, from a seed a little off."""

    def test_each_feature_is_found_where_it_was_drawn(self):
        for roll in (0.0, 15.0, -20.0):
            rgb, truth = face_drawing(roll)
            keep = np.ones(rgb.shape[:2], bool)
            seeds = {n: [p[0] + 2, p[1] - 2] for n, p in truth.items()}
            found, _ = faces.find_face(rgb, keep, seeds, 140, roll)
            for name, want in truth.items():
                with self.subTest(roll=roll, feature=name):
                    # The eyes and the nose are their centres, the mouth's corners its line's ends (its reach is
                    # taken over its last two pixels), the head top the outline's outer edge at the lobe's top.
                    limit = {"mouth.R": 1.5, "mouth.L": 1.5, "head.top": 1.5}.get(name, 0.6)
                    self.assertLessEqual(float(np.hypot(*np.subtract(found[name], want))), limit, f"{found[name]} against {want}")
            self.assertAlmostEqual(faces.roll_of(found["eye.R"], found["eye.L"]), roll, delta=1.0)

    def test_the_head_width_is_the_cheeks_widest_run(self):
        for roll in (0.0, 15.0):
            rgb, truth = face_drawing(roll)
            keep = np.ones(rgb.shape[:2], bool)
            across, down = faces.frame(roll)
            nose = np.array(truth["nose"])
            row = nose + down * (100 - 120)  # the head's widest row, through its middle
            ends = faces.head_width(rgb, keep, truth["nose"], roll, [list(row - across * 70), list(row + across * 70)])
            # The run stops at the outline's inner edge: 140 less the 2 px line each side.
            self.assertAlmostEqual(float(np.hypot(*np.subtract(ends[1], ends[0]))), 136, delta=1.5)
            self.assertAlmostEqual(faces.widest_run(rgb, keep, truth["nose"], roll, 136), 136, delta=1.5)

    def test_a_soft_centroid_moves_with_the_drawing(self):
        # A disc moved by fractions of a pixel: its centroid follows within a tenth of a pixel, where a threshold's steps.
        for shift in (0.0, 0.25, 0.5, 0.75):
            yy, xx = np.mgrid[:40, :40]
            cover = np.clip(6.5 - np.hypot(xx - 20 - shift, yy - 20), 0, 1)
            L = 95 - 80 * cover
            point = faces.soft_centroid(L, np.hypot(xx - 20, yy - 20) <= 9)
            self.assertAlmostEqual(point[0], 20 + shift, delta=0.1)

    def test_an_iou_moves_one_mark_onto_the_other(self):
        # A mark and itself moved by 7 and -4 px are one shape; an arc and the same arc upside down (a happy crescent and
        # a closed eye) are not, though their areas are equal.
        yy, xx = np.mgrid[:60, :60]
        ring = (np.hypot(xx - 30, yy - 30) <= 12) & (np.hypot(xx - 30, yy - 30) > 9)
        arc = ring & (yy < 26)
        self.assertEqual(faces.aligned_iou(np.roll(arc, (-4, 7), axis=(0, 1)), arc), 1.0)
        flipped = arc[::-1]
        self.assertEqual(flipped.sum(), arc.sum())
        self.assertLess(faces.aligned_iou(flipped, arc), 0.5)
        self.assertEqual(faces.aligned_iou(np.zeros_like(arc), arc), 0.0)

    def test_an_open_mouth_is_its_pink_and_red_not_its_line(self):
        # The sheet's tongue and the inside's red are open; the mouth's brown line, the nose's near-black and the fur
        # are not.
        colours = np.array([[[251, 154, 136], [158, 36, 26], [92, 58, 42], [32, 12, 2], [255, 244, 232]]], np.uint8)
        self.assertEqual(faces.open_pixels(colours)[0].tolist(), [True, True, False, False, False])

    def test_the_order_check_knows_each_feature(self):
        rgb, truth = face_drawing()
        faces.check_order("drawing", truth, 0.0, 140)
        for name, wrong in (("nose", truth["eye.R"]), ("eye.L", truth["eye.R"]), ("mouth.R", truth["mouth.L"]),
                            ("head.top", truth["mouth.L"])):
            with self.subTest(misplaced=name):
                with self.assertRaises(ValueError):
                    faces.check_order("drawing", dict(truth, **{name: wrong}), 0.0, 140)


def build(change):
    """faces.build on a copy of the hand-written plan with one change made to it."""
    plan = copy.deepcopy(PLAN)
    change(plan)
    return faces.build("dog", plan)


class RecordsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.built = faces.build("dog")

    def test_the_committed_records_are_what_the_scripts_write(self):
        written = json.loads((sheets.ROOT / "characters/dog/ref/faces.json").read_text())
        self.assertEqual(json.loads(json.dumps(self.built)), written)
        committed = json.loads((sheets.ROOT / "characters/dog/model.json").read_text())["faceCrops"]
        self.assertEqual(committed, model.face_crops(sheets.ROOT / "characters/dog"))

    def test_every_preset_with_a_panel_has_exactly_one_primary_record(self):
        self.assertEqual(sorted(PLAN["presets"]), sorted(faces.PRESETS))
        self.assertEqual(len(WITH_PANELS), 17)
        for name in ("hungry", "huffy"):
            self.assertNotIn("primary", PLAN["presets"][name])
            self.assertEqual(PLAN["presets"][name]["beside"], [])
            self.assertFalse(any(name in r["presets"] for r in self.built["records"].values()))
        for name in WITH_PANELS:
            with self.subTest(preset=name):
                primary = [pid for pid, r in self.built["records"].items() if name in r["primaryFor"]]
                self.assertEqual(primary, [PLAN["presets"][name]["primary"]])
                self.assertEqual(self.built["presets"][name]["primary"], primary[0])
        for pid, record in self.built["records"].items():
            self.assertEqual(record["view"], "front")
            self.assertTrue(record["presets"])
            self.assertTrue(set(record["primaryFor"]) <= set(record["presets"]))

    def test_the_primaries_are_the_level_front_on_panels(self):
        # Lead decision: content, tender and blissful on the master sheet's Content; mischievous and sly on its Cheeky,
        # which draws the wink with the tongue out. The rest are chosen in refmap/faces.json, each with its reason.
        primary = {n: PLAN["presets"][n]["primary"] for n in WITH_PANELS}
        for name in ("content", "tender", "blissful", "proud"):
            self.assertEqual(primary[name], MASTER + "content")
        for name in ("mischievous", "sly"):
            self.assertEqual(primary[name], MASTER + "cheeky")
        self.assertEqual(self.built["records"][MASTER + "cheeky"]["drawn"], {"eyes": "wink", "mouth": "cheeky", "wink": "eye.L"})
        for name in WITH_PANELS:
            self.assertTrue(PLAN["presets"][name].get("note"), name)
        # The panels that raise the chin or turn the head are never a primary.
        for pid in ("expressions.expression.proud", "expressions.expression.mischievous"):
            self.assertEqual(self.built["records"][pid]["primaryFor"], [])

    def test_no_record_names_a_face_rule_r3_forbids(self):
        named = [p for preset in PLAN["presets"].values() for p in [preset.get("primary")] + preset["beside"] if p]
        for pid in list(PLAN["panels"]) + named:
            self.assertFalse(faces.forbidden(PANELS[pid]), pid)
        model_json = json.loads((sheets.ROOT / "characters/dog/model.json").read_text())
        for pid in model_json["faceCrops"]:
            self.assertFalse(faces.forbidden(PANELS[pid]), pid)
        barred = {pid for pid, panel in PANELS.items() if faces.forbidden(panel)}
        self.assertEqual(barred, {"expressions.expression.sad", "expressions.mouth.pout", "expressions.ears.both-drooped",
                                  "expressions.assembly.sleepy"})

    def test_a_record_for_a_face_rule_r3_forbids_is_refused(self):
        for pid in ("expressions.expression.sad", "expressions.mouth.pout", "expressions.ears.both-drooped",
                    "expressions.assembly.sleepy"):
            with self.subTest(panel=pid):
                def plant(plan):
                    plan["panels"][pid] = copy.deepcopy(plan["panels"][HAPPY])
                    plan["presets"]["sleepy"]["beside"].append(pid)
                with self.assertRaisesRegex(ValueError, "R3"):
                    build(plant)
        with self.assertRaisesRegex(ValueError, "presets the spec does not"):
            build(lambda plan: plan["presets"].update(sad={"eyes": ["open"], "mouth": ["smile"], "panels": []}))

    def test_a_downturned_mouth_gets_no_corners(self):
        def plant(plan):
            plan["panels"]["expressions.expression.curious"]["anchors"].update({"mouth.R": [853, 195], "mouth.L": [862, 199]})
        with self.assertRaisesRegex(ValueError, "no corners"):
            build(plant)
        for pid, record in self.built["records"].items():
            if record["drawn"]["mouth"] == "downturned":
                self.assertFalse({"mouth.R", "mouth.L"} & set(record["anchorsCropPx"]), pid)

    def test_a_preset_is_held_only_to_the_states_it_shows(self):
        gates = {pid: r["gates"] for pid, r in self.built["records"].items()}
        both, eyes, mouth = ["eye.R", "eye.L", "mouth.R", "mouth.L"], ["eye.R", "eye.L"], ["mouth.R", "mouth.L"]
        for pid in (HAPPY, MASTER + "happy"):
            self.assertEqual(gates[pid], {"neutral": eyes, "happy": both, "singing": []})
        for pid in ("expressions.expression.laughing", MASTER + "laughing"):
            self.assertEqual(gates[pid], {"laughing": both, "singing": eyes, "ticklish": both})
        for pid in ("expressions.expression.excited", MASTER + "excited"):
            self.assertEqual(gates[pid], {"excited": both, "ticklish": eyes})
        self.assertEqual(gates[MASTER + "curious"], {"curious": eyes})
        self.assertEqual(gates[MASTER + "sleepy"], {"sleepy": eyes})
        self.assertEqual(gates[MASTER + "content"], {"proud": both, "content": both, "tender": mouth, "blissful": both})
        self.assertEqual(gates[MASTER + "cheeky"], {"mischievous": both, "sly": both})
        self.assertEqual(gates[MASTER + "winking"], {"mischievous": eyes, "sly": eyes})
        self.assertEqual(gates["expressions.expression.mischievous"], {"mischievous": both, "sly": both})
        self.assertEqual(gates["expressions.ears.lifted-slightly"], {"listening": []})
        self.assertEqual(self.built["records"][MASTER + "cheeky"]["eyeStates"], {"eye.R": "open", "eye.L": "happy"})
        self.assertEqual(self.built["records"]["expressions.expression.mischievous"]["eyeStates"], {"eye.R": "happy", "eye.L": "open"})

    def test_the_master_sheets_expression_row_is_measured_enlarged_and_alike(self):
        records = self.built["records"]
        self.assertEqual(sorted(pid for pid, r in records.items() if r["sheet"] == "master"),
                         sorted(MASTER + n for n in ("happy", "excited", "laughing", "curious", "sleepy", "surprised", "winking", "cheeky", "content")))
        for pid, record in records.items():
            self.assertEqual(record["measureZoom"], 2 if record["sheet"] == "master" else 1, pid)
        # Each sheet's Sleepy hides its cheeks under its paws and takes its own sheet's median.
        for sheet, pid in (("master", MASTER + "sleepy"), ("expressions", "expressions.expression.sleepy")):
            shown = [r["headWidthCropPx"] for r in records.values() if r["sheet"] == sheet and "headWidthEndsCropPx" in r
                     and PANELS[r["crop"]]["kind"] == "expression"]
            self.assertAlmostEqual(records[pid]["headWidthCropPx"], float(np.median(shown)), places=2)
        # An open eye is about three times a crescent, on either sheet, in square points.
        for opened, closed in ((MASTER + "happy", MASTER + "content"), (HAPPY, "expressions.expression.laughing")):
            ratio = records[opened]["shapesPt2"]["eye.L"]["areaPt2"] / records[closed]["shapesPt2"]["eye.L"]["areaPt2"]
            self.assertGreater(ratio, 2.5, (opened, closed))
        # A smile has no open part; an open mouth is mostly open.
        self.assertEqual(records[MASTER + "content"]["shapesPt2"]["mouth"]["openPt2"], 0.0)
        happy = records[MASTER + "happy"]["shapesPt2"]["mouth"]
        self.assertGreater(happy["openPt2"], 0.7 * happy["areaPt2"])

    def test_only_expression_panels_judge_a_face(self):
        # The master sheet's row of expressions, yes; its features, shapes or turnaround, never.
        for pid in ("master.feature.blush-cheeks", "master.turnaround.front"):
            with self.subTest(panel=pid):
                def plant(plan):
                    plan["panels"][pid] = copy.deepcopy(plan["panels"][HAPPY])
                    plan["presets"]["happy"]["beside"].append(pid)
                with self.assertRaisesRegex(ValueError, "expression panel"):
                    build(plant)

    def test_a_preset_with_panels_needs_one_primary_named_once(self):
        def no_primary(plan):
            del plan["presets"]["happy"]["primary"]
        with self.assertRaisesRegex(ValueError, "no primary"):
            build(no_primary)
        with self.assertRaisesRegex(ValueError, "twice"):
            build(lambda plan: plan["presets"]["happy"]["beside"].append(plan["presets"]["happy"]["primary"]))

    def test_a_wink_panel_names_the_eye_that_winks(self):
        with self.assertRaisesRegex(ValueError, "wink"):
            build(lambda plan: plan["panels"][MASTER + "cheeky"]["drawn"].pop("wink"))
        with self.assertRaisesRegex(ValueError, "wink"):
            build(lambda plan: plan["panels"][MASTER + "happy"]["drawn"].update(wink="eye.L"))

    def test_the_scale_agrees_with_the_turnaround(self):
        # Each Happy panel's open eyes, scaled by its own head width, lie about as far apart as the turnaround's: the
        # expression sheet's within 2%, the master sheet's within 4%.
        front = json.loads((sheets.ROOT / "characters/dog/model.json").read_text())["landmarks"]["front"]
        for pid, delta in ((HAPPY, 0.02), (MASTER + "happy", 0.04)):
            record = self.built["records"][pid]
            a = record["anchorsCropPx"]
            spacing = float(np.hypot(*np.subtract(a["eye.L"], a["eye.R"]))) * record["ptPerCropPx"]
            self.assertAlmostEqual(spacing / float(np.hypot(*np.subtract(front["eye.L"], front["eye.R"]))), 1, delta=delta)

    def test_the_masks_leave_out_the_marks(self):
        images = {}
        faces.build("dog", images=images)
        pid = "expressions.expression.excited"
        x0, y0 = PANELS[pid]["box"][:2]
        _, keep = images[pid]
        for x, y, w, h in PLAN["panels"][pid]["remove"]["marks"]:
            self.assertFalse(keep[y - y0:y - y0 + h, x - x0:x - x0 + w].any())
        self.assertGreater(keep.mean(), 0.95)
        with Image.open(sheets.ROOT / "characters/dog/ref/faces" / f"{pid}.png") as mask:
            self.assertTrue(np.array_equal(np.asarray(mask) > 0, keep))


class PlantedTest(unittest.TestCase):
    """A hand anchor planted off its feature, or a head width off the cheeks, fails the run, naming it."""

    def plant(self, pid, change, message):
        def edit(plan):
            change(plan["panels"][pid])
        with self.assertRaisesRegex(ValueError, message):
            build(edit)

    def test_the_nose_placed_on_an_eye_fails(self):
        # The eye taken for the nose is left out of the eyes' search, or found out of order: either way the run fails.
        self.plant(HAPPY, lambda e: e["anchors"].update(nose=e["anchors"]["eye.R"]), "no eye.R near|is not above the nose")

    def test_an_eye_moved_off_its_mark_fails(self):
        self.plant(HAPPY, lambda e: e["anchors"].update({"eye.L": [e["anchors"]["eye.L"][0] + 6, e["anchors"]["eye.L"][1]]}),
                   "eye.L .* px from its feature")

    def test_a_mouth_corner_placed_on_the_cheek_fails(self):
        self.plant(HAPPY, lambda e: e["anchors"].update({"mouth.R": [e["anchors"]["mouth.R"][0] - 15, e["anchors"]["mouth.R"][1]]}),
                   "mouth.R")

    def test_the_head_top_placed_on_an_ear_fails(self):
        self.plant(HAPPY, lambda e: e["anchors"].update({"head.top": [64, 120]}), "head.top")

    def test_a_head_width_off_the_cheeks_widest_row_fails(self):
        # Across the eyes the run stops at the patches: far short of the cheeks' widest.
        self.plant(HAPPY, lambda e: e.update(headWidth=[[88, 172], [205, 148]]), "head's width")

    def test_an_anchor_in_a_left_out_box_fails(self):
        self.plant("expressions.expression.excited", lambda e: e["remove"]["marks"].append([400, 160, 20, 20]), "left-out box")


if __name__ == "__main__":
    unittest.main()
