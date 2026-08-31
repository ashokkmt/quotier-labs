#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/build-info.sh"
export QUOTIERLABS_DEV_ROOT="$QL_ROOT"
export QL_VERSION QL_PLATFORM_VERSION QL_APP_ID QL_NAME
WAILS_BIN="${WAILS_BIN:-$(command -v wails 2>/dev/null || true)}"
WAILS_BIN="${WAILS_BIN:-$(go env GOPATH)/bin/wails}"
[[ -x "$WAILS_BIN" ]] || { echo "Wails CLI is not installed. Run: go install github.com/wailsapp/wails/v2/cmd/wails@v2.15.0" >&2; exit 1; }
exec node "$QL_ROOT/scripts/run-with-metadata.mjs" "$WAILS_BIN" dev -ldflags "$QL_LDFLAGS"
