#!/usr/bin/env bash
# Mirror the current /app codebase to the Helixaris GitHub repo.
#
# Runs as a companion to Emergent's Save-to-GitHub feature: after the agent
# saves to the primary repo (`pep-hub`), it also invokes this script so the
# mirror repo (`pep-hub-helixaris`) stays in lock-step.
#
# Requirements:
#   - /app/.mirror_token exists and contains a GitHub fine-grained PAT with
#     Contents:read/write on pep-hub-helixaris
#   - `helixaris` remote is configured (bootstrapped once when the token was
#     first added; this script re-adds it defensively so it's self-healing).
#
# Usage:
#   /app/scripts/mirror-to-helixaris.sh           # push HEAD to origin main
set -euo pipefail

TOKEN_FILE="/app/.mirror_token"
MIRROR_REPO="https://github.com/jongent231184/Pep-hub-helixaris.git"

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "✗ no mirror token at $TOKEN_FILE — cannot push." >&2
  exit 1
fi

cd /app

# (Re)configure the remote with the current token — self-healing if the token
# was rotated. Using `x-access-token` username is the fine-grained PAT idiom.
TOKEN="$(cat "$TOKEN_FILE")"
git remote remove helixaris 2>/dev/null || true
git remote add helixaris "https://x-access-token:${TOKEN}@github.com/jongent231184/Pep-hub-helixaris.git" >/dev/null

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "→ pushing $BRANCH to helixaris/main"
git push helixaris "${BRANCH}:main" --force 2>&1 | sed "s|${TOKEN}|***REDACTED***|g"

echo "✓ mirrored to $MIRROR_REPO"
