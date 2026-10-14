"""Tests for the copy lint, written from rule R7 and spec sections 6, 16 and 20.

    python3 -m unittest discover -s tools/copylint
"""

import json
import tempfile
import unittest
from pathlib import Path

import copylint
import spec_catalogue


def rules(text, surfaces=("app",)):
    return [rule for rule, _ in copylint.lint_text(text, surfaces)]


class BannedWords(unittest.TestCase):
    def test_every_r7_word_fails(self):
        for word in copylint.BANNED:
            with self.subTest(word=word):
                self.assertIn("R7", rules(f"{{mochi}} says {word} today."))

    def test_case_is_ignored(self):
        for text in ["SAD news", "Sad", "Last Chance to play", "WAITING FOR YOU here"]:
            with self.subTest(text=text):
                self.assertIn("R7", rules(text))

    def test_phrases_match_across_spaces_and_line_breaks(self):
        self.assertIn("R7", rules("last   chance"))
        self.assertIn("R7", rules("waiting\nfor you"))

    def test_whole_words_only(self):
        for text in ["Mississippi", "studied", "dieter", "saddle", "hurrah", "deadline-free"]:
            with self.subTest(text=text):
                # "deadline" is one word, so "dead" inside it does not match.
                self.assertEqual([], [r for r in rules(text) if r.startswith("R7")])

    def test_hyphenated_compounds_still_match(self):
        self.assertIn("R7", rules("a die-hard fan"))

    def test_other_forms_fail_too(self):
        for text in ["{mochi} misses you", "it died", "hurrying home", "Don't forget", "two streaks", "sadly"]:
            with self.subTest(text=text):
                self.assertIn("R7 (other form)", rules(text))

    def test_banned_words_inside_placeholders_are_not_copy(self):
        # A placeholder is replaced at runtime; only the literal copy is linted.
        self.assertNotIn("placeholder", rules("{name} laughed."))


class ExclamationMarks(unittest.TestCase):
    def test_any_exclamation_mark_fails(self):
        for text in ["Hello, friend!", "¡Hola", "Yay！", "Wow‼", "What⁉", "Hi❗"]:
            with self.subTest(text=text):
                self.assertIn("R7", rules(text))

    def test_reported_once_per_string(self):
        self.assertEqual(1, rules("Hi! Hello! Hey!").count("R7"))


class Notifications(unittest.TestCase):
    N = ("notification",)

    def test_energy_words_fail_only_in_notifications(self):
        for text in ["{mochi} is hungry", "{mochi} is getting peckish.", "Low energy",
                     "Feed it first", "Throw it a treat", "{mochi}'s treats", "{mochi} was fed"]:
            with self.subTest(text=text):
                self.assertIn("notification", rules(text, self.N))
                self.assertNotIn("notification", rules(text, ("app",)))

    def test_canonical_notifications_pass(self):
        for text in ["{visitor} is here with something from {sender}",
                     "Something came home from {name}", "Something came home from your link"]:
            with self.subTest(text=text):
                self.assertEqual([], rules(text, self.N))

    def test_only_names_in_notifications(self):
        self.assertIn("notification", rules("{visitor} arrives at {time}", self.N))
        self.assertIn("notification", rules("{scene} from {sender}", self.N))


class Names(unittest.TestCase):
    def test_literal_mochi_fails(self):
        for text in ["Mochi is hungry", "Boop Mochi's nose", "MOCHI", "with mochi"]:
            with self.subTest(text=text):
                self.assertIn("names", rules(text))

    def test_feature_names_pass(self):
        for text in ["Mochi Post is paused for your account.", "Mochi Cam films video with sound.",
                     "Mochi Treats", "Film with Mochi", "to film with Mochi Cam when you open it."]:
            with self.subTest(text=text):
                self.assertNotIn("names", rules(text))

    def test_the_placeholder_passes(self):
        self.assertEqual([], rules("Boop {mochi}'s nose"))

    def test_a_feature_name_does_not_excuse_another_mochi(self):
        self.assertIn("names", rules("Mochi Post: Mochi is on the way"))


class Placeholders(unittest.TestCase):
    def test_every_section_20_placeholder_is_known(self):
        text = " ".join("{%s}" % p for p in sorted(copylint.PLACEHOLDERS))
        self.assertNotIn("placeholder", rules(text))

    def test_unknown_placeholders_fail(self):
        for text in ["{mocha} is here", "{Name} laughed.", "{}", "{friend}"]:
            with self.subTest(text=text):
                self.assertIn("placeholder", rules(text))

    def test_infoplist_copy_has_no_placeholders(self):
        self.assertIn("infoplist", rules("{mochi} uses the microphone", ("infoplist",)))
        self.assertEqual([], rules("Huddlings saves to Photos only when you tap a Save button.", ("infoplist",)))

    def test_lock_screen_never_shows_a_friends_name(self):
        self.assertIn("lockscreen", rules("{sender}'s {visitor} is here", ("widget", "lockscreen")))
        self.assertEqual([], rules("A visitor is here", ("widget", "lockscreen")))


class Loaders(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_xcstrings_values_and_bare_keys_are_read(self):
        path = self.dir / "Localizable.xcstrings"
        path.write_text(json.dumps({
            "sourceLanguage": "en",
            "strings": {
                "home.hint.boop": {"localizations": {"en": {"stringUnit": {"state": "translated", "value": "Boop Mochi's nose!"}}}},
                "Hurry up": {},
                "push.visitor": {"localizations": {"en": {"stringUnit": {"state": "translated", "value": "Feed {visitor}"}}}},
                "debug.only": {"shouldTranslate": False, "localizations": {"en": {"stringUnit": {"value": "sad"}}}},
            },
        }), encoding="utf-8")
        count, problems = copylint.lint_paths([path])
        self.assertEqual(3, count)
        found = {(p.entry.key, p.rule) for p in problems}
        self.assertIn(("home.hint.boop", "names"), found)
        self.assertIn(("home.hint.boop", "R7"), found)
        self.assertIn(("Hurry up", "R7"), found)
        self.assertIn(("push.visitor", "notification"), found)

    def test_xcstrings_plural_variations_are_read(self):
        path = self.dir / "Localizable.xcstrings"
        path.write_text(json.dumps({"sourceLanguage": "en", "strings": {"k": {"localizations": {"en": {
            "variations": {"plural": {"one": {"stringUnit": {"value": "ok"}},
                                      "other": {"stringUnit": {"value": "so sad"}}}}}}}}}), encoding="utf-8")
        _, problems = copylint.lint_paths([path])
        self.assertEqual(["R7"], [p.rule for p in problems])

    def test_infoplist_strings_in_utf16_are_read(self):
        path = self.dir / "InfoPlist.strings"
        path.write_text('/* comment */\n"NSMicrophoneUsageDescription" = "{mochi} listens \\"only\\" when you tap — promise";\n',
                        encoding="utf-16")
        count, problems = copylint.lint_paths([path])
        self.assertEqual(1, count)
        self.assertEqual({"infoplist"}, {p.rule for p in problems})
        entry = copylint.load(path)[0]
        self.assertEqual('{mochi} listens "only" when you tap — promise', entry.text)

    def test_discover_finds_copy_files_and_skips_vendored_ones(self):
        (self.dir / "copy").mkdir()
        (self.dir / "copy" / "catalogue.json").write_text('{"strings": {}}', encoding="utf-8")
        (self.dir / "ios" / "App").mkdir(parents=True)
        (self.dir / "ios" / "App" / "Localizable.xcstrings").write_text('{"strings": {}}', encoding="utf-8")
        (self.dir / "ios" / "App" / "InfoPlist.strings").write_text("", encoding="utf-8")
        (self.dir / "web" / "node_modules" / "x").mkdir(parents=True)
        (self.dir / "web" / "node_modules" / "x" / "a.strings").write_text("", encoding="utf-8")
        (self.dir / "web" / "package.json").write_text("{}", encoding="utf-8")
        found = {p.relative_to(self.dir).as_posix() for p in copylint.discover(self.dir)}
        self.assertEqual({"copy/catalogue.json", "ios/App/Localizable.xcstrings", "ios/App/InfoPlist.strings"}, found)

    def test_main_fails_the_build_on_a_problem(self):
        path = self.dir / "Localizable.xcstrings"
        path.write_text(json.dumps({"strings": {"Last chance": {}}}), encoding="utf-8")
        self.assertEqual(1, copylint.main([str(path)]))


class TheRepositorysCopy(unittest.TestCase):
    """The catalogue in the repository: complete, faithful to the spec, and clean."""

    def setUp(self):
        self.spec = spec_catalogue.SPEC.read_text(encoding="utf-8")
        self.catalogue = json.loads(spec_catalogue.CATALOGUE.read_text(encoding="utf-8"))

    def test_catalogue_matches_the_spec(self):
        self.assertEqual(spec_catalogue.derive(self.spec), self.catalogue,
                         "copy/catalogue.json drifted from the spec; run tools/copylint/spec_catalogue.py --write")

    def test_every_catalogue_text_is_in_the_spec(self):
        for key, item in self.catalogue["strings"].items():
            if key == "settings.hears.bodyCam":
                continue  # composed from two spec sentences; checked below
            with self.subTest(key=key):
                self.assertIn(item["text"], self.spec)

    def test_bodycam_replaces_only_the_first_sentence(self):
        strings = self.catalogue["strings"]
        body, cam = strings["settings.hears.body"]["text"], strings["settings.hears.bodyCam"]["text"]
        self.assertEqual(body.split(". ", 1)[1], cam.split(". ", 1)[1])
        self.assertIn("or in Mochi Cam.", cam)

    def test_section_20_is_fully_covered(self):
        for key in ["hatch.choose", "age.under13", "push.visitor", "push.homeLink", "perm.mic",
                    "widget.visitorLock", "cam.needAccess", "report.reasons.hurtful", "prop.nextTime",
                    "preview.hungry", "treats.hint.banana", "treats.keepsake.banana", "hatch.traits.rabbit"]:
            with self.subTest(key=key):
                self.assertIn(key, self.catalogue["strings"])
        self.assertEqual(6, sum(k.startswith("preview.") for k in self.catalogue["strings"]))
        self.assertEqual(12, sum(k.startswith("treats.hint.") for k in self.catalogue["strings"]))

    def test_surfaces_follow_the_keys(self):
        strings = self.catalogue["strings"]
        for key, item in strings.items():
            with self.subTest(key=key):
                if key.startswith("push."):
                    self.assertEqual(["notification"], item["surfaces"])
                if key.startswith("perm."):
                    self.assertEqual(["infoplist"], item["surfaces"])
                if key.endswith("Lock"):
                    self.assertIn("lockscreen", item["surfaces"])

    def test_the_repository_is_clean(self):
        count, problems = copylint.lint_paths(copylint.discover(copylint.ROOT))
        self.assertGreater(count, 250)
        self.assertEqual([], [str(p) for p in problems])


if __name__ == "__main__":
    unittest.main()
