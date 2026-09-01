#!/usr/bin/env bash
set -euo pipefail

[[ "$(uname -s)" == "Darwin" ]] || { echo "Run this script on macOS." >&2; exit 1; }
export QL_UNSIGNED_RELEASE_BUILD=1
unset QUOTIER_UPDATE_PUBLIC_KEY
source "$(cd "$(dirname "$0")" && pwd)/lib/build-info.sh"

WAILS_BIN="${WAILS_BIN:-$(command -v wails 2>/dev/null || true)}"
WAILS_BIN="${WAILS_BIN:-$(go env GOPATH)/bin/wails}"
[[ -x "$WAILS_BIN" ]] || { echo "Wails CLI is not installed. Run: go install github.com/wailsapp/wails/v2/cmd/wails@v2.15.0" >&2; exit 1; }
command -v hdiutil >/dev/null || { echo "hdiutil is required." >&2; exit 1; }

echo "Testing tagged source for $QL_VERSION..."
(cd "$QL_ROOT" && go test ./...)
(cd "$QL_ROOT/frontend" && npm ci && npm run test -- --run)

export QL_VERSION QL_PLATFORM_VERSION QL_APP_ID QL_NAME
export QL_METADATA_VERSION="$QL_PLATFORM_VERSION" QL_MAC_BUILD
node "$QL_ROOT/scripts/run-with-metadata.mjs" "$WAILS_BIN" build \
  -platform darwin/universal -clean -trimpath -ldflags "$QL_LDFLAGS"

APP_PATH="$(find "$QL_ROOT/apps/desktop/build/bin" -maxdepth 1 -name '*.app' -print -quit)"
[[ -n "$APP_PATH" ]] || { echo "Wails did not produce an app bundle." >&2; exit 1; }

OUT="$QL_ROOT/local-release-artifacts/macos"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$OUT"
rm -rf "$OUT/$QL_NAME.app"
cp -R "$APP_PATH" "$OUT/$QL_NAME.app"
cp -R "$APP_PATH" "$STAGE/$QL_NAME.app"
ln -s /Applications "$STAGE/Applications"

DMG="$OUT/quotier-labs-${QL_VERSION}-macos-universal-unsigned.dmg"
hdiutil create -volname "$QL_NAME" -srcfolder "$STAGE" -ov -format UDZO "$DMG"
shasum -a 256 "$DMG" > "$DMG.sha256"

echo "Created unsigned local macOS artifacts:"
echo "  $OUT/$QL_NAME.app"
echo "  $DMG"
echo "Gatekeeper will warn on other Macs because these artifacts are not signed or notarized."
