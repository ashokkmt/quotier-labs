#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/.devdata/quotier-labs"
MARKER="$TARGET/.quotier-devdata"
[[ -f "$MARKER" ]] || { echo "No marker-owned Quotier Labs development data exists."; exit 0; }
if [[ "${CONFIRM:-0}" != "1" ]]; then
  printf 'Delete all Quotier Labs development data at %s? Type DELETE: ' "$TARGET"
  read -r answer
  [[ "$answer" == "DELETE" ]] || { echo "Cancelled."; exit 1; }
fi
rm -rf -- "$TARGET"
echo "Development data removed. Production and beta data were untouched."
