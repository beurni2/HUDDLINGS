"""Tests for the Faces check (spec section 5b, The sheet match: Faces, L525).
Until the face library is drawn there is no face clip to render, so each panel
itself is carried into a still the way a render arrives (upright, in model
points, its nose where the turnaround's front nose is) and must pass against
its own record, and the same still with a fault planted (an eye moved 3 pt, a
mouth corner moved 3 pt, the nose moved, the wrong panel) must fail.

    python3 -m unittest discover -s characters/sheetmatch -p test_facematch.py -v"""
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from scipy import ndimage

import facematch
import match

faces, sheets = facematch.faces, match.sheets
MODEL = json.loads((sheets.ROOT / "characters/dog/model.json").read_text())
PPP = 3.0  # still pixels per point, the look loop's
TOLERANCE = match.LANDMARK_SHARE * MODEL["proportions"]["headWidth"]


class PanelStill:
    """A panel as a still: its pixels, the left-out boxes in the card's colour, carried into model space by its
    record's scale and roll, its face left at the front view's own roll as a render's is, with its nose (or, with no
    face, its head top) on the turnaround's front landmark, opaque over the panel. Faults are planted in the still's
    own pixels, as a drawing's would be."""

    def __init__(self, pid, ppp=PPP):
        self.panel = facematch.Panel("dog", MODEL, pid)
        panel = self.panel
        self.pin = "nose" if "nose" in panel.anchors else "head.top"
        self.origin = panel.origin(self.pin, MODEL["landmarks"]["front"][self.pin])
        h, w = panel.crop.shape[:2]
        corners = np.array([[0, 0], [w, 0], [0, h], [w, h]], float)
        q = (corners - self.origin) @ facematch.rotation(-panel.turn).T * panel.k
        low, high = q.min(axis=0) - 2, q.max(axis=0) + 2
        size = np.ceil((high - low) * ppp).astype(int)
        self.ppp, self.root = ppp, -low * ppp
        vs, us = np.mgrid[:size[1], :size[0]]
        model = np.stack([(us + 0.5 - self.root[0]) / ppp, (vs + 0.5 - self.root[1]) / ppp], axis=-1)
        crop = model @ facematch.rotation(panel.turn).T / panel.k + self.origin
        self.crop_at = crop  # each still pixel's place on the panel, continuous crop pixels
        inside = (crop[..., 0] >= 0) & (crop[..., 1] >= 0) & (crop[..., 0] < w) & (crop[..., 1] < h)
        coords = [crop[..., 1].ravel() - 0.5, crop[..., 0].ravel() - 0.5]
        self.rgb = np.stack([ndimage.map_coordinates(panel.shown[..., c].astype(float), coords, order=1, mode="nearest")
                             .reshape(inside.shape) for c in range(3)], axis=-1)
        self.alpha = inside.astype(float)
        self.part = np.where(inside, 0, -1)
        self.names = ["head.base"]

    def still(self, clip="face_fixture"):
        meta = {"species": "dog", "still": "panel", "clip": clip, "views": {"body": "front", "head": "front"},
                "ppp": self.ppp, "sizePx": [self.alpha.shape[1], self.alpha.shape[0]], "rootPx": [float(v) for v in self.root],
                "parts": {n: {"id": c, "bone": "head"} for n, c in zip(self.names, ("#808080", "#20A040", "#A02040", "#2040A0"))},
                "drawn": list(self.names)}
        return match.Still(meta, self.alpha, self.rgb / 255 * self.alpha[..., None], self.part)

    def feature(self, name):
        """A feature's mark on the panel (faces.py's rules), as the still's pixels it covers, grown by a pixel."""
        panel = self.panel
        _, masks = faces.find_face(panel.shown, np.ones(panel.keep.shape, bool), {n: list(p) for n, p in panel.anchors.items()},
                                   panel.width_px, panel.roll)
        mark = masks[name]
        x = np.clip(np.floor(self.crop_at[..., 0]).astype(int), 0, mark.shape[1] - 1)
        y = np.clip(np.floor(self.crop_at[..., 1]).astype(int), 0, mark.shape[0] - 1)
        return ndimage.binary_dilation(mark[y, x] & (self.alpha > 0), iterations=2)

    def move(self, mask, dx_pt, dy_pt=0.0):
        """Moves the pixels of a mask by whole still pixels, the place they left filled with the fur around them."""
        dx, dy = int(round(dx_pt * self.ppp)), int(round(dy_pt * self.ppp))
        ring = ndimage.binary_dilation(mask, iterations=4) & ~ndimage.binary_dilation(mask, iterations=2)
        fur = np.median(self.rgb[ring], axis=0)
        moved = match.shifted(mask, dx, dy)
        colours = np.roll(self.rgb, (dy, dx), axis=(0, 1))
        self.rgb[mask] = fur
        self.rgb[moved] = colours[moved]

    def label(self, mask, name):
        """Gives the mask's pixels a part of their own, as a drawing's ID pass would."""
        if name not in self.names:
            self.names.append(name)
        self.part[mask] = self.names.index(name)


def own(pid, preset=None, plant=None):
    """A panel's still checked against its own record for one of its presets, after an optional plant(fixture)."""
    fixture = PanelStill(pid)
    if plant:
        plant(fixture)
    panel = facematch.Panel("dog", MODEL, pid)
    preset = preset or panel.rec["presets"][0]
    row, *_ = facematch.check_panel(fixture.still(), panel, preset, MODEL["landmarks"]["front"], TOLERANCE)
    return row


class OwnPanelTest(unittest.TestCase):
    """Each panel fed through as a render passes against its own record, every eye, nose and mouth anchor within half a
    point (a sixth of the tolerance) after two resamplings, up to the still and back onto the panel."""

    def test_each_panel_as_its_own_render_passes(self):
        for pid, rec in MODEL["faceCrops"].items():
            for preset in rec["presets"]:
                with self.subTest(panel=pid, preset=preset):
                    row = own(pid, preset)
                    self.assertTrue(row["pass"], json.dumps(row)[:1500])
                    self.assertEqual(sorted(row["heldTo"]), sorted(rec["gates"][preset]))
                    for name, r in row["rows"].items():
                        self.assertNotIn("missing", r, name)
                        if name != "head.top":
                            self.assertLessEqual(r["errPt"], 0.5, f"{name}: {r}")

    def test_the_render_is_pinned_at_the_nose_wherever_it_lies(self):
        # Moved 10 pt right and 10 pt down as a whole, the face is the same face: the nose places it.
        def shift(fixture):
            fixture.root = fixture.root + 10 * fixture.ppp
        row = own("expressions.expression.happy", "happy", shift)
        self.assertTrue(row["pass"], json.dumps(row)[:1500])
        self.assertAlmostEqual(float(np.hypot(*row["alignment"]["shiftFromModelPt"])), 10 * np.sqrt(2), delta=1.0)


class PlantedTest(unittest.TestCase):
    """The panel's own still with one fault planted, which must fail."""

    def test_an_eye_moved_3_pt_fails_and_2_pt_passes(self):
        for pid in ("expressions.expression.happy", "expressions.expression.excited"):  # an open eye and a crescent
            for moved, fails in ((3.0, True), (2.0, False)):
                with self.subTest(panel=pid, moved_pt=moved):
                    row = own(pid, plant=lambda f: f.move(f.feature("eye.L"), moved))
                    r = row["rows"]["eye.L"]
                    self.assertAlmostEqual(r["errPt"], moved, delta=0.35)
                    self.assertEqual(r["pass"], not fails)
                    self.assertEqual(row["pass"], not fails)

    def test_a_mouth_corner_moved_3_pt_fails_where_the_mouth_is_held(self):
        def corner(fixture):
            mouth = fixture.feature("mouth")
            xs = np.nonzero(mouth)[1]
            near = mouth & (np.arange(mouth.shape[1])[None, :] <= xs.min() + 0.25 * np.ptp(xs))
            fixture.move(near, -3.0)
        row = own("expressions.expression.happy", "happy", corner)
        self.assertFalse(row["rows"]["mouth.R"]["pass"])
        self.assertAlmostEqual(row["rows"]["mouth.R"]["errPt"], 3.0, delta=0.6)
        self.assertTrue(row["rows"]["mouth.L"]["pass"])
        self.assertFalse(row["pass"])
        # neutral's mouth is the smile, which the Happy panel does not draw: reported, not held.
        row = own("expressions.expression.happy", "neutral", corner)
        self.assertFalse(row["rows"]["mouth.R"]["held"])
        self.assertGreater(row["rows"]["mouth.R"]["errPt"], TOLERANCE)
        self.assertTrue(row["pass"])

    def test_a_nose_moved_3_pt_fails_the_face_it_places(self):
        row = own("expressions.expression.surprised", plant=lambda f: f.move(f.feature("nose"), 0.0, 3.0))
        self.assertFalse(row["pass"])
        self.assertTrue(all(not row["rows"][n]["pass"] for n in ("eye.R", "eye.L")))

    def test_the_wrong_panel_fails(self):
        fixture = PanelStill("expressions.expression.happy")
        result, _ = facematch.check("dog", fixture.still("face_excited"))
        self.assertEqual(list(result["records"]), ["expressions.expression.excited"])
        self.assertFalse(result["pass"])
        failed = {n for n, r in result["records"]["expressions.expression.excited"]["rows"].items() if not r["pass"]}
        self.assertTrue({"eye.R", "eye.L"} & failed, failed)

    def test_a_feature_is_found_among_its_own_parts(self):
        # The eye moved 16 pt and a dark spot of some other part left where it was: with the eye named in the ID pass,
        # the eye is found where it went and fails; read from the pixels alone, the spot would pass for it.
        def plant(fixture, named):
            eye = fixture.feature("eye.L")
            fixture.move(eye, 16.0)
            ys, xs = np.nonzero(eye)
            vv, uu = np.mgrid[:eye.shape[0], :eye.shape[1]]
            fixture.rgb[(uu - xs.mean()) ** 2 + (vv - ys.mean()) ** 2 <= (2.5 * fixture.ppp) ** 2] = (32, 12, 2)
            if named:
                fixture.label(match.shifted(eye, int(round(16 * fixture.ppp)), 0), "eye.L")
        named = own("expressions.expression.happy", plant=lambda f: plant(f, True))["rows"]["eye.L"]
        self.assertAlmostEqual(named["errPt"], 16.0, delta=0.5)
        self.assertFalse(named["pass"])
        unnamed = own("expressions.expression.happy", plant=lambda f: plant(f, False))["rows"]["eye.L"]
        self.assertLess(unnamed["errPt"], 1.0)
        self.assertTrue(unnamed["pass"])


class CommandTest(unittest.TestCase):
    def write(self, folder, fixture, clip):
        still = fixture.still(clip)
        folder.mkdir(parents=True, exist_ok=True)
        premult = still.premult * 255
        sheets.save_png(folder / "white.png", np.round(premult + (1 - still.alpha[..., None]) * 255).astype(np.uint8))
        sheets.save_png(folder / "black.png", np.round(premult).astype(np.uint8))
        ids = np.zeros(premult.shape, np.uint8)
        for index, name in enumerate(fixture.names):
            ids[still.part == index] = sheets.hex_to_rgb(still.meta["parts"][name]["id"])
        sheets.save_png(folder / "ids.png", ids)
        (folder / "still.json").write_text(json.dumps(still.meta))

    def test_the_command_writes_its_evidence_and_exits_by_its_verdict(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            passing = PanelStill("expressions.expression.laughing")
            self.write(tmp / "pass", passing, "face_laughing")
            failing = PanelStill("expressions.expression.laughing")
            failing.move(failing.feature("eye.R"), 3.0)
            self.write(tmp / "fail", failing, "face_laughing")
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(facematch.main(["dog", "--still", str(tmp / "pass"), "--out", str(tmp / "out-pass")]), 0)
                self.assertEqual(facematch.main(["dog", "--still", str(tmp / "fail"), "--out", str(tmp / "out-fail")]), 1)
            for name in ("out-pass", "out-fail"):
                self.assertTrue((tmp / name / "beside.png").exists())
                result = json.loads((tmp / name / "match.json").read_text())
                self.assertEqual(result["preset"], "laughing")
                self.assertEqual(result["thresholds"]["landmarkPt"], round(TOLERANCE, 2))
            self.assertEqual(json.loads((tmp / "out-fail" / "match.json").read_text())["failed"], ["expressions.expression.laughing"])
            # An error is 2 and leaves no verdict: a still that is not a face clip, and no still at all.
            self.write(tmp / "notface", passing, "still_front")
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(facematch.main(["dog", "--still", str(tmp / "notface"), "--out", str(tmp / "out-pass")]), 2)
                self.assertEqual(facematch.main(["dog", "--still", str(tmp / "none"), "--out", str(tmp / "out-pass")]), 2)
            self.assertFalse((tmp / "out-pass" / "match.json").exists())

    def test_a_preset_no_panel_holds_is_judged_by_eye(self):
        result, parts = facematch.check("dog", PanelStill("expressions.expression.proud").still("face_content"))
        self.assertEqual((result["records"], result["held"], result["pass"]), ({}, 0, True))
        self.assertIn("judged by eye", result["note"])
        result, parts = facematch.check("dog", PanelStill("expressions.ears.lifted-slightly").still("face_listening"))
        self.assertEqual((list(result["records"]), result["held"]), (["expressions.ears.lifted-slightly"], 0))
        self.assertIn("BY EYE", facematch.verdict(result))
        with tempfile.TemporaryDirectory() as tmp:
            facematch.beside_image(result, parts, Path(tmp) / "beside.png")
            self.assertTrue((Path(tmp) / "beside.png").exists())

    def test_a_still_in_another_view_is_an_error(self):
        still = PanelStill("expressions.expression.happy").still("face_happy")
        still.meta["views"] = {"body": "side.L", "head": "side.L"}
        with self.assertRaises(ValueError):
            facematch.check("dog", still)


class RecordsTest(unittest.TestCase):
    def test_no_face_crop_names_a_face_rule_r3_forbids(self):
        panels = {p["id"]: p for p in json.loads((sheets.ROOT / "characters/dog/ref/panels.json").read_text())["panels"]}
        for pid, rec in MODEL["faceCrops"].items():
            self.assertFalse(faces.forbidden(panels[pid]), pid)
            self.assertTrue(set(rec["presets"]) <= set(faces.PRESETS), pid)
            for name in ("sad", "angry", "pout", "drooped"):
                self.assertNotIn(name, pid)

    def test_thresholds_are_recorded(self):
        # Every numeric constant of the check and of the rules it measures with is in match.json, but the images' zoom
        # and faces.py's checks of the hand-written records.
        recorded = facematch.thresholds(MODEL["proportions"]["headWidth"])
        self.assertEqual(recorded["landmarkShareOfHead"], match.LANDMARK_SHARE)
        self.assertEqual(recorded["landmarkPt"], round(TOLERANCE, 2))
        values = [v for v in recorded.values() if not isinstance(v, list)]
        values += [x for v in recorded.values() if isinstance(v, list) for x in v]
        for module, skip in ((facematch, {"ZOOM"}), (faces, {"ZOOM", "SNAP_PX", "WIDEST_SHARE"})):
            for name, value in vars(module).items():
                if name.isupper() and isinstance(value, (int, float)) and name not in skip:
                    self.assertIn(value, values, f"{module.__name__}.{name}")
        self.assertEqual(recorded["softL"], list(faces.SOFT_L))


if __name__ == "__main__":
    unittest.main()
