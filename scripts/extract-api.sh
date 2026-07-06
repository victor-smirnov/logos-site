#!/usr/bin/env bash
# Regenerate data/api/*.json from the Logos stdlib.
# Requires a built Logos toolchain (see logos/docs/tooling/docs-json.md).
set -euo pipefail

LOGOS_REPO="${LOGOS_REPO:-$HOME/devel/logos}"
SITE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$SITE_DIR/data/api"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cd "$LOGOS_REPO"
for m in lang mem std; do
  echo "extracting $m…"
  LOGOS_LIB_DIR=build/lib/logos \
    build/bin/logosc --emit-module "stdlib/$m/logos.module" --emit-docs -o "$TMP_DIR/$m"
  build/bin/docgen "$TMP_DIR/$m.docwr" "$OUT_DIR/$m.json"
done
echo "done → $OUT_DIR"
