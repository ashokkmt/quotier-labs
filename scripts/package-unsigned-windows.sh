#!/usr/bin/env bash
set -euo pipefail

[[ "${OS:-}" == "Windows_NT" ]] || { echo "Run this script from Git Bash on Windows." >&2; exit 1; }
export QL_UNSIGNED_RELEASE_BUILD=1
unset QUOTIER_UPDATE_PUBLIC_KEY
source "$(cd "$(dirname "$0")" && pwd)/lib/build-info.sh"

WAILS_BIN="${WAILS_BIN:-$(command -v wails 2>/dev/null || true)}"
[[ -n "$WAILS_BIN" ]] || { echo "Wails CLI is not installed. Run: go install github.com/wailsapp/wails/v2/cmd/wails@v2.15.0" >&2; exit 1; }
command -v makensis >/dev/null || { echo "NSIS is required and makensis must be on PATH." >&2; exit 1; }

echo "Testing tagged source for $QL_VERSION..."
(cd "$QL_ROOT" && go test ./...)
(cd "$QL_ROOT/frontend" && npm ci && npm run test -- --run)

export QL_VERSION QL_PLATFORM_VERSION QL_APP_ID QL_NAME
export QL_METADATA_VERSION="$QL_WINDOWS_VERSION"
node "$QL_ROOT/scripts/run-with-metadata.mjs" "$WAILS_BIN" build \
  -platform windows/amd64 -nsis -installscope user -clean -trimpath -ldflags "$QL_LDFLAGS"

APP_EXE="$QL_ROOT/apps/desktop/build/bin/quotierlabs.exe"
INSTALLER="$(find "$QL_ROOT/apps/desktop/build/bin" -maxdepth 1 -iname '*installer.exe' -print -quit)"
[[ -f "$APP_EXE" ]] || { echo "Wails did not produce quotierlabs.exe." >&2; exit 1; }
[[ -n "$INSTALLER" && -f "$INSTALLER" ]] || { echo "Wails did not produce an NSIS installer." >&2; exit 1; }

OUT="$QL_ROOT/local-release-artifacts/windows"
mkdir -p "$OUT"
APP_OUT="$OUT/quotier-labs-${QL_VERSION}-windows-amd64-unsigned.exe"
INSTALLER_OUT="$OUT/quotier-labs-${QL_VERSION}-windows-amd64-unsigned-installer.exe"
cp "$APP_EXE" "$APP_OUT"
cp "$INSTALLER" "$INSTALLER_OUT"
certutil -hashfile "$APP_OUT" SHA256 > "$APP_OUT.sha256"
certutil -hashfile "$INSTALLER_OUT" SHA256 > "$INSTALLER_OUT.sha256"

echo "Created unsigned local Windows artifacts:"
echo "  $APP_OUT"
echo "  $INSTALLER_OUT"
echo "Windows SmartScreen may warn on other PCs because these files are not Authenticode-signed."
