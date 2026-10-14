#!/bin/sh
# Runs before every commit (spec section 5b, Guard rails) on exactly what is
# being committed, the index, not the working tree: the copy lint and its
# tests, the app code's strings, the QA tools' tests, the reference prep's
# tests and outputs, the runtimes' typecheck and tests, and a check that the
# shared test vectors match the code that writes them. A fast Visual QA subset joins in phase 4, with the checks (PLAN.md).
set -e
top=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git -C "$top" checkout-index -a --prefix="$tmp/"
python3 "$tmp/tools/copylint/copylint.py"
python3 -m unittest discover -s "$tmp/tools/copylint" -q
# The app's code shows only catalogue copy outside the Lab.
if [ -d "$tmp/ios/App" ]; then
  python3 "$tmp/tools/copylint/strings_build.py" code "$tmp/ios"
fi
# The Visual QA tools' own tests (the E1 check and parity).
if [ -d "$tmp/tools/qa" ]; then
  python3 -m unittest discover -s "$tmp/tools/qa" -q
fi
# The reference prep's tests and, when a commit touches it, a check that each
# species' ref/ and model.json are what the scripts write from its refmap/.
if [ -d "$tmp/characters/refprep" ]; then
  PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s "$tmp/characters/refprep" -q
  if git -C "$top" diff --cached --name-only | grep -Eq '^characters/(refprep/|[^/]+/(refmap|ref)/|[^/]+/model\.json)'; then
    for refmap in "$tmp"/characters/*/refmap; do
      [ -d "$refmap" ] || continue
      species=$(basename "$(dirname "$refmap")")
      cp -R "$tmp/characters/$species" "$tmp/$species.committed"
      PYTHONDONTWRITEBYTECODE=1 python3 "$tmp/characters/refprep/prepare.py" "$species" > /dev/null
      if ! diff -r -q "$tmp/$species.committed" "$tmp/characters/$species"; then
        echo "pre-commit: characters/$species/ref or model.json is stale; run python3 characters/refprep/prepare.py $species and stage it" >&2
        exit 1
      fi
    done
  fi
fi

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
