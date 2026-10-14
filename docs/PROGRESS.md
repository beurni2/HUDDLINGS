# Progress

Kept current every session (CLAUDE.md). One section per lane; each lane edits only its own.

## Lead: platform and the dog (M0)

**Ready for your review: phase 0** (spec section 5b)
- `PLAN.md`, `QUESTIONS.md` (23 questions with defaults, 13 engineering decisions), `LIMITATIONS.md`, `GATES.md` and this file.
- The copy lint (R7, section 20): `copy/catalogue.json` holds the 298 strings the spec words, derived from the spec and checked against it; 48 tests; the pre-commit hook lints the staged files; CI runs both on every push: https://github.com/beurni2/HUDDLINGS/actions?query=branch%3Aclaude%2Floving-bardeen-tg3wvd
- The review record (the spec audit and two review rounds of this work): `qa/phase0/spec-audit.md`.
- `LICENSE`: all rights reserved, replacing MIT before the first push (`QUESTIONS.md` D2). The repository stays public (D1).
- A SessionStart hook prepares cloud sessions (the section 5b Python tools, Deno and the Supabase CLI) and turns on the pre-commit hook.
- Nothing to archive (no spec version 2 or Mochi Post spec was here) and nothing carries over (no dog work existed).

**Next**
- Phase 1: the character package format, both runtimes, the test character, CI with Visual QA and parity, the TestFlight lane, the Lab's Diagnostics in an internal-only build, the generated string catalogues and a placeholder icon.

**Blockers**
- Your go-ahead on the plan.
- For TestFlight at the end of phase 1: the Apple pieces in `PLAN.md`, What I need from you.

## Verify at the start of every session

```
git log --oneline -10
python3 tools/copylint/copylint.py
python3 -m unittest discover -s tools/copylint
```
