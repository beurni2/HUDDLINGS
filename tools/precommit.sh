#!/bin/sh
# Runs before every commit (spec section 5b, Guard rails) on exactly what is
# being committed, the index, not the working tree: the copy lint and its
# tests, the runtimes' typecheck and tests, and a check that the shared test
# vectors match the code that writes them. A fast Visual QA subset joins once
# a character package exists.
set -e
top=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git -C "$top" checkout-index -a --prefix="$tmp/"
python3 "$tmp/tools/copylint/copylint.py"
python3 -m unittest discover -s "$tmp/tools/copylint" -q

# The runtime checks, wherever the committed tree has the runtime.
[ -f "$tmp/package.json" ] || exit 0
if [ ! -d "$top/node_modules" ]; then
  echo "pre-commit: run npm install first; the runtime checks need it" >&2
  exit 1
fi
ln -s "$top/node_modules" "$tmp/node_modules"
(cd "$tmp" && npx tsc -p tsconfig.json)
(cd "$tmp" && npm test --silent)
# The vectors both runtimes are held to must be the ones this code writes.
cp -R "$tmp/characters/format/vectors" "$tmp/vectors.committed"
(cd "$tmp" && node characters/format/make-vectors.ts > /dev/null)
if ! diff -r -q "$tmp/vectors.committed" "$tmp/characters/format/vectors"; then
  echo "pre-commit: characters/format/vectors is stale; run npm run vectors and stage it" >&2
  exit 1
fi
