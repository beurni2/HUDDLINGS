# Tools

Production tools that never ship in the app.

- `copylint/`: the copy lint (rules R7 and section 20). It fails the build on banned words, exclamation marks, the literal word Mochi outside feature names, unknown placeholders, and words notifications may not use. Run `python3 tools/copylint/copylint.py`; its tests run with `python3 -m unittest discover -s tools/copylint -t .`
- `precommit.sh`: what runs before every commit (the copy lint and its tests now; a fast Visual QA subset once a character package exists).
