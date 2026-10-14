"""Tests for the E1 check: a sheet copied into a build is caught, re-encoded,
cropped or compiled into an asset catalogue, and a clean build passes."""
import hashlib
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from PIL import Image

import no_sheet_pixels


def only_the_icon(car):
    return [("AppIcon", "Icon Image"), ("AppIcon", "MultiSized Image"), ("AccentColor", "Color")]


class NoSheetPixels(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = Path(self.tmp.name) / "Huddlings.app"
        self.package = self.app / "characters" / "test"
        self.package.mkdir(parents=True)
        (self.package / "atlas@2x-0.png").write_bytes(b"\x89PNG a page")
        (self.package / "rig.json").write_text("{}")
        files = {name: hashlib.sha256((self.package / name).read_bytes()).hexdigest() for name in ["atlas@2x-0.png", "rig.json"]}
        (self.package / "package.json").write_text(json.dumps({"files": files}))
        (self.app / "AppIcon60x60@2x.png").write_bytes(b"\x89PNG an icon")
        (self.app / "Assets.car").write_bytes(b"car")
        self.sheet = next(p for p in no_sheet_pixels.sheet_files() if p.suffix == ".jpg")

    def tearDown(self):
        self.tmp.cleanup()

    def check(self, builds=None):
        return no_sheet_pixels.check(builds or [self.app], catalogue_names=only_the_icon)

    def test_the_sheets_are_found(self):
        self.assertGreaterEqual(len([p for p in no_sheet_pixels.sheet_files() if p.suffix != ".md"]), 16)

    def test_a_clean_build_passes(self):
        self.assertEqual([], self.check())

    def test_a_copied_sheet_is_caught_whatever_its_name(self):
        shutil.copy(self.sheet, self.package / "innocent.jpg")
        problems = self.check()
        self.assertTrue(any("innocent.jpg" in p and self.sheet.name in p for p in problems), problems)

    def test_a_re_encoded_or_cropped_sheet_is_caught(self):
        with Image.open(self.sheet) as image:
            image.save(self.package / "page.png")
            image.crop((0, 0, image.width // 2, image.height // 2)).save(self.app / "crop.png")
        problems = self.check()
        self.assertTrue(any("characters/test/page.png: an image no character package lists" in p for p in problems), problems)
        self.assertTrue(any("crop.png: an image no character package lists" in p for p in problems), problems)

    def test_a_listed_page_that_changed_is_caught(self):
        (self.package / "atlas@2x-0.png").write_bytes(b"\x89PNG another page")
        self.assertTrue(any("differs from the one its package lists" in p for p in self.check()))

    def test_only_the_bundle_root_may_hold_app_icons(self):
        (self.package / "AppIcon-sheet.png").write_bytes(b"x")
        self.assertTrue(any("AppIcon-sheet.png" in p for p in self.check()))

    def test_an_asset_catalogue_may_hold_only_the_app_icon(self):
        problems = no_sheet_pixels.check([self.app], catalogue_names=lambda car: only_the_icon(car) + [("master", "Image")])
        self.assertTrue(any("Assets.car: holds Image 'master'" in p for p in problems), problems)

    def test_an_asset_catalogue_that_cannot_be_read_fails(self):
        def unreadable(car):
            raise RuntimeError("needs xcrun assetutil (a Mac) to read it")
        problems = no_sheet_pixels.check([self.app], catalogue_names=unreadable)
        self.assertTrue(any("Assets.car: could not be read" in p for p in problems), problems)

    def test_an_archive_is_checked_inside(self):
        archive = Path(self.tmp.name) / "Huddlings.xcarchive"
        shutil.copytree(self.app, archive / "Products" / "Applications" / "Huddlings.app")
        self.assertEqual([], self.check([archive]))
        Image.new("RGB", (8, 8)).save(archive / "Products" / "Applications" / "Huddlings.app" / "stray.png")
        self.assertTrue(any("stray.png" in p for p in self.check([archive])))

    def test_a_folder_named_like_the_sheets_is_caught(self):
        (self.app / "reference").mkdir()
        (self.app / "reference" / "x.txt").write_bytes(b"x")
        self.assertTrue(self.check())

    def test_a_missing_build_fails(self):
        self.assertTrue(self.check([Path(self.tmp.name) / "nope"]))


class PackageInApp(unittest.TestCase):
    def test_changed_and_missing_files_are_caught(self):
        import hashlib
        import json
        import package_in_app
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / "Huddlings.app" / "characters" / "test"
            folder.mkdir(parents=True)
            (folder / "atlas@2x-0.png").write_bytes(b"page")
            files = {"atlas@2x-0.png": hashlib.sha256(b"page").hexdigest(), "rig.json": "0" * 64}
            (folder / "package.json").write_text(json.dumps({"files": files}))
            problems = package_in_app.check(Path(tmp) / "Huddlings.app")
            self.assertEqual(["test/rig.json: missing from the app"], problems)
            (folder / "atlas@2x-0.png").write_bytes(b"recompressed")
            self.assertIn("test/atlas@2x-0.png: its bytes changed on the way into the app", package_in_app.check(Path(tmp) / "Huddlings.app"))
            self.assertTrue(package_in_app.check(Path(tmp) / "Empty.app"))

if __name__ == "__main__":
    unittest.main()
