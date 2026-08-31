#!/usr/bin/env bash
set -euo pipefail
export QL_RELEASE_BUILD=1
source "$(cd "$(dirname "$0")" && pwd)/lib/build-info.sh"
[[ "${OS:-}" == "Windows_NT" ]] || { echo "Windows installers must be built and signed on Windows." >&2; exit 1; }
: "${QUOTIER_WINDOWS_CERT_SHA1:?Set QUOTIER_WINDOWS_CERT_SHA1 to the Authenticode certificate thumbprint}"
command -v signtool >/dev/null || { echo "signtool is required." >&2; exit 1; }
command -v makensis >/dev/null || { echo "NSIS makensis is required." >&2; exit 1; }
WAILS_BIN="${WAILS_BIN:-$(command -v wails)}"
export QL_VERSION QL_PLATFORM_VERSION QL_APP_ID QL_NAME
export QL_METADATA_VERSION="$QL_WINDOWS_VERSION"
# First build creates Wails' resolved NSIS support file. The application binary
# is then signed and the installer is rebuilt around that exact signed binary.
node "$QL_ROOT/scripts/run-with-metadata.mjs" "$WAILS_BIN" build -platform windows/amd64 -nsis -installscope user -clean -trimpath -ldflags "$QL_LDFLAGS"
APP_EXE="$QL_ROOT/apps/desktop/build/bin/quotierlabs.exe"
cmd.exe /c "$QL_ROOT/scripts/windows-sign.cmd" "$APP_EXE"
pushd "$QL_ROOT/apps/desktop/build/windows/installer" >/dev/null
makensis -DQUOTIER_SIGN_RELEASE=1 -DWAILS_INSTALL_SCOPE=user -DREQUEST_EXECUTION_LEVEL=user -DARG_WAILS_AMD64_BINARY="$APP_EXE" project.nsi
popd >/dev/null
INSTALLER="$(find "$QL_ROOT/apps/desktop/build/bin" -maxdepth 1 -iname '*installer.exe' -print -quit)"
signtool verify /pa /all /v "$INSTALLER"
mkdir -p "$QL_ROOT/release-artifacts"
cp "$INSTALLER" "$QL_ROOT/release-artifacts/quotier-labs-${QL_VERSION}-windows-amd64-installer.exe"
certutil -hashfile "$QL_ROOT/release-artifacts/quotier-labs-${QL_VERSION}-windows-amd64-installer.exe" SHA256 > "$QL_ROOT/release-artifacts/quotier-labs-${QL_VERSION}-windows-amd64-installer.exe.sha256"
echo "Created signed Windows installer."
