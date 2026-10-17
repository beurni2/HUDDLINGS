"""Tests for the pre-commit hook (tools/precommit.sh), run as git runs it, in a
small repository of stand-ins: the copy lint, the reference prep and the sheet
match's tests are stub scripts, and node, npm and npx are stubs that record the
front's sheet match and the Faces check and build into build/ as look.ts does.

    python3 -m unittest discover -s tools -p test_precommit.py -v

The repository lives in a temporary folder and its git commands never see the
repository the tests run in: every GIT_ variable a running commit exports is
dropped from their environment."""
import os
import shutil
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parent / "precommit.sh"
PASSES = "import unittest\n\n\nclass Stub(unittest.TestCase):\n    def test_stub(self):\n        pass\n"

# The stand-ins, by path in the little repository.
FILES = {
    ".gitignore": "node_modules\n/build/\n",
    "tools/copylint/copylint.py": "",
    "tools/copylint/test_stub.py": PASSES,
    "characters/refprep/test_stub.py": PASSES,
    # Writes the species' ref/ again, as the real prep does: deleted, then written STUB_PREPARE_SECONDS later.
    "characters/refprep/prepare.py": (
        "import os\nimport shutil\nimport sys\nimport time\nfrom pathlib import Path\n\n"
        "folder = Path(__file__).resolve().parents[1] / sys.argv[1] / 'ref'\n"
        "text = (folder / 'sheet.txt').read_text()\nshutil.rmtree(folder)\n"
        "time.sleep(float(os.environ.get('STUB_PREPARE_SECONDS', '0')))\n"
        "folder.mkdir()\n(folder / 'sheet.txt').write_text(text)\n"),
    # Reads what the sheet match's tests read, for STUB_READ_SECONDS, and fails if it changes under it: the
    # references, and the dog's package in build/, whose atlas.json the match reads.
    "characters/sheetmatch/test_reads.py": (
        "import os\nimport time\nimport unittest\nfrom pathlib import Path\n\n"
        "ROOT = Path(__file__).resolve().parents[2]\n\n\n"
        "class Reads(unittest.TestCase):\n"
        "    def test_what_it_reads_holds_still(self):\n"
        "        sheet = ROOT / 'characters/dog/ref/sheet.txt'\n"
        "        first = sheet.read_text()\n"
        "        end = time.monotonic() + float(os.environ.get('STUB_READ_SECONDS', '0'))\n"
        "        while True:\n"
        "            self.assertEqual(sheet.read_text(), first)\n"
        "            self.assertFalse((ROOT / 'build/characters/dog').exists(), 'the front match built under the tests')\n"
        "            if time.monotonic() > end:\n"
        "                break\n"
        "            time.sleep(0.01)\n"),
    "characters/sheetmatch/match.py": "",
    "characters/dog/ref/sheet.txt": "the sheet\n",
    "characters/dog/refmap/map.json": "{}\n",
    "characters/dog/model.json": "{}\n",
    "characters/dog/src/front.ts": "",
    "characters/dog/test/dog.test.ts": "",
    "characters/dog/DECISIONS.md": "",
    "characters/draw/paint.ts": "",
    "characters/build/build.ts": "",
    "characters/format/vectors/v.json": "{}\n",
    "runtime-web/src/rig.ts": "",
    "runtime-web/lab/look.ts": "",
    "runtime-web/test/rig.test.ts": "",
    "docs/notes.md": "",
    "package.json": "{}\n",
    "tsconfig.json": "{}\n",
}

# node records each look's folder and arguments and builds into build/ as look.ts does: the front's match, or with
# --faces the Faces check, which marks while it runs so the front's can see it beside it; npm and npx pass.
NODE = """#!/bin/sh
if [ "$1" = runtime-web/lab/look.ts ]; then
  echo "$PWD $*" >> "$STUB_LOG"
  mkdir -p build/characters/dog
  echo '{}' > build/characters/dog/atlas.json
  case " $* " in
    *" --faces "*)
      touch "$STUB_LOG.faces-running"
      mkdir -p build/qa/faces/shy
      echo evidence > build/qa/faces/shy/beside.png
      echo "  shy  stand-in verdict"
      sleep "${STUB_FACES_SECONDS:-0}"
      rm -f "$STUB_LOG.faces-running"
      exit "${STUB_FACES_EXIT:-0}";;
  esac
  [ -e "$STUB_LOG.faces-running" ] && echo "the front's match ran beside the Faces check" >> "$STUB_LOG.beside"
  mkdir -p build/qa/front
  echo evidence > build/qa/front/compare.png
  sleep "${STUB_LOOK_SECONDS:-0}"
  exit "${STUB_LOOK_EXIT:-0}"
fi
"""

# What touches what draws, renders or judges the dog, or what it is judged against; and what does not.
FRONT = ["characters/dog/src/front.ts", "characters/draw/paint.ts", "characters/build/build.ts", "runtime-web/src/rig.ts",
         "runtime-web/lab/look.ts", "characters/sheetmatch/match.py", "characters/refprep/prepare.py", "characters/dog/model.json",
         "characters/dog/ref/sheet.txt", "characters/dog/refmap/map.json", "package.json", "package-lock.json", "tools/requirements.txt"]
ELSEWHERE = ["docs/notes.md", "characters/dog/test/dog.test.ts", "characters/dog/DECISIONS.md", "runtime-web/test/rig.test.ts"]
# What the Faces check watches: the dog's source, the sheet match, and what the dog is judged against; what it does not.
FACES = ["characters/dog/src/front.ts", "characters/sheetmatch/match.py", "characters/dog/refmap/map.json", "characters/dog/model.json"]
NOT_FACES = ["characters/draw/paint.ts", "characters/build/build.ts", "runtime-web/src/rig.ts", "runtime-web/lab/look.ts",
             "characters/refprep/prepare.py", "characters/dog/ref/sheet.txt", "docs/notes.md", "characters/dog/test/dog.test.ts"]


class HookTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        self.repo = self.root / "repo"
        self.log = self.root / "look.log"
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        for name, script in (("node", NODE), ("npm", "#!/bin/sh\n"), ("npx", "#!/bin/sh\n")):
            (bin_dir / name).write_text(script)
            (bin_dir / name).chmod(0o755)
        # Nothing of a running commit's git state reaches the little repository's git.
        self.env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_") and k not in ("HUDDLINGS_FRONT_MATCH", "HUDDLINGS_FACES")}
        self.env.update(PATH=f"{bin_dir}{os.pathsep}{os.environ['PATH']}", STUB_LOG=str(self.log), GIT_CONFIG_NOSYSTEM="1",
                        GIT_AUTHOR_NAME="Hook test", GIT_AUTHOR_EMAIL="hook@example.com", GIT_COMMITTER_NAME="Hook test",
                        GIT_COMMITTER_EMAIL="hook@example.com")
        for name, text in FILES.items():
            path = self.repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
        (self.repo / "tools").mkdir(exist_ok=True)
        shutil.copy(HOOK, self.repo / "tools" / "precommit.sh")
        (self.repo / "node_modules").mkdir()
        self.git("init", "-q")
        self.git("add", "-A")
        self.git("-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "stand-ins")

    def tearDown(self):
        self.folder.cleanup()

    def git(self, *args, cwd=None):
        return subprocess.run(["git", *args], cwd=cwd or self.repo, env=self.env, check=True, capture_output=True, text=True).stdout

    def hook(self, *changed, cwd=None, **env):
        """Changes and stages each file, then runs the hook as git would: its exit code, what it said, and the
        front match's runs (the Faces check's are self.faces after it)."""
        cwd = cwd or self.repo
        for name in changed:
            with open(cwd / name, "a") as f:
                f.write("\n")
            self.git("add", name, cwd=cwd)
        self.log.unlink(missing_ok=True)
        Path(f"{self.log}.beside").unlink(missing_ok=True)
        ran = subprocess.run(["sh", "tools/precommit.sh"], cwd=cwd, env={**self.env, **env}, capture_output=True, text=True)
        runs = self.log.read_text().splitlines() if self.log.exists() else []
        self.faces = [r for r in runs if " --faces " in f"{r} "]
        return ran.returncode, ran.stdout + ran.stderr, [r for r in runs if r not in self.faces]

    def test_the_reference_prep_check_never_rewrites_what_the_sheet_match_tests_read(self):
        # Before, it deleted and wrote ref/ again in the one checkout while they read it.
        code, said, _ = self.hook("characters/dog/refmap/map.json", HUDDLINGS_FRONT_MATCH="0", STUB_READ_SECONDS="1.2", STUB_PREPARE_SECONDS="0.3")
        self.assertEqual(code, 0, said)

    def test_the_front_match_never_builds_where_the_sheet_match_tests_read(self):
        # Before, it built the dog into the one checkout's build/, whose atlas.json the match reads, while they ran.
        code, said, looks = self.hook("characters/dog/src/front.ts", HUDDLINGS_FRONT_MATCH="1", STUB_READ_SECONDS="1.2")
        self.assertEqual(code, 0, said)
        self.assertEqual(len(looks), 1, "the front match ran while they read")

    def test_the_front_match_runs_by_default_on_what_draws_renders_or_judges_the_dog(self):
        for name in FRONT:
            with self.subTest(staged=name):
                code, said, looks = self.hook(name)
                self.assertEqual(code, 0, said)
                self.assertEqual(len(looks), 1, said)
                self.git("reset", "-q", "--hard")
        for name in ELSEWHERE:
            with self.subTest(staged=name):
                code, said, looks = self.hook(name)
                self.assertEqual((code, looks), (0, []), said)
                self.git("reset", "-q", "--hard")

    def test_a_file_moved_out_of_what_draws_the_dog_still_runs_the_front_match(self):
        (self.repo / "docs").mkdir(exist_ok=True)
        self.git("mv", "characters/draw/paint.ts", "docs/paint.ts")
        code, said, looks = self.hook()
        self.assertEqual((code, len(looks)), (0, 1), said)

    def test_huddlings_front_match_0_skips_it_and_says_so(self):
        code, said, looks = self.hook("characters/dog/src/front.ts", HUDDLINGS_FRONT_MATCH="0")
        self.assertEqual((code, looks), (0, []), said)
        self.assertIn("the dog's front sheet match is skipped (HUDDLINGS_FRONT_MATCH=0)", said)
        # Any other value runs it, as no value does.
        code, said, looks = self.hook("characters/dog/src/front.ts", HUDDLINGS_FRONT_MATCH="1")
        self.assertEqual((code, len(looks)), (0, 1), said)

    def test_a_failing_front_match_fails_the_commit_and_keeps_its_evidence(self):
        code, said, _ = self.hook("characters/draw/paint.ts", STUB_LOOK_EXIT="1")
        self.assertEqual(code, 1)
        self.assertIn("the dog's front fails its sheet match", said)
        self.assertEqual((self.repo / "build/qa/front/compare.png").read_text(), "evidence\n")

    def test_a_failing_suite_run_beside_the_rest_fails_the_commit_with_what_it_said(self):
        fails = "import unittest\n\n\nclass Planted(unittest.TestCase):\n    def test_planted(self):\n        self.fail('planted in the {}')\n"
        for name, path, said in (("hook's own", "tools/test_precommit.py", "the hook's own tests fail"),
                                 ("sheet match's", "characters/sheetmatch/test_planted.py", "the sheet match's tests fail")):
            with self.subTest(suite=name):
                (self.repo / path).write_text(fails.format(name))
                code, out, _ = self.hook(path, HUDDLINGS_FRONT_MATCH="0")
                self.assertEqual(code, 1, out)
                self.assertIn(f"planted in the {name}", out)
                self.assertIn(said, out)
                self.git("reset", "-q", "--hard")
                (self.repo / path).unlink(missing_ok=True)

    def test_the_faces_check_runs_by_default_on_the_dog_s_source_the_sheet_match_and_what_it_is_judged_against(self):
        for name in FACES:
            with self.subTest(staged=name):
                code, said, _ = self.hook(name)
                self.assertEqual(code, 0, said)
                self.assertEqual(len(self.faces), 1, said)
                self.assertIn("shy  stand-in verdict", said, "its lines are shown when it passes")
                self.git("reset", "-q", "--hard")
        for name in NOT_FACES:
            with self.subTest(staged=name):
                code, said, _ = self.hook(name)
                self.assertEqual((code, self.faces), (0, []), said)
                self.git("reset", "-q", "--hard")

    def test_the_faces_check_runs_beside_the_front_s_match_in_a_checkout_of_its_own(self):
        # It takes the longest, so it starts first and runs while everything else does; it builds in its own checkout,
        # never where the front's match or the sheet match's tests read.
        code, said, looks = self.hook("characters/dog/src/front.ts", STUB_FACES_SECONDS="2", STUB_READ_SECONDS="0.5")
        self.assertEqual(code, 0, said)
        self.assertEqual((len(looks), len(self.faces)), (1, 1), said)
        self.assertTrue(Path(f"{self.log}.beside").exists(), "the front's match ran after the Faces check ended")
        front_dir, faces_dir = looks[0].split()[0], self.faces[0].split()[0]
        self.assertEqual(faces_dir, f"{front_dir}/faces")
        self.assertIn("--faces --qa " + faces_dir + "/build/qa", self.faces[0])

    def test_huddlings_faces_0_skips_it_and_says_so(self):
        code, said, looks = self.hook("characters/sheetmatch/match.py", HUDDLINGS_FACES="0")
        self.assertEqual((code, self.faces, len(looks)), (0, [], 1), said)
        self.assertIn("the dog's Faces check is skipped (HUDDLINGS_FACES=0)", said)
        # Any other value runs it, as no value does; HUDDLINGS_FRONT_MATCH=0 leaves it running.
        code, said, looks = self.hook("characters/sheetmatch/match.py", HUDDLINGS_FACES="1", HUDDLINGS_FRONT_MATCH="0")
        self.assertEqual((code, len(self.faces), looks), (0, 1, []), said)

    def test_a_failing_faces_check_fails_the_commit_and_keeps_its_evidence(self):
        for exit_code in ("1", "2"):
            with self.subTest(exit=exit_code):
                code, said, _ = self.hook("characters/dog/model.json", STUB_FACES_EXIT=exit_code)
                self.assertEqual(code, 1)
                self.assertIn("the dog's faces fail the Faces check", said)
                self.assertIn("shy  stand-in verdict", said)
                self.assertEqual((self.repo / "build/qa/faces/shy/beside.png").read_text(), "evidence\n")
                self.git("reset", "-q", "--hard")

    def test_a_failing_front_match_ends_the_hook_without_waiting_for_the_faces_check(self):
        # The front's match fails first; the hook exits at once, stopping the Faces check running beside it.
        start = time.monotonic()
        code, said, looks = self.hook("characters/dog/src/front.ts", STUB_LOOK_EXIT="1", STUB_FACES_SECONDS="30")
        self.assertEqual(code, 1)
        self.assertIn("the dog's front fails its sheet match", said)
        self.assertLess(time.monotonic() - start, 20, "the hook waited for the Faces check")
        # The Faces check had started and was still running when the front's match failed: a hook without it would
        # pass the timing alone.
        self.assertEqual((len(self.faces), len(looks)), (1, 1), said)
        self.assertTrue(Path(f"{self.log}.beside").exists(), "the front's match failed with the Faces check not running")

    def test_the_raster_cache_is_the_main_checkouts_in_a_worktree_too(self):
        cache = str(self.repo.resolve() / "build" / "cache")
        _, said, looks = self.hook("characters/dog/src/front.ts")
        for run in looks + self.faces:
            self.assertTrue(run.endswith(f"--cache {cache}"), run)
        self.git("reset", "-q", "--hard")
        worktree = self.root / "worktree"
        self.git("worktree", "add", "-q", str(worktree))
        (worktree / "node_modules").mkdir()
        code, said, looks = self.hook("characters/dog/src/front.ts", cwd=worktree)
        self.assertEqual(code, 0, said)
        for run in looks + self.faces:
            self.assertTrue(run.endswith(f"--cache {cache}"), run)


if __name__ == "__main__":
    unittest.main()
