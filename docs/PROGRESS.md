# Progress

Kept current every session (CLAUDE.md). One section per lane; each lane edits only its own.

## Lead: platform and the dog (M0)

**Done: phases 0 and 1** (spec section 5b), both merged into main on Oct 14, 2026 at your request (`GATES.md`)
- Phase 0, https://github.com/beurni2/HUDDLINGS/pull/1: `PLAN.md`, `QUESTIONS.md`, `LIMITATIONS.md`, `GATES.md`, the copy lint and its catalogue, `LICENSE` (all rights reserved), the session hook.
- Phase 1, https://github.com/beurni2/HUDDLINGS/pull/2: the package format and contract (`characters/format/README.md`); the web runtime (WebGL2) and the Swift engine with its SpriteKit adapter, held to the same vectors; the test character; the app shell with the Lab's Diagnostics; CI on Linux and on GitHub's Mac (Xcode 26.3); the Visual QA render job; parity green on the character (full 0.986, small 0.979, `qa/phase1/parity/`); SpriteKit's warp split and mipmaps measured (E17, E21); the TestFlight lane, gated on every check.

**Next: phase 2, the dog's references** (section 5b; `PLAN.md`): every panel of the four dog sheets cropped into `characters/dog/ref/`, the turnaround silhouettes cut out, proportions, landmarks and palette measured, the marking map proposed, and `model.json` and `DECISIONS.md` written, each decision with the crop that settled it. Then phase 3, drawing the dog, ends at Gate A.

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
