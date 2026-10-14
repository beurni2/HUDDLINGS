"""Tests for the copy lint, written from rule R7 and spec sections 6, 16 and 20.

    python3 -m unittest discover -s tools/copylint
"""

import contextlib
import io
import json
import os
import plistlib
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import copylint
import spec_catalogue


def rules(text, surfaces=("app",)):
    return [rule for rule, _ in copylint.lint_text(text, surfaces)]


def quiet_main(argv):
    with contextlib.redirect_stdout(io.StringIO()):
        return copylint.main(argv)


class BannedWords(unittest.TestCase):
    def test_every_r7_word_fails(self):
        for word in copylint.BANNED:
            with self.subTest(word=word):
                self.assertIn("R7", rules(f"{{mochi}} says {word} today."))

    def test_case_is_ignored(self):
        for text in ["SAD news", "Sad", "Last Chance to play", "WAITING FOR YOU here"]:
            with self.subTest(text=text):
                self.assertIn("R7", rules(text))

    def test_phrases_match_across_spaces_line_breaks_and_hyphens(self):
        for text in ["last   chance", "waiting\nfor you", "last\u00a0chance", "a last-chance trip", "waiting‑for‑you"]:
            with self.subTest(text=text):
                self.assertIn("R7", rules(text))

    def test_whole_words_only(self):
        for text in ["Mississippi", "studied", "dieter", "saddle", "hurrah", "deadline-free", "Mission complete"]:
            with self.subTest(text=text):
                self.assertEqual([], [r for r in rules(text) if r.startswith("R7")])

    def test_hyphenated_compounds_still_match(self):
        self.assertIn("R7", rules("a die-hard fan"))

    def test_invisible_and_compatibility_characters_do_not_hide_a_word(self):
        for text in ["so s\u00adad", "{mochi} will m\u200biss you", "wait\u2060ing for you", "ＳＡＤ", "s\ufeffad",
                     "s\u034fad", "s\ufe0fad", "s\ufe00ad", "s\u180bad", "s\U000e0100ad", "s\u3164ad", "s\u1160ad"]:
            with self.subTest(text=text):
                self.assertIn("R7", rules(text))

    def test_other_forms_fail_too(self):
        for text in ["{mochi} misses you", "it died", "hurrying home", "Don't forget", "two streaks", "sadly"]:
            with self.subTest(text=text):
                self.assertIn("R7 (other form)", rules(text))


class ExclamationMarks(unittest.TestCase):
    def test_any_exclamation_mark_fails(self):
        for text in ["Hello, friend!", "¡Hola", "Yay！", "Wow‼", "What⁉", "Hi❗", "Really‽", "Hugs ❣\ufe0f", "Hi﹗", "Huh⁈"]:
            with self.subTest(text=text):
                self.assertIn("R7", rules(text))

    def test_reported_once_per_string(self):
        self.assertEqual(1, rules("Hi! Hello! Hey!").count("R7"))


class Notifications(unittest.TestCase):
    N = ("notification",)

    def test_energy_words_fail_only_in_notifications(self):
        for text in ["{mochi} is hungry", "{mochi} is getting peckish.", "Low energy", "Feed it first",
                     "Throw it a treat", "{mochi}'s treats", "{mochi} was fed", "{visitor} feels hunger",
                     "{visitor} is energetic"]:
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
        for text in ["Mo\u034fchi is here", "Mochi is hungry", "Boop Mochi's nose", "Boop Mochi’s nose", "MOCHI", "with mochi",
                     "Say hi to all the Mochis", "Open the Mochi Camera", "Mochi Postcard", "mochi post"]:
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
        for text in ["{mocha} is here", "{Name} laughed.", "{}", "{friend}",
                     "{visitor is here with something from {sender}", "On the way to {name \u00b7 {time}",
                     "Something came home from {name}}"]:
            with self.subTest(text=text):
                self.assertIn("placeholder", rules(text))

    def test_printf_specifiers_fail(self):
        for text in ["%@ uses the microphone", "%1$@'s %2$@ is here", "%lld friends", "%#@count@ visits", "%d"]:
            with self.subTest(text=text):
                self.assertIn("placeholder", rules(text))

    def test_a_percent_sign_in_prose_passes(self):
        self.assertEqual([], rules("50% of the way there"))

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

    def write(self, rel, content):
        path = self.dir / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, bytes):
            path.write_bytes(content)
        else:
            path.write_text(content, encoding="utf-8")
        return path

    def test_xcstrings_values_bare_keys_and_dont_translate_strings_are_read(self):
        path = self.write("Localizable.xcstrings", json.dumps({
            "sourceLanguage": "en",
            "strings": {
                "home.hint.boop": {"localizations": {"en": {"stringUnit": {"state": "translated", "value": "Boop Mochi's nose!"}}}},
                "Hurry up": {},
                "push.visitor": {"localizations": {"en": {"stringUnit": {"state": "translated", "value": "Feed {visitor}"}}}},
                "debug.only": {"shouldTranslate": False, "localizations": {"en": {"stringUnit": {"value": "sad"}}}},
            },
        }))
        count, problems = copylint.lint_paths([path])
        self.assertEqual(4, count)
        found = {(p.entry.key, p.rule) for p in problems}
        self.assertIn(("home.hint.boop", "names"), found)
        self.assertIn(("home.hint.boop", "R7"), found)
        self.assertIn(("Hurry up", "R7"), found)
        self.assertIn(("push.visitor", "notification"), found)
        self.assertIn(("debug.only", "R7"), found)

    def test_xcstrings_plural_variations_are_read(self):
        path = self.write("Localizable.xcstrings", json.dumps({"sourceLanguage": "en", "strings": {"k": {"localizations": {"en": {
            "variations": {"plural": {"one": {"stringUnit": {"value": "ok"}},
                                      "other": {"stringUnit": {"value": "so sad"}}}}}}}}}))
        _, problems = copylint.lint_paths([path])
        self.assertEqual(["R7"], [p.rule for p in problems])

    def test_strings_files_in_utf16_with_quoted_keys_and_escapes(self):
        path = self.dir / "InfoPlist.strings"
        path.write_text('/* comment */\n"NSMicrophoneUsageDescription" = "{mochi} listens \\"only\\" when you tap — promise";\n',
                        encoding="utf-16")
        count, problems = copylint.lint_paths([path])
        self.assertEqual(1, count)
        self.assertEqual({"infoplist"}, {p.rule for p in problems})
        self.assertEqual('{mochi} listens "only" when you tap — promise', copylint.load(path)[0].text)

    def test_strings_files_with_unquoted_keys_and_the_shorthand(self):
        path = self.write("InfoPlist.strings",
                          '// line comment\nNSMicrophoneUsageDescription = "Mochi is sad without you!";\n"Hurry";\n')
        entries = copylint.load(path)
        self.assertEqual(["NSMicrophoneUsageDescription", "Hurry"], [e.key for e in entries])
        self.assertEqual("Hurry", entries[1].text)
        _, problems = copylint.lint_paths([path])
        self.assertTrue(problems)

    def test_strings_files_in_utf16_without_a_bom(self):
        for encoding in ("utf-16-le", "utf-16-be"):
            with self.subTest(encoding=encoding):
                path = self.write(f"{encoding}/Localizable.strings", '"home.x" = "So sad";\n'.encode(encoding))
                self.assertEqual(["So sad"], [e.text for e in copylint.load(path)])

    def test_unreadable_strings_files_fail_instead_of_reading_nothing(self):
        for content in ['"a" = "b"\n"c" = "d";', '"a" = ;', 'what is this {', '"a" = "b"; stray']:
            with self.subTest(content=content):
                path = self.write("Bad.strings", content)
                with self.assertRaises(ValueError):
                    copylint.load(path)
                self.assertEqual(1, quiet_main([str(path)]))

    def test_stringsdict_leaves_are_read_and_printf_fails(self):
        path = self.write("Localizable.stringsdict", plistlib.dumps({"visits": {
            "NSStringLocalizedFormatKey": "%#@n@",
            "n": {"NSStringFormatSpecTypeKey": "NSStringPluralRuleType", "NSStringFormatValueTypeKey": "d",
                  "one": "Last chance", "other": "Two chances"}}}))
        texts = sorted(e.text for e in copylint.load(path))
        self.assertEqual(["%#@n@", "Last chance", "Two chances"], texts)
        rules_found = {p.rule for p in copylint.lint_paths([path])[1]}
        self.assertEqual({"R7", "placeholder"}, rules_found)

    def test_info_plist_usage_descriptions_are_read(self):
        path = self.write("ios/App/Info.plist", plistlib.dumps({
            "NSMicrophoneUsageDescription": "Mochi will die without the mic!",
            "CFBundleIdentifier": "app.huddlings.ios", "UILaunchScreen": {}}))
        entries = copylint.load(path)
        self.assertEqual(["NSMicrophoneUsageDescription"], [e.key for e in entries])
        self.assertEqual(("infoplist",), entries[0].surfaces)
        self.assertTrue(copylint.lint_paths([path])[1])

    def test_project_yml_info_properties_are_read(self):
        path = self.write("ios/project.yml", "targets:\n  App:\n    info:\n      properties:\n"
                          "        NSCameraUsageDescription: \"Hurry, Mochi is starving!\"\n"
                          "        NSMicrophoneUsageDescription: $(MIC_TEXT)\n"
                          "        'NSPhotoLibraryAddUsageDescription': 'It''s saved'\n"
                          "        CFBundleDisplayName: Huddlings  # never sad\n"
                          "    settings:\n      INFOPLIST_KEY_NSSpeechRecognitionUsageDescription: Last chance\n")
        entries = copylint.load(path)
        self.assertEqual(["NSCameraUsageDescription", "NSPhotoLibraryAddUsageDescription", "CFBundleDisplayName",
                          "INFOPLIST_KEY_NSSpeechRecognitionUsageDescription"], [e.key for e in entries])
        self.assertEqual(["Hurry, Mochi is starving!", "It's saved", "Huddlings", "Last chance"], [e.text for e in entries])

    def test_project_yml_forms_the_lint_cannot_read_are_errors(self):
        for body in ["NSCameraUsageDescription: >\n  Mochi is sad\n", "NSCameraUsageDescription: |-\n  sad\n",
                     "NSCameraUsageDescription: Huddlings uses the camera so\n  you are never lonely\n",
                     "properties: {NSCameraUsageDescription: sad}\n", "NSCameraUsageDescription:\n"]:
            with self.subTest(body=body):
                path = self.write("ios/project.yml", body)
                with self.assertRaises(ValueError):
                    copylint.load(path)

    def test_discover_finds_copy_files_and_skips_vendored_and_archived_ones(self):
        self.write("copy/catalogue.json", '{"strings": {}}')
        self.write("ios/App/Localizable.xcstrings", '{"strings": {}}')
        self.write("ios/App/InfoPlist.strings", "")
        self.write("ios/App/Info.plist", plistlib.dumps({}))
        self.write("ios/App/archive/Old.strings", "")
        self.write("ios/project.yml", "")
        self.write("server/project.yml", "")
        self.write("docs/archive/v2.strings", "")
        self.write("web/node_modules/x/a.strings", "")
        self.write("web/package.json", "{}")
        found = {p.relative_to(self.dir).as_posix() for p in copylint.discover(self.dir)}
        self.assertEqual({"copy/catalogue.json", "ios/App/Localizable.xcstrings", "ios/App/InfoPlist.strings",
                          "ios/App/Info.plist", "ios/App/archive/Old.strings", "ios/project.yml"}, found)

    def test_the_notification_surface_ignores_folders_above_the_repository(self):
        repo = self.dir / "NotificationLab" / "repo"
        path = repo / "ios" / "App" / "Localizable.xcstrings"
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps({"strings": {"home.energy": {"localizations": {"en": {"stringUnit": {
            "value": "{mochi} is hungry, so trips are slower."}}}}}}), encoding="utf-8")
        original = copylint.ROOT
        copylint.ROOT = repo
        try:
            self.assertEqual([], copylint.lint_paths([path])[1])
        finally:
            copylint.ROOT = original

    def test_main_fails_the_build_on_a_problem(self):
        path = self.write("Localizable.xcstrings", json.dumps({"strings": {"Last chance": {}}}))
        self.assertEqual(1, quiet_main([str(path)]))


class PreCommitHook(unittest.TestCase):
    """The hook lints what is staged, and a failing test blocks the commit."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name) / "repo"
        root = spec_catalogue.ROOT
        for rel in ["tools/copylint/copylint.py", "tools/copylint/spec_catalogue.py", "tools/copylint/test_copylint.py",
                    "tools/precommit.sh", ".githooks/pre-commit", "copy/catalogue.json", "docs/huddlings-spec.md"]:
            (self.repo / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / rel, self.repo / rel)
        # Never inherit git's variables: inside a hook they point at the outer repository.
        self.env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
        self.env.update(HUDDLINGS_SKIP_HOOK_TEST="1", GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t",
                        GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@t")
        self.git("init", "-q")
        self.git("config", "core.hooksPath", ".githooks")
        self.git("add", "-A")
        self.git("commit", "-q", "-m", "base", "--no-verify")

    def tearDown(self):
        self.tmp.cleanup()

    def git(self, *args, check=True, cwd=None):
        return subprocess.run(["git", *args], cwd=cwd or self.repo, env=self.env, capture_output=True, text=True, check=check)

    def test_staged_bad_copy_is_refused_even_when_the_working_copy_is_clean(self):
        strings = self.repo / "ios" / "App" / "Localizable.strings"
        strings.parent.mkdir(parents=True)
        strings.write_text('"home.x" = "Hurry, last chance";\n', encoding="utf-8")
        self.git("add", "-A")
        strings.write_text('"home.x" = "Hello";\n', encoding="utf-8")
        result = self.git("commit", "-q", "-m", "bad", check=False)
        self.assertNotEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn("banned word", result.stdout + result.stderr)

    def test_a_failing_test_blocks_the_commit(self):
        catalogue = self.repo / "copy" / "catalogue.json"
        catalogue.write_text(catalogue.read_text(encoding="utf-8").replace("Hello, friend", "Hello, pal"), encoding="utf-8")
        self.git("add", "-A")
        result = self.git("commit", "-q", "-m", "drift", check=False)
        self.assertNotEqual(0, result.returncode, result.stdout + result.stderr)

    def test_a_clean_commit_goes_through(self):
        (self.repo / "notes.txt").write_text("hello\n", encoding="utf-8")
        self.git("add", "-A")
        result = self.git("commit", "-q", "-m", "clean", check=False)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)

    def test_commit_all_and_commit_a_path_go_through(self):
        spec = self.repo / "docs" / "huddlings-spec.md"
        spec.write_text(spec.read_text(encoding="utf-8") + "\n", encoding="utf-8")
        result = self.git("commit", "-q", "-a", "-m", "all", check=False)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        spec.write_text(spec.read_text(encoding="utf-8") + "\n", encoding="utf-8")
        result = self.git("commit", "-q", "-m", "path", "docs/huddlings-spec.md", check=False)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)

    def test_a_commit_from_a_linked_worktree_leaves_the_repository_intact(self):
        tree = self.repo.parent / "tree"
        self.git("worktree", "add", "-q", str(tree), "-b", "feature")
        (tree / "note.txt").write_text("note\n", encoding="utf-8")
        self.git("add", "note.txt", cwd=tree)
        result = self.git("commit", "-q", "-m", "a note", check=False, cwd=tree)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual("false", self.git("config", "core.bare").stdout.strip())
        self.assertEqual(2, len(self.git("log", "--oneline", "feature").stdout.splitlines()))
        self.assertIn("note.txt", self.git("ls-files", cwd=tree).stdout)


# The hook test above copies this file into a scratch repository and runs the
# whole suite there through the hook; inside that run it is skipped.
if os.environ.get("HUDDLINGS_SKIP_HOOK_TEST"):
    del PreCommitHook


# Backticked spans in the spec that are not product copy: rendered examples,
# code, URLs and the banned-word lists themselves.
NOT_COPY = {
    "miss, missed, lonely, forgot, forgotten, dying, dead, die, sad, starving, starve, hurry, last chance, streak, waiting for you",
    "last chance", "waiting for you",
    "Biscuit is sleeping", "Biscuit is hungry", "Biscuit is on the way to Sarah, arriving around 9:40 PM",
    "On the way to Sarah · 9:40 PM", "{mochi} will trot. Arrives around 9:25 PM.",
    "{mochi} is hungry, so this one walks. Arrives around 9:40 PM.", "REC 0:07", "9:40 PM",
    "https://huddlings.app/p/{token}", "/p/{token}", "/h/{token}", "> <",
    "xcrun simctl io booted recordVideo", "SNClassifySoundRequest(classifierIdentifier: .version1)",
    "requiresOnDeviceRecognition = true", "security definer", "select … for update",
}


class TheRepositorysCopy(unittest.TestCase):
    """The catalogue in the repository: faithful to the spec, complete, and clean."""

    def setUp(self):
        self.spec = spec_catalogue.SPEC.read_text(encoding="utf-8")
        self.catalogue = json.loads(spec_catalogue.CATALOGUE.read_text(encoding="utf-8"))
        self.texts = {item["text"] for item in self.catalogue["strings"].values()}

    def test_catalogue_matches_the_spec(self):
        self.assertEqual(spec_catalogue.derive(self.spec), self.catalogue,
                         "copy/catalogue.json drifted from the spec; run tools/copylint/spec_catalogue.py --write")

    def test_every_catalogue_text_is_in_the_spec(self):
        for key, item in self.catalogue["strings"].items():
            if key == "settings.hears.bodyCam":
                continue  # composed from two spec sentences; checked below
            with self.subTest(key=key):
                self.assertIn(item["text"], self.spec)

    def test_every_copy_span_in_the_spec_is_in_the_catalogue(self):
        # Copy restated in other sections (a notification in section 16, a
        # permission text in section 19) must agree with the catalogue.
        for span in re.findall(r"`([^`\n]+)`", self.spec):
            span = span.strip()
            if " " not in span and not re.search(r"\{\w+\}", span):
                continue
            if re.fullmatch(r"(\{\w+\}:?)+", span) or span in NOT_COPY:
                continue
            with self.subTest(span=span):
                self.assertIn(span, self.texts)

    def test_the_special_rows_follow_the_spec(self):
        mutated = self.spec.replace("Spam · Hurtful · Something else", "Spam · Unkind · Something else")
        self.assertEqual("Unkind", spec_catalogue.derive(mutated)["strings"]["report.reasons.hurtful"]["text"])
        mutated = self.spec.replace("Mission complete / Next time (drawn", "Mission accomplished / Next time (drawn")
        self.assertEqual("Mission accomplished", spec_catalogue.derive(mutated)["strings"]["prop.missionComplete"]["text"])
        mutated = self.spec.replace("(Wear them for glasses", "(Put them on for glasses")
        self.assertEqual("Put them on", spec_catalogue.derive(mutated)["strings"]["treats.wearPlural"]["text"])

    def test_bodycam_replaces_only_the_first_sentence(self):
        strings = self.catalogue["strings"]
        body, cam = strings["settings.hears.body"]["text"], strings["settings.hears.bodyCam"]["text"]
        self.assertEqual(body.split(". ", 1)[1], cam.split(". ", 1)[1])
        self.assertIn("or in Mochi Cam.", cam)

    def test_the_catalogue_covers_what_the_spec_words(self):
        strings = self.catalogue["strings"]
        for key in ["hatch.choose", "age.under13", "push.visitor", "push.homeLink", "perm.mic",
                    "widget.visitorLock", "cam.needAccess", "report.reasons.hurtful", "prop.nextTime",
                    "preview.hungry", "treats.hint.banana", "treats.keepsake.banana", "hatch.traits.rabbit",
                    "share.tagline", "species.rabbit", "note.speed.1_5"]:
            with self.subTest(key=key):
                self.assertIn(key, strings)
        self.assertEqual(6, sum(k.startswith("preview.") for k in strings))
        self.assertEqual(12, sum(k.startswith("treats.hint.") for k in strings))
        self.assertEqual("Send your voice. Get their laugh back.", strings["share.tagline"]["text"])
        self.assertEqual(["store"], strings["share.tagline"]["surfaces"])

    def test_surfaces_follow_the_spec(self):
        strings = self.catalogue["strings"]
        for key, item in strings.items():
            with self.subTest(key=key):
                if key.startswith("push."):
                    self.assertEqual(["notification"], item["surfaces"])
                if key.startswith("perm."):
                    self.assertEqual(["infoplist"], item["surfaces"])
        for key in ["widget.onTheWayLock", "widget.visitorLock", "widget.home", "widget.hungry"]:
            self.assertIn("lockscreen", strings[key]["surfaces"])
        for key in ["widget.onTheWay", "widget.visitor"]:
            self.assertNotIn("lockscreen", strings[key]["surfaces"])
        self.assertEqual(["web"], strings["scene.secret.quietly"]["surfaces"])
        for key in ["scene.giggle.line", "note.from", "souvenir.sendLaugh", "web.unavailable", "report.thanks"]:
            self.assertEqual(["app", "web"], strings[key]["surfaces"])

    def test_the_repository_is_clean(self):
        count, problems = copylint.lint_paths(copylint.discover(copylint.ROOT))
        self.assertGreater(count, 250)
        self.assertEqual([], [str(p) for p in problems])


if __name__ == "__main__":
    unittest.main()
