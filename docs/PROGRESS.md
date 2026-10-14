# Progress

Kept current every session (CLAUDE.md). One section per lane; each lane edits only its own.

## Lead: platform and the dog (M0)

**Done: phases 0 and 1** (spec section 5b), both merged into main on Oct 14, 2026 at your request (`GATES.md`)
- Phase 0, https://github.com/beurni2/HUDDLINGS/pull/1: `PLAN.md`, `QUESTIONS.md`, `LIMITATIONS.md`, `GATES.md`, the copy lint and its catalogue, `LICENSE` (all rights reserved), the session hook.
- Phase 1, https://github.com/beurni2/HUDDLINGS/pull/2: the package format and contract (`characters/format/README.md`); the web runtime (WebGL2) and the Swift engine with its SpriteKit adapter, held to the same vectors; the test character; the app shell with the Lab's Diagnostics; CI on Linux and on GitHub's Mac (Xcode 26.3); the Visual QA render job; parity green on the character (full 0.986, small 0.979, `qa/phase1/parity/`); SpriteKit's warp split and mipmaps measured (E17, E21); the TestFlight lane, gated on every check.

**In review: phase 2, the dog's references** (section 5b; `PLAN.md`), https://github.com/beurni2/HUDDLINGS/pull/3
- `characters/refprep/`: one command, `python3 characters/refprep/prepare.py dog`, crops all 116 panels of the four sheets, cuts out the turnaround, measures landmarks, proportions and outlines, samples the palette, shows the proposed marking map and writes `characters/dog/model.json`. Byte for byte reproducible; CI and the pre-commit hook rerun it.
- `characters/dog/DECISIONS.md`: 25 decisions, each with its crop. Two questions for Gate A: Q24, the colours the sheet paints that its printed palette lacks (eyes and nose, head patches, the fur's shade, the tongue, the mouth's inside); Q25, the blush checked as a level.
- Two review rounds of four fresh reviewers, each finding checked by a refuting verifier; every confirmed finding is fixed or recorded.
- Deferred, on purpose: the face panels' crop records (phase 3, before Gate A) and the motion poses' (phase 4), each with its mask (`DECISIONS.md` 14).

**Next: phase 3, drawing the dog** (section 5b), ending at Gate A: each view and every face state drawn as parts from `model.json`, beside the sheet crops, with the sheet match.

**Blockers**
- For TestFlight at the end of phase 1: the Apple pieces in `PLAN.md`, What I need from you (Team ID, API key, your iPhone registered once, the app record and bundle ID).

## Verify at the start of every session

```
git log --oneline -10
python3 tools/copylint/copylint.py
python3 -m unittest discover -s tools/copylint
python3 -m unittest discover -s tools/qa
python3 -m unittest discover -s characters/refprep
npm install && npm run typecheck && npm test
# Swift: start dockerd in the background first
docker run --rm -v "$PWD":/w -w /w swift:6.4.1 swift test --package-path ios/CompanionCore
```
