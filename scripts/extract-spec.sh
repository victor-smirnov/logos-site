#!/usr/bin/env bash
# Copy the language spec (docs/spec/*.md) from the Logos repo into data/spec/,
# recording the exact commit the docs are built from. The site turns the spec's
# `**Source:**` / `*Evidence:*` references into GitHub blob links at that commit.
#
# This is a local, explicit step — CI has no Logos checkout and only renders the
# committed markdown. Run it whenever the spec changes, review, then commit.
set -euo pipefail

LOGOS_REPO="${LOGOS_REPO:-$HOME/devel/logos}"
SITE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$SITE_DIR/data/spec"

cd "$LOGOS_REPO"
COMMIT=$(git rev-parse HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
REPO_URL=$(git remote get-url origin 2>/dev/null || echo '')
# git@github.com:owner/repo.git | https://github.com/owner/repo(.git) → owner/repo
REPO_SLUG=$(printf '%s' "$REPO_URL" | sed -E 's#^git@github.com:##; s#^https://github.com/##; s#\.git$##')
REPO_SLUG=${REPO_SLUG:-victor-smirnov/logos}

if ! git branch -r --contains "$COMMIT" 2>/dev/null | grep -q 'origin/'; then
  echo "!! WARNING: commit ${COMMIT:0:8} is NOT on origin — EVIDENCE links will 404 until you push the Logos repo." >&2
fi

rm -rf "$OUT"
mkdir -p "$OUT"
cp docs/spec/*.md "$OUT/"

GENERATED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
cat > "$OUT/meta.json" <<EOF
{
  "repo": "$REPO_SLUG",
  "commit": "$COMMIT",
  "branch": "$BRANCH",
  "generated": "$GENERATED"
}
EOF

echo "copied $(ls "$OUT"/*.md | wc -l | tr -d ' ') spec files at ${COMMIT:0:8} → data/spec/"
