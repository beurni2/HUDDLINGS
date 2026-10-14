#!/bin/bash
# Prepares a session to work on Huddlings: the pre-commit checks everywhere,
# and in cloud sessions the production tools of spec section 5b.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

# The copy lint and its tests run before every commit.
git config core.hooksPath .githooks

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Python tools: reference prep, the sheet match, motion graphs, Visual QA.
pip install --break-system-packages --root-user-action=ignore -q -r tools/requirements.txt

# Deno and the Supabase CLI come from npm: deno.land is blocked by the
# environment's network policy (docs/LIMITATIONS.md).
TOOLS="$HOME/.huddlings-tools"
if [ ! -x "$TOOLS/node_modules/.bin/deno" ] || [ ! -x "$TOOLS/node_modules/.bin/supabase" ]; then
  npm install --silent --no-audit --no-fund --prefix "$TOOLS" deno@2.9.6 supabase@2.120.0
fi
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$TOOLS/node_modules/.bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

# potrace: a faint placement guide only, never kept as a part.
if ! command -v potrace >/dev/null 2>&1; then
  (apt-get update -qq && apt-get install -y -qq potrace) >/dev/null 2>&1 || echo "potrace not installed" >&2
fi
