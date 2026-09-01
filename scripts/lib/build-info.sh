#!/usr/bin/env bash

set -euo pipefail

QL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
QL_COMMIT="$(git -C "$QL_ROOT" rev-parse HEAD)"
QL_SHORT_COMMIT="$(git -C "$QL_ROOT" rev-parse --short=12 HEAD)"
QL_BUILD_TIME=""
if [[ -n "${SOURCE_DATE_EPOCH:-}" ]]; then
  QL_BUILD_TIME="$(date -u -d "@$SOURCE_DATE_EPOCH" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -r "$SOURCE_DATE_EPOCH" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)"
fi
QL_BUILD_TIME="${QL_BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
QL_PUBLIC_KEY="${QUOTIER_UPDATE_PUBLIC_KEY:-}"

if [[ "${QL_RELEASE_BUILD:-0}" == "1" && "${QL_UNSIGNED_RELEASE_BUILD:-0}" == "1" ]]; then
  echo "Signed and unsigned release modes are mutually exclusive." >&2
  exit 1
fi

if [[ "${QL_RELEASE_BUILD:-0}" == "1" || "${QL_UNSIGNED_RELEASE_BUILD:-0}" == "1" ]]; then
	if [[ "${QL_RELEASE_BUILD:-0}" == "1" ]]; then
		[[ "$QL_PUBLIC_KEY" =~ ^[A-Za-z0-9+/]{43}=$ ]] || { echo "QUOTIER_UPDATE_PUBLIC_KEY must be the base64-encoded raw 32-byte Ed25519 public key." >&2; exit 1; }
	fi
  [[ -z "$(git -C "$QL_ROOT" status --porcelain)" ]] || { echo "Release builds require a clean worktree." >&2; exit 1; }
  QL_TAG="$(git -C "$QL_ROOT" describe --tags --exact-match HEAD 2>/dev/null || true)"
  [[ "$QL_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-beta\.[1-9][0-9]*)?$ ]] || { echo "HEAD must have an exact stable or beta SemVer tag such as v1.3.0-beta.2." >&2; exit 1; }
  git -C "$QL_ROOT" cat-file -p "$QL_TAG" | grep -q '^object ' || { echo "Release tag must be annotated (preferably signed)." >&2; exit 1; }
  QL_VERSION="${QL_TAG#v}"
  if [[ "$QL_VERSION" == *beta* ]]; then QL_CHANNEL="beta"; else QL_CHANNEL="production"; fi
else
  QL_TAG="$(git -C "$QL_ROOT" describe --tags --abbrev=0 2>/dev/null || echo v0.0.0)"
  QL_BASE="${QL_TAG#v}"
  QL_COUNT="$(git -C "$QL_ROOT" rev-list "${QL_TAG}..HEAD" --count 2>/dev/null || echo 0)"
  QL_VERSION="${QL_BASE}+dev.${QL_COUNT}.g${QL_SHORT_COMMIT}"
  [[ -z "$(git -C "$QL_ROOT" status --porcelain)" ]] || QL_VERSION="${QL_VERSION}.dirty"
  QL_CHANNEL="development"
fi

QL_PLATFORM_VERSION="$(printf '%s' "$QL_VERSION" | sed -E 's/^([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
QL_PRERELEASE_NUMBER="$(printf '%s' "$QL_VERSION" | sed -nE 's/.*-beta\.([0-9]+).*/\1/p')"
QL_WINDOWS_VERSION="${QL_PLATFORM_VERSION}.${QL_PRERELEASE_NUMBER:-0}"
QL_MAC_BUILD="$(git -C "$QL_ROOT" rev-list --count HEAD)"
# Wails' NSIS template appends its fourth numeric component. Runtime SemVer
# retains beta/RC detail; native package metadata receives the numeric core.
QL_NAME="Quotier Labs"
QL_APP_ID="com.quotierlabs.QuotierLabs"
if [[ "$QL_CHANNEL" == "beta" ]]; then QL_NAME="Quotier Labs Beta"; QL_APP_ID="${QL_APP_ID}.Beta"; fi
if [[ "$QL_CHANNEL" == "development" ]]; then QL_NAME="Quotier Labs Dev"; QL_APP_ID="${QL_APP_ID}.Dev"; fi

QL_LDFLAGS="-X quotierlabs/backend/infrastructure/appidentity.Version=${QL_VERSION} -X quotierlabs/backend/infrastructure/appidentity.GitTag=${QL_TAG} -X quotierlabs/backend/infrastructure/appidentity.GitCommit=${QL_COMMIT} -X quotierlabs/backend/infrastructure/appidentity.BuildTime=${QL_BUILD_TIME} -X quotierlabs/backend/infrastructure/appidentity.Channel=${QL_CHANNEL}"
if [[ -n "$QL_PUBLIC_KEY" ]]; then
  QL_LDFLAGS+=" -X quotierlabs/backend/infrastructure/appidentity.ReleasePublicKey=${QL_PUBLIC_KEY}"
fi
if [[ "${QL_UNSIGNED_RELEASE_BUILD:-0}" == "1" ]]; then
  QL_LDFLAGS+=" -X quotierlabs/backend/infrastructure/appidentity.ManualUpdates=true"
fi

# Wails' macOS file dialogs use UTType on current SDKs. Export this explicitly
# because some Command Line Tools installations do not retain the framework
# flag from Wails' generated child-process environment.
if [[ "$(uname -s)" == "Darwin" && " ${CGO_LDFLAGS:-} " != *" -framework UniformTypeIdentifiers "* ]]; then
  export CGO_LDFLAGS="${CGO_LDFLAGS:+$CGO_LDFLAGS }-framework UniformTypeIdentifiers"
fi

export QL_ROOT QL_COMMIT QL_BUILD_TIME QL_TAG QL_VERSION QL_CHANNEL QL_PLATFORM_VERSION QL_WINDOWS_VERSION QL_MAC_BUILD QL_NAME QL_APP_ID QL_LDFLAGS
