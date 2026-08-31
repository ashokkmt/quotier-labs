#!/usr/bin/env bash
set -euo pipefail
export QL_RELEASE_BUILD=1
source "$(cd "$(dirname "$0")" && pwd)/lib/build-info.sh"
: "${APPLE_DEVELOPER_ID_APPLICATION:?Set APPLE_DEVELOPER_ID_APPLICATION to your Developer ID Application identity}"
: "${APPLE_DEVELOPER_ID_INSTALLER:?Set APPLE_DEVELOPER_ID_INSTALLER to your Developer ID Installer identity}"
: "${APPLE_NOTARY_PROFILE:?Create an xcrun notarytool keychain profile and set APPLE_NOTARY_PROFILE}"
WAILS_BIN="${WAILS_BIN:-$(command -v wails 2>/dev/null || true)}"; WAILS_BIN="${WAILS_BIN:-$(go env GOPATH)/bin/wails}"
[[ -x "$WAILS_BIN" ]] || { echo "Wails CLI is not installed." >&2; exit 1; }
export QL_VERSION QL_PLATFORM_VERSION QL_APP_ID QL_NAME
export QL_METADATA_VERSION="$QL_PLATFORM_VERSION" QL_MAC_BUILD
node "$QL_ROOT/scripts/run-with-metadata.mjs" "$WAILS_BIN" build -platform darwin/universal -clean -trimpath -ldflags "$QL_LDFLAGS"

APP_PATH="$(find "$QL_ROOT/apps/desktop/build/bin" -maxdepth 1 -name '*.app' -print -quit)"
[[ -n "$APP_PATH" ]] || { echo "Wails did not produce an app bundle." >&2; exit 1; }
codesign --force --options runtime --timestamp --sign "$APPLE_DEVELOPER_ID_APPLICATION" "$APP_PATH/Contents/MacOS/quotierlabs"
codesign --force --options runtime --timestamp --sign "$APPLE_DEVELOPER_ID_APPLICATION" "$APP_PATH"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

OUT="$QL_ROOT/release-artifacts"; mkdir -p "$OUT"
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
cp -R "$APP_PATH" "$STAGE/$QL_NAME.app"
ln -s /Applications "$STAGE/Applications"

# The DMG is the familiar drag-to-Applications artifact. The separately signed
# PKG is the native updater handoff: macOS Installer replaces only the app
# bundle and never touches per-user Application Support data.
COMPONENT_PKG="$STAGE/quotier-component.pkg"
PKG="$OUT/quotier-labs-${QL_VERSION}-macos-universal.pkg"
pkgbuild --component "$APP_PATH" --install-location "/Applications/$QL_NAME.app" "$COMPONENT_PKG"
productbuild --package "$COMPONENT_PKG" --sign "$APPLE_DEVELOPER_ID_INSTALLER" "$PKG"
xcrun notarytool submit "$PKG" --keychain-profile "$APPLE_NOTARY_PROFILE" --wait
xcrun stapler staple "$PKG"
xcrun stapler validate "$PKG"
pkgutil --check-signature "$PKG"

DMG="$OUT/quotier-labs-${QL_VERSION}-macos-universal.dmg"
hdiutil create -volname "$QL_NAME" -srcfolder "$STAGE" -ov -format UDZO "$DMG"
codesign --force --timestamp --sign "$APPLE_DEVELOPER_ID_APPLICATION" "$DMG"
xcrun notarytool submit "$DMG" --keychain-profile "$APPLE_NOTARY_PROFILE" --wait
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"
spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG"
shasum -a 256 "$DMG" > "$DMG.sha256"
shasum -a 256 "$PKG" > "$PKG.sha256"
echo "Created signed and notarized macOS DMG and update PKG."
