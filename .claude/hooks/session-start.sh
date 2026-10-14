#!/bin/bash
# Prepares a session to work on Huddlings: the pre-commit checks everywhere,
# and in cloud sessions the production tools of spec section 5b (vtracer, from
# tools/requirements.txt, is the one auto-tracer: a placement guide, never kept). Each step
# warns instead of stopping, so one failed download never skips the others.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}" || exit 0

warn() { echo "session-start: $*" >&2; }

# The copy lint and its tests run before every commit.
git config core.hooksPath .githooks || warn "could not enable .githooks"

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Python tools: reference prep, the sheet match, motion graphs, Visual QA.
pip install --break-system-packages --root-user-action=ignore -q -r tools/requirements.txt \
  || warn "pip install failed; the section 5b Python tools may be missing"

# Deno and the Supabase CLI come from npm: deno.land is blocked by the
# environment's network policy (docs/LIMITATIONS.md).
TOOLS="$HOME/.huddlings-tools"
if [ ! -x "$TOOLS/node_modules/.bin/deno" ] || [ ! -x "$TOOLS/node_modules/.bin/supabase" ]; then
  npm install --silent --no-audit --no-fund --prefix "$TOOLS" deno@2.9.6 supabase@2.120.0 \
    || warn "npm install of deno and supabase failed"
fi
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$TOOLS/node_modules/.bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

exit 0
