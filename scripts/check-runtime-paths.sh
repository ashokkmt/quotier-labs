#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Only the central resolver and the explicit, user-visible legacy importer may
# consult process/user defaults. All normal runtime storage consumes AppPaths.
if rg -n 'os\.(Getwd|UserConfigDir|UserCacheDir|TempDir)\(|MkdirTemp\(""|\./backups|quotierlabs\.log' \
  "$ROOT/internal" "$ROOT/apps" \
  --glob '*.go' --glob '!**/*_test.go' \
  --glob '!internal/infrastructure/apppaths/paths.go' \
  --glob '!internal/infrastructure/legacydata/service.go' \
  --glob '!internal/transport/wails/image_handler.go'; then
  echo 'Runtime path policy violation: use the injected AppPaths service.' >&2
  exit 1
fi
