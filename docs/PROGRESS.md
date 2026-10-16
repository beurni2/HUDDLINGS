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

  On-model is close to 4 everywhere; charm stays at 3 under the reviewers. You looked at the four views on Oct 15 and said they are all good (`GATES.md`; an early look, not a gate), so the views stay as they are and the work moves on to what Gate A still needs.
- Merged: https://github.com/beurni2/HUDDLINGS/pull/4 (the kit, the sheet match and the four views), at your request on Oct 15, after your early look.
- Done on the branch since (06ddf1a): the right-facing views, threeQuarter.R (IoU 0.967, worst landmark 2.59 pt) and side.R (0.965, 2.44 pt), mirrored with the light kept at the top left and each side's own markings; the back on the shared line rule; the null region and a per-part alpha channel in both runtimes, held to shared vectors (Swift 18 tests in Docker). All six views pass every gate in one run; 236 Node and 178 Python tests pass.
- Done on the branch since: the face crop records on both sheets with the Faces check (each face held by its features' places and shapes on one primary panel, and on its own head; thresholds measured over 882 comparisons); a part's rest alpha in both runtimes; and the front face library: every eye, mouth, brow and ear state, the 19 presets, a face clip for each of the 17 sheet presets, and tests that no face is ever sad, angry or drooped (R3). Q27 decided by you (the defaults).
- Faces today: 6 of 17 pass the full check (neutral, happy, surprised, curious, shy, listening); 11 fail on measured drawing gaps (crescent bands, Content's smile, the wink's side, excited's mouth width, sleepy's arcs). Evidence: `qa/phase3/faces/`.
- Round 2 merged: all 19 faces pass the Faces check (17 against their panels, hungry and huffy by eye), with the blush at its levels (shy 0.80, blissful 0.69 against 0.7, every rest cheek at the sheet's 0.35); a lifted ear that reads; hungry and huffy drawn new in front, variant A in the package and B for review (`qa/phase3/faces/new/`); every face state in the turned views except hungry's and huffy's, which show the open eye there for now; the blush level held in the Faces check; the Faces check in the pre-commit hook; and the dog's parity on the Mac (every view and face, SpriteKit against WebGL at SSIM 0.95), which first runs on the pull request.
- Pull request: https://github.com/beurni2/HUDDLINGS/pull/5 (draft), so the Mac job runs; it is not ready for Gate A.
- Your feedback on Oct 16, from the six views beside their crops: the fur edges and the joins between parts do not match the sheet. Confirmed on zoomed crops: the cheek fur over each ear ends in a hard, unlined cut; the crown's edge is blurred instead of a crisp line round its locks; the chest's fur edge under the collar is smeared; the ears are smooth where the sheet's have wavy, feathered edges; the tail plume is smoother than the sheet's; and (your second note) the chin and lower cheeks above the collar are a square-cornered block with a blurred, unlined lower edge, where the sheet's muzzle fur is a rounded fluffy mass with tufted sides and small outlined scallops over the collar. A read-only audit found 60 defects (28 high) from 10 shared causes (`docs/phase3-fur-plan.md`, `qa/phase3/audit/`): line spans that taper to nothing at every handoff, a blurred head line, fur locks too small and even, each view typing its own head fur, smooth ears, flat paws, shade bands ending on unlined joins, blurred marking edges, the collar's ends, and the ground shadow. The fur edges and joins pass follows round 2: shared recipes first with a new line check that must fail today's build, then one lane per view. Questions Q29 to Q31 came out of it, each with a recommended default.
- Next, in two steps. First, in parallel: the shared fur recipes (lines, head fur, ears, paws, markings, ground shadow), the new line check (it must fail today's build), and your eye decisions (Q2, Q26, Q28) with hungry's and huffy's turned states. Then one lane per view, then the three fresh reviewers and Gate A. Q29 to Q31 run on their recommended defaults until you answer.

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
