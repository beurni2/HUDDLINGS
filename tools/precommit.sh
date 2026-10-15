#!/bin/sh
# Runs before every commit (spec section 5b, Guard rails) on exactly what is
# being committed, the index, not the working tree: the copy lint and its
# tests, the app code's strings, the QA tools' tests, this hook's own tests, the
# reference prep's tests and outputs, the sheet match's and the placement
# guide's tests, the runtimes' typecheck and tests, a check that the shared test
# vectors match the code that writes them, and, when a commit touches what
# draws, renders or judges the dog or the references it is judged against, its
# front's sheet match. A fast Visual QA subset joins in phase 4, with the checks (PLAN.md).
set -e
top=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
sheetmatch="" hooktests=""
# An early exit stops the background tests too; a failing kill must not become the hook's own status.
trap 'for pid in $sheetmatch $hooktests; do kill "$pid" 2> /dev/null || true; done; rm -rf "$tmp"' EXIT
git -C "$top" checkout-index -a --prefix="$tmp/"
staged=$(git -C "$top" diff --cached --name-only)

# The sheet match's tests take the longest of the Python ones and need nothing
# else, so they run beside everything below and are waited for at the end. They
# read their own copy of characters/, so nothing below changes what they read
# while they run: the reference prep's check rewrites ref/ and model.json, and
# the front's match builds the dog into build/, whose atlas.json the match reads.
if [ -d "$tmp/characters/sheetmatch" ]; then
  mkdir "$tmp/sheetmatch-tests"
  cp -R "$tmp/characters" "$tmp/sheetmatch-tests/characters"
  PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s "$tmp/sheetmatch-tests/characters/sheetmatch" -q > "$tmp/sheetmatch.log" 2>&1 &
  sheetmatch=$!
fi
# This hook's own tests, on the hook being committed, beside the rest too: they spend most of their time waiting on
# the stand-ins they run it with, in repositories of their own.
if [ -f "$tmp/tools/test_precommit.py" ]; then
  PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s "$tmp/tools" -p test_precommit.py -q > "$tmp/hooktests.log" 2>&1 &
  hooktests=$!
fi

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
# The placement guide's tests.
if [ -d "$tmp/tools/guide" ]; then
  PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s "$tmp/tools/guide" -q
fi
# The reference prep's tests and, when a commit touches it, a check that each
# species' ref/ and model.json are what the scripts write from its refmap/.
if [ -d "$tmp/characters/refprep" ]; then
  PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s "$tmp/characters/refprep" -q
  if echo "$staged" | grep -Eq '^characters/(refprep/|[^/]+/(refmap|ref)/|[^/]+/model\.json)'; then
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
if [ -f "$tmp/package.json" ]; then
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
  # The dog's front against its sheet, when the commit touches what draws it (its source, the drawing kit, the
  # build), renders it (the runtime and the Lab), judges it (the sheet match, the reference prep) or what it is
  # judged against (its model.json, ref/ and refmap/): the dog built from the committed source, its still rendered
  # and the sheet match run, as CI does, failing the commit when the match fails or cannot run. Its evidence goes
  # to build/qa/front. HUDDLINGS_FRONT_MATCH=0 skips it, for a commit that must land while the front fails.
  # The raster cache is the main checkout's build/cache, which its worktrees share: rasters are keyed on what makes
  # them (characters/build/raster.ts), so any checkout's are good in any other and only changed parts are drawn.
  front='^(characters/(dog/src|draw|build|sheetmatch|refprep)/|runtime-web/(src|lab)/|characters/dog/(model\.json$|ref/|refmap/))'
  if [ -d "$tmp/characters/dog/src" ] && echo "$staged" | grep -Eq "$front"; then
    common=$(git -C "$top" rev-parse --path-format=absolute --git-common-dir)
    cache="$top/build/cache"
    if [ "$(basename "$common")" = .git ]; then cache="$(dirname "$common")/build/cache"; fi
    if [ "${HUDDLINGS_FRONT_MATCH:-1}" = 0 ]; then
      echo "pre-commit: the dog's front sheet match is skipped (HUDDLINGS_FRONT_MATCH=0)" >&2
    elif ! (cd "$tmp" && node runtime-web/lab/look.ts dog front --qa "$tmp/build/qa" --cache "$cache"); then
      rm -rf "$top/build/qa/front" && mkdir -p "$top/build/qa" && cp -R "$tmp/build/qa/front" "$top/build/qa/front" 2> /dev/null || true
      echo "pre-commit: the dog's front fails its sheet match (or the match could not run); see build/qa/front/compare.png" >&2
      exit 1
    fi
  fi
fi

if [ -n "$hooktests" ]; then
  if ! wait "$hooktests"; then
    hooktests=""
    cat "$tmp/hooktests.log" >&2
    echo "pre-commit: the hook's own tests fail" >&2
    exit 1
  fi
  hooktests=""
fi
if [ -n "$sheetmatch" ]; then
  if ! wait "$sheetmatch"; then
    sheetmatch=""
    cat "$tmp/sheetmatch.log" >&2
    echo "pre-commit: the sheet match's tests fail" >&2
    exit 1
  fi
  sheetmatch=""
fi
