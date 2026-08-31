#!/usr/bin/env bash
set -euo pipefail
export QL_RELEASE_BUILD=1
source "$(cd "$(dirname "$0")" && pwd)/lib/build-info.sh"
[[ "$(uname -s)" == "Linux" ]] || { echo "Linux packages must be built and tested on Linux." >&2; exit 1; }
WAILS_BIN="${WAILS_BIN:-$(command -v wails 2>/dev/null || true)}"; WAILS_BIN="${WAILS_BIN:-$(go env GOPATH)/bin/wails}"
[[ -x "$WAILS_BIN" ]] || { echo "Wails CLI is not installed." >&2; exit 1; }
: "${QUOTIER_LINUX_GPG_KEY:?Set QUOTIER_LINUX_GPG_KEY to the release signing key fingerprint}"
command -v gpg >/dev/null || { echo "gpg is required to sign the Linux package." >&2; exit 1; }
export QL_VERSION QL_PLATFORM_VERSION QL_APP_ID QL_NAME
node "$QL_ROOT/scripts/run-with-metadata.mjs" "$WAILS_BIN" build -platform linux/amd64 -clean -trimpath -ldflags "$QL_LDFLAGS"
DEB_VERSION="$(printf '%s' "$QL_VERSION" | sed -E 's/-beta\./~beta./; s/-rc\./~rc./')"
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/DEBIAN" "$STAGE/usr/bin" "$STAGE/usr/share/applications" "$STAGE/usr/share/icons/hicolor/512x512/apps"
install -m 0755 "$QL_ROOT/apps/desktop/build/bin/quotierlabs" "$STAGE/usr/bin/quotier-labs"
install -m 0644 "$QL_ROOT/apps/desktop/build/appicon.png" "$STAGE/usr/share/icons/hicolor/512x512/apps/com.quotierlabs.QuotierLabs.png"
printf '%s\n' '[Desktop Entry]' 'Type=Application' "Name=$QL_NAME" 'Exec=/usr/bin/quotier-labs' 'Icon=com.quotierlabs.QuotierLabs' 'Terminal=false' 'Categories=Office;Finance;' 'StartupNotify=true' > "$STAGE/usr/share/applications/com.quotierlabs.QuotierLabs.desktop"
INSTALLED_SIZE="$(du -sk "$STAGE/usr" | cut -f1)"
printf 'Package: quotier-labs\nVersion: %s\nSection: office\nPriority: optional\nArchitecture: amd64\nInstalled-Size: %s\nMaintainer: Quotier Labs <hello@quotierlabs>\nDepends: libgtk-3-0, libwebkit2gtk-4.1-0\nDescription: Professional offline quotation and PDF editor\n' "$DEB_VERSION" "$INSTALLED_SIZE" > "$STAGE/DEBIAN/control"
desktop-file-validate "$STAGE/usr/share/applications/com.quotierlabs.QuotierLabs.desktop"
OUT="$QL_ROOT/release-artifacts"; mkdir -p "$OUT"
DEB="$OUT/quotier-labs_${DEB_VERSION}_amd64.deb"
dpkg-deb --root-owner-group --build "$STAGE" "$DEB"
dpkg-deb --info "$DEB" >/dev/null
sha256sum "$DEB" > "$DEB.sha256"
gpg --batch --yes --armor --local-user "$QUOTIER_LINUX_GPG_KEY" --detach-sign --output "$DEB.asc" "$DEB"
echo "Created $DEB"
