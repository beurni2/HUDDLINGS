#!/bin/sh
# Runs before every commit (spec section 5b, Guard rails): the copy lint and its
# tests now; a fast Visual QA subset joins once a character package exists.
set -e
cd "$(git rev-parse --show-toplevel)"
python3 tools/copylint/copylint.py
python3 -m unittest discover -s tools/copylint -q 2>&1 | tail -3
