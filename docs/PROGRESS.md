# Progress

Kept current every session (CLAUDE.md). One section per lane; each lane edits only its own.

## Lead: platform and the dog (M0)

**Done: phase 0** (spec section 5b), approved Oct 14, 2026 (`GATES.md`); https://github.com/beurni2/HUDDLINGS/pull/1 waits for your merge
- `PLAN.md`, `QUESTIONS.md` (23 questions with defaults, 13 engineering decisions), `LIMITATIONS.md`, `GATES.md` and this file.
- The copy lint (R7, section 20): `copy/catalogue.json` holds the 298 strings the spec words, derived from the spec and checked against it; 48 tests; the pre-commit hook lints the staged files; CI runs both on every push: https://github.com/beurni2/HUDDLINGS/actions?query=branch%3Aclaude%2Floving-bardeen-tg3wvd
- The review record (the spec audit and three review rounds of this work): `qa/phase0/spec-audit.md`.
- `LICENSE`: all rights reserved, replacing MIT before the first push (`QUESTIONS.md` D2). The repository stays public (D1).
- A SessionStart hook prepares cloud sessions (the section 5b Python tools, Deno and the Supabase CLI) and turns on the pre-commit hook.
- Nothing to archive (no spec version 2 or Mochi Post spec was here) and nothing carries over (no dog work existed).

**In progress: phase 1** (draft https://github.com/beurni2/HUDDLINGS/pull/2, stacked on #1)
- Done and tested here: the package format and contract (`characters/format/README.md`); the web runtime (WebGL2, 120 Hz springs, blending, the fake turn, bends, events); the test character and the package build; the Lab page, `npm run render` and `npm run render:all`; the Swift engine, held to the same vectors; the copy checks for the app's strings (extracted and in code); the E1 allowlist and the package-in-app check; parity scored on the character, with planted-failure tests.
- On the macOS runner: the SpriteKit adapter, the app shell with the Lab's Diagnostics, UI tests, and parity, green on d98bf8c under the old whole-frame score (full min 0.995, small min 0.986). The Visual QA job renders every clip on every push.
- Running now: the probes that measure SpriteKit's warp-cell diagonal and mip filter (E17), and parity on the character (E20), on pinned Xcode 16.4, XcodeGen 2.46.0 and Swift 6.4.1.
- Next: record those results and the evidence in `qa/phase1/` and `LIMITATIONS.md`; mark the PR ready. Frame time, rig time and texture memory on your iPhone wait for TestFlight.

**Blockers**
- For TestFlight at the end of phase 1: the Apple pieces in `PLAN.md`, What I need from you (Team ID, API key, your iPhone registered once, the app record and bundle ID).

## Verify at the start of every session

```
git log --oneline -10
python3 tools/copylint/copylint.py
python3 -m unittest discover -s tools/copylint
python3 -m unittest discover -s tools/qa
npm install && npm run typecheck && npm test
# Swift: start dockerd in the background first
docker run --rm -v "$PWD":/w -w /w swift:6.4.1 swift test --package-path ios/CompanionCore
```
