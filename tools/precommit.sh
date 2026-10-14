#!/bin/sh
# Runs before every commit (spec section 5b, Guard rails) on exactly what is
# being committed, the index, not the working tree: the copy lint and its
# tests now; a fast Visual QA subset joins once a character package exists.
set -e
top=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git -C "$top" checkout-index -a --prefix="$tmp/"
python3 "$tmp/tools/copylint/copylint.py"
python3 -m unittest discover -s "$tmp/tools/copylint" -q
