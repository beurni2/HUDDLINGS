# Progress

Kept current every session (CLAUDE.md). One section per lane; each lane edits only its own.

## Lead: platform and the dog (M0)

**Done: phases 0 to 2** (spec section 5b), all merged into main on Oct 14, 2026 at your request (`GATES.md`)
- Phase 0, https://github.com/beurni2/HUDDLINGS/pull/1: `PLAN.md`, `QUESTIONS.md`, `LIMITATIONS.md`, `GATES.md`, the copy lint and its catalogue, `LICENSE` (all rights reserved), the session hook.
- Phase 1, https://github.com/beurni2/HUDDLINGS/pull/2: the package format and contract (`characters/format/README.md`); the web runtime (WebGL2) and the Swift engine with its SpriteKit adapter, held to the same vectors; the test character; the app shell with the Lab's Diagnostics; CI on Linux and on GitHub's Mac (Xcode 26.3); the Visual QA render job; parity green on the character (full 0.986, small 0.979, `qa/phase1/parity/`); SpriteKit's warp split and mipmaps measured (E17, E21); the TestFlight lane, gated on every check.
- Phase 2, https://github.com/beurni2/HUDDLINGS/pull/3: `characters/refprep/` (one command, `python3 characters/refprep/prepare.py dog`, crops all 116 panels, cuts out the turnaround, measures landmarks, proportions and outlines, samples the palette, shows the proposed marking map and writes `characters/dog/model.json`, byte for byte reproducible); `characters/dog/DECISIONS.md` with 25 decisions, each with its crop; Q24 and Q25 decided by you, both the default. Deferred on purpose: the face panels' crop records (phase 3, before Gate A) and the motion poses' (phase 4), each with its mask (`DECISIONS.md` 14).

**In progress: phase 3, drawing the dog** (section 5b; `PLAN.md`), ending at Gate A: every part in its six facings and every face state, drawn in TypeScript from `model.json`, beside the sheet crops, with the sheet match. The plan, from a design panel of three independent prototyped designs, is `docs/phase3-plan.md`.
- Done on the branch: the drawing kit (`characters/draw/`), the build in crash-isolated child processes with a raster cache, the dog's source skeleton with a provisional front view (`characters/dog/src/`), the stills renderer and look loop (`runtime-web/lab/still.ts`, `look.ts`) and the automated sheet match (`characters/sheetmatch/`), each reviewed by a fresh agent. The loop takes about 5 s; the provisional front passes the silhouette (IoU 0.952) and palette, not yet every landmark.
- In progress: the harness review's fixes and its CI and pre-commit wiring; three independent redraws of the front view, judged against the sheet.
- Next: the front view in its own pull request, so you can stop me early if the look is wrong. It is not a gate.

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
