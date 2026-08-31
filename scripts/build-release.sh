#!/usr/bin/env bash
set -euo pipefail
export QL_RELEASE_BUILD=1
source "$(cd "$(dirname "$0")" && pwd)/lib/build-info.sh"
[[ -n "$QL_PUBLIC_KEY" ]] || { echo "QUOTIER_UPDATE_PUBLIC_KEY is required so the signed build can verify future releases." >&2; exit 1; }

echo "Testing exact tagged source for $QL_VERSION..."
(cd "$QL_ROOT" && go test -race ./...)
(cd "$QL_ROOT/frontend" && npm ci && npm run test && npm run build)
mkdir -p "$QL_ROOT/release-artifacts"

case "$(uname -s)" in
  Darwin) "$QL_ROOT/scripts/package-macos.sh" ;;
  Linux) "$QL_ROOT/scripts/package-linux.sh" ;;
  MINGW*|MSYS*|CYGWIN*) "$QL_ROOT/scripts/package-windows.sh" ;;
  *) echo "Unsupported release host. Build each package on its native OS." >&2; exit 1 ;;
esac

echo "Native artifact built. Combine all native-job artifacts, generate an SBOM with Syft, then run scripts/finalize-release.sh."
