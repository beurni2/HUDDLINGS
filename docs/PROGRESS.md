# Progress

Kept current every session (CLAUDE.md). One section per lane; each lane edits only its own.

## Lead: platform and the dog (M0)

**Done**
- Phase 0 (section 5b): the environment checked and completed; the spec, CLAUDE.md and the 16 master sheets in place, unchanged; the repository skeleton; `PLAN.md`, `QUESTIONS.md`, `LIMITATIONS.md`, `GATES.md`.
- The copy lint (R7, section 20) and `copy/catalogue.json`, every user-visible string the spec gives, derived from the spec and checked against it by the tests. It fails the build through the git pre-commit hook and the `checks` workflow.
- A SessionStart hook that prepares cloud sessions (the section 5b Python tools, Deno and the Supabase CLI from npm, potrace) and turns on the pre-commit hook.
- Nothing to archive: no spec version 2 or Mochi Post spec was in the repository. Nothing carries over: no dog work under section 5b existed.

**In progress**
- Waiting for the founder's go-ahead on `PLAN.md` and the answers in `QUESTIONS.md` marked "now".

**Next**
- Phase 1: the character package format, the web runtime, the SpriteKit runtime, the test character, CI with Visual QA and parity, the TestFlight lane and the Lab's Diagnostics.

**Blockers**
- The go-ahead on the plan.
- Before phase 1 can reach the iPhone: the Apple Developer and App Store Connect pieces in `PLAN.md`, What I need from you.

## Verify at the start of every session

```
git log --oneline -10
python3 tools/copylint/copylint.py
python3 -m unittest discover -s tools/copylint
```
