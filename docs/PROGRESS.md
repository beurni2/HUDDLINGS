# Progress

Kept current every session (CLAUDE.md). One section per lane; each lane edits only its own.

## Lead: platform and the dog (M0)

**Done: phases 0 to 2** (spec section 5b), all merged into main on Oct 14, 2026 at your request (`GATES.md`)
- Phase 0, https://github.com/beurni2/HUDDLINGS/pull/1: `PLAN.md`, `QUESTIONS.md`, `LIMITATIONS.md`, `GATES.md`, the copy lint and its catalogue, `LICENSE` (all rights reserved), the session hook.
- Phase 1, https://github.com/beurni2/HUDDLINGS/pull/2: the package format and contract (`characters/format/README.md`); the web runtime (WebGL2) and the Swift engine with its SpriteKit adapter, held to the same vectors; the test character; the app shell with the Lab's Diagnostics; CI on Linux and on GitHub's Mac (Xcode 26.3); the Visual QA render job; parity green on the character (full 0.986, small 0.979, `qa/phase1/parity/`); SpriteKit's warp split and mipmaps measured (E17, E21); the TestFlight lane, gated on every check.
- Phase 2, https://github.com/beurni2/HUDDLINGS/pull/3: `characters/refprep/` (one command, `python3 characters/refprep/prepare.py dog`, crops all 116 panels, cuts out the turnaround, measures landmarks, proportions and outlines, samples the palette, shows the proposed marking map and writes `characters/dog/model.json`, byte for byte reproducible); `characters/dog/DECISIONS.md` with 25 decisions, each with its crop; Q24 and Q25 decided by you, both the default. Deferred on purpose: the face panels' crop records (phase 3, before Gate A) and the motion poses' (phase 4), each with its mask (`DECISIONS.md` 14).

**In progress: phase 3, drawing the dog** (section 5b; `PLAN.md`), ending at Gate A: every part in its six facings and every face state, drawn in TypeScript from `model.json`, beside the sheet crops, with the sheet match. The plan, from a design panel of three independent prototyped designs, is `docs/phase3-plan.md`.
- Done on the branch: the drawing kit (`characters/draw/`, with a lint that refuses images, unbounded masks, off-palette colours and lines outside their bands as drawn), the build in crash-isolated child processes with a raster cache, the stills renderer and look loop (`npm run look -- dog front`, about 5 s), and the automated sheet match (`characters/sheetmatch/`) in CI and the pre-commit hook.
- Four views drawn, each from its own turnaround crop, every sheet-match gate green (`qa/phase3/<view>/`), with one finish pass of shared recipes (eye, line by light, topknot, ear, paw, tag, marking: `characters/dog/src/parts/`):

  | View | Silhouette IoU | Worst landmark | Worst colour ΔE | Reviewers (on-model / face / charm) |
  | --- | --- | --- | --- | --- |
  | front | 0.978 | 1.98 pt | 1.92 | 3–3.5 / 3–4 / 3 |
  | threeQuarter.L | 0.966 | 2.59 pt | 1.92 | 3.5–4 / 3–3.5 / 3 |
  | side.L | 0.965 | 2.44 pt | 2.21 | 3.5–4 / 3.5–4 / 3 |
  | back | 0.973 | 1.99 pt | 1.22 | 3–4 / 3 / 2.5–3 |

  On-model is close to 4 everywhere; charm stays at 3. Many rounds have stopped moving it: what reviewers still want is the sheet's painterly softness in the fur, which you judge at Gate A.
- In review: https://github.com/beurni2/HUDDLINGS/pull/4, an early look so you can stop me if the look is wrong. It is not a gate.
- Next: the right-facing views; the back view onto the shared line rule (DECISIONS 74; it keeps its own lines for now); the null region and the alpha channel in both runtimes (the face states need them); the face panels' crop records and the Faces check; then every face state, the presets, the hungry and huffy faces, and Gate A.

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
