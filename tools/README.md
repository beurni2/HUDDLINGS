# Tools

Production tools that never ship in the app.

- `copylint/`: the copy lint (rule R7 and section 20). It fails the build on banned words, exclamation marks, the literal word Mochi outside feature names, unknown placeholders and printf specifiers, the words notifications may not use, names on the Lock Screen and placeholders in InfoPlist copy. Run `python3 tools/copylint/copylint.py`; its tests run with `python3 -m unittest discover -s tools/copylint`.
- `copy/catalogue.json` (at the repository root) is the single source of user-visible copy. The app's string catalogues, the notification templates in `server/` and the web page's copy are generated from it when each is built, never written inline; the lint also reads every `.xcstrings`, `.strings`, `.stringsdict` and `Info.plist` file and the Info.plist properties in `ios/project.yml`. `python3 tools/copylint/spec_catalogue.py --write` regenerates the catalogue from the spec.
- `precommit.sh`: what runs before every commit, on the staged files: the copy lint and its tests now, and a fast Visual QA subset once a character package exists. The SessionStart hook turns it on (`git config core.hooksPath .githooks`); outside Claude Code, run that command once.
- `requirements.txt`: the Python tools of spec section 5b, pinned for Python 3.11 to 3.13.
