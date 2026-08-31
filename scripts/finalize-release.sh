#!/usr/bin/env bash
set -euo pipefail
export QL_RELEASE_BUILD=1
source "$(cd "$(dirname "$0")" && pwd)/lib/build-info.sh"
: "${QUOTIER_UPDATE_PRIVATE_KEY_FILE:?Set QUOTIER_UPDATE_PRIVATE_KEY_FILE to the protected Ed25519 PEM key}"
: "${QUOTIER_MINIMUM_SOURCE_VERSION:?Set the oldest version that may install this update directly}"
: "${QUOTIER_MINIMUM_DB_SCHEMA:?Set the oldest supported database schema number}"
export QL_VERSION QL_CHANNEL QL_TAG
node "$QL_ROOT/scripts/generate-update-manifest.mjs"
(cd "$QL_ROOT/release-artifacts" && shasum -a 256 quotierlabs-update.json quotierlabs-update.json.sig > update-metadata.sha256)
echo "Release metadata is ready in release-artifacts/. Upload packages, checksums, manifest, and signature together."
