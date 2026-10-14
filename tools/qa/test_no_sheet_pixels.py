"""Tests for the E1 check: a sheet copied into a build is caught, a clean build passes."""
import shutil
import tempfile
import unittest
from pathlib import Path

import no_sheet_pixels


class NoSheetPixels(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = Path(self.tmp.name) / "Huddlings.app"
        (self.app / "Characters" / "test").mkdir(parents=True)
        (self.app / "Characters" / "test" / "atlas@2x-0.png").write_bytes(b"\x89PNG not a sheet")

    def tearDown(self):
        self.tmp.cleanup()

    def test_the_sheets_are_found(self):
        self.assertGreaterEqual(len([p for p in no_sheet_pixels.sheet_files() if p.suffix != ".md"]), 16)

    def test_a_clean_build_passes(self):
        self.assertEqual([], no_sheet_pixels.check([self.app]))

    def test_a_copied_sheet_is_caught_whatever_its_name(self):
        sheet = next(p for p in no_sheet_pixels.sheet_files() if p.suffix != ".md")
        shutil.copy(sheet, self.app / "Characters" / "test" / "innocent.png")
        problems = no_sheet_pixels.check([self.app])
        self.assertTrue(any("innocent.png" in p and str(sheet.name) in p for p in problems), problems)

    def test_a_folder_named_like_the_sheets_is_caught(self):
        (self.app / "reference").mkdir()
        (self.app / "reference" / "x.png").write_bytes(b"x")
        self.assertTrue(no_sheet_pixels.check([self.app]))

    def test_a_missing_build_fails(self):
        self.assertTrue(no_sheet_pixels.check([Path(self.tmp.name) / "nope"]))




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
