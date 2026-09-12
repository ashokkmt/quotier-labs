# Quotier Labs

Quotier Labs is a high-performance, offline-first desktop application designed for SMBs in India to create highly customizable, professional business quotations and PDF documents.

## Tech Stack
- **Frontend:** React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Go (Domain/Application layer) + SQLite + Wails (Transport)
- **PDF Engine:** Go native `go-fpdf` (No Chromium required)
- **Architecture:** Clean Architecture principles

## Folder Structure

```text
/
├── apps/
│   └── desktop/           # Wails application entry point and build configurations
│       ├── main.go        # App bootstrap and Wails integration
│       └── build/         # Wails target output (App icons, compiled binaries)
├── backend/               # Go backend adhering to Clean Architecture
│   ├── application/       # Application logic, use cases, orchestrations, and DTOs
│   ├── domain/            # Core entities, value objects, domain logic, and repo interfaces
│   ├── infrastructure/    # Concrete repository implementations (SQLite), PDF gen, CSV IO
│   └── transport/wails/   # Transport boundary mappings (Wails handlers for the frontend)
├── frontend/              # React frontend
│   ├── src/
│   │   ├── components/    # Reusable shadcn/ui and custom primitives
│   │   ├── features/      # Feature-based module grouping (e.g., quotations, customers, templates)
│   │   ├── lib/           # Utility functions
│   │   └── App.tsx        # React application root & routing
├── migrations/            # SQLite schema migration scripts (Goose)
├── plans/                 # Project history, worklogs, and architecture specification
└── scripts/               # Automation scripts for packaging and release
```

## How It Works

Quotier Labs relies on **Wails** to act as a bridge between a fast, modern React frontend and a highly concurrent, memory-safe Go backend. 
- The **Frontend** calculates UI advisory states (for fast responsiveness) and uses Zod to validate input before delegating requests.
- The **Backend** is the absolute source of truth. It receives IPC calls from the frontend, validates inputs rigorously via Domain-driven rules, coordinates with the SQLite local database, and returns normalized DTOs.
- **Documents & PDFs** are constructed entirely natively on the Go backend using `fpdf`, ensuring pixel-perfect representations independent of local browser render engines, saving massive bundle overhead.

## Development Guide

### Prerequisites
- [Go 1.25+](https://go.dev/)
- [Node.js 20+](https://nodejs.org/)
- [Wails v2 CLI](https://wails.io/docs/gettingstarted/installation)

### Running in Development Mode

Always start the desktop app through the repository target:

```bash
make dev
```

This derives a development version from the nearest Git tag, injects BuildInfo, enables HMR, disables in-app updating, and keeps all app-controlled test data inside ignored repository storage:

```text
.devdata/quotier-labs/
  data/db/quotierlabs.sqlite3
  data/assets/
  config/settings.json
  state/recovery/
  logs/
  crashes/
  cache/
  backups/
	  diagnostics/
  exports/
  tmp/
```

Use `make dev-open-data` to inspect it. Use `make dev-reset` for a confirmed, marker-checked reset, or `CONFIRM=1 make dev-reset` in automation. These commands never touch installed beta or production data. Do not run `wails dev` directly: the app deliberately requires the explicit development profile/root.

The Phase 1 document editor is opt-in while V5 remains available. Start with `make dev`, then enable **Settings → Document editor preview**. For a clean builder-design test run:

```bash
CONFIRM=1 make dev-reset
make dev
```

### Local performance diagnostics

Development and beta builds include an explicit, local-only recording in **Settings → Developer diagnostics**. Start a recording before reproducing a CPU, memory, autosave, preview, PDF, or canvas responsiveness issue, then stop it to save a bounded report under `diagnostics/`. The report has timestamped resource samples, allowlisted operation timings, and aggregated frame timing—never quotation contents, customer data, document IDs, SQL, paths, or telemetry uploads.

Development builds also expose bounded CPU (30 seconds), heap, goroutine, and trace (5 seconds) captures while a recording is active. Use `go tool pprof <profile>` or `go tool trace <trace.out>` outside the app. Beta builds deliberately offer recording plus heap/goroutine snapshots only; production keeps the existing user-initiated logs/crash export and does not sample continuously.

On macOS, the in-app report intentionally omits native process-tree CPU/RSS/FD/I/O counters to keep
the embedded WebKit host stable; its Go and frontend measurements remain available. Use Instruments
for native/WebKit memory or CPU investigation.

Use the repeatable workflow and leak interpretation in [`plans/monitoring.md`](plans/monitoring.md). The report-only baselines are available through:

```bash
make perf-bench
make perf-size                 # after a local build has produced build/bin
```

### Code Generation & Bindings
If you change any exported Go structs, DTOs, or Wails Handlers (`backend/transport/wails`), run a build or dev loop to regenerate the TypeScript bindings:
```bash
cd apps/desktop
wails generate module
```

## Building and releases

A local development build is `make build`; it uses development identity/data and cannot self-update.

### Versioning

Git annotated tags are the only release-version source. Do not edit version literals in Go or the Settings UI and never move an existing release tag.

```bash
# Beta after v1.3.0-beta.1
git status                       # must be clean
git tag -s v1.3.0-beta.2 -m "Quotier Labs v1.3.0-beta.2"
git push origin v1.3.0-beta.2

# Stable release
git tag -s v1.3.0 -m "Quotier Labs v1.3.0"
git push origin v1.3.0
```

Use `-a` instead of `-s` only when GPG tag signing is not configured; release scripts reject lightweight tags. `v1.3.0-beta.1` remains the version of its existing commit. New work needs a new tag.

Development versions look like `1.3.0-beta.1+dev.4.gabc123.dirty`. A tagged release reports the exact tag version in Settings, backups, logs, manifests, and updater comparisons.

### Required release credentials

The project cannot create or store your signing credentials. Configure these outside Git:

- `QUOTIER_UPDATE_PUBLIC_KEY`: base64 of the raw 32-byte Ed25519 public key; injected into signed beta/production builds.
- `QUOTIER_UPDATE_PRIVATE_KEY_FILE`: protected Ed25519 PEM private key used only while finalizing release metadata.
- macOS: `APPLE_DEVELOPER_ID_APPLICATION`, `APPLE_DEVELOPER_ID_INSTALLER`, and an `APPLE_NOTARY_PROFILE` created with `xcrun notarytool store-credentials`.
- Windows: `QUOTIER_WINDOWS_CERT_SHA1` for an installed Authenticode certificate and optionally `QUOTIER_WINDOWS_TIMESTAMP_URL`.

Generate the update key once, back it up securely, and never commit it:

```bash
openssl genpkey -algorithm Ed25519 -out quotier-update-private.pem
openssl pkey -in quotier-update-private.pem -pubout -outform DER \
  | tail -c 32 | base64
```

Losing this private key prevents existing installations from trusting a replacement unless a key-rotation release was signed first.

### Native signed artifacts

The signed GitHub Actions workflow is currently parked as
`.github/workflows/release.yml.disabled`. GitHub will not execute a file with that suffix. Keep it
disabled until the Apple and Windows signing credentials in `plans/release-steps.md` are ready;
then rename it back to `release.yml` before creating the release tag.

Release builds must run on the target OS. They reject a dirty tree and require `HEAD` to have an exact annotated SemVer tag.

```bash
QUOTIER_UPDATE_PUBLIC_KEY='base64-public-key' make release
```

The native scripts are:

```bash
./scripts/package-macos.sh
./scripts/package-windows.sh
```

They produce signed/checksummed artifacts in `release-artifacts/`. macOS output is a hardened, signed, notarized, stapled universal DMG for manual installation plus a signed/notarized PKG for native update handoff. Windows output is a per-user NSIS installer with a default Start Menu shortcut, optional desktop shortcut, signed app/uninstaller/installer, and preserved AppData on uninstall. Linux distribution is deferred and is not part of the release pipeline.

After native artifacts are collected in one `release-artifacts/` directory, sign the update manifest:

```bash
QUOTIER_UPDATE_PRIVATE_KEY_FILE=/secure/quotier-update-private.pem \
QUOTIER_UPDATE_PUBLIC_KEY='base64-public-key' \
QUOTIER_MINIMUM_SOURCE_VERSION='1.3.0-beta.1' \
QUOTIER_MINIMUM_DB_SCHEMA='10' \
./scripts/finalize-release.sh
```

When enabled, the GitHub `Signed desktop release` workflow builds on native macOS and Windows runners for a pushed tag, creates a CycloneDX SBOM and provenance attestations, and opens a draft GitHub Release. Configure the repository secrets and variables listed in [`plans/release-steps.md`](plans/release-steps.md) before pushing a release tag. Review the draft and clean-machine evidence before publishing it. Update discovery only sees published releases.

### Native unsigned artifacts (temporary distribution path)

Until signing certificates are available, build independently on each target OS from an exact,
annotated SemVer tag and clean worktree:

```bash
# macOS
./scripts/package-unsigned-macos.sh

# Windows, from Git Bash
./scripts/package-unsigned-windows.sh
```

Outputs are isolated under `local-release-artifacts/`, so these scripts cannot overwrite the
signed pipeline's `release-artifacts/`. The macOS script produces an `.app` and `.dmg`; the Windows
script produces the standalone app `.exe` and per-user NSIS installer `.exe`. These packages are
versioned release builds but are neither notarized nor code-signed. Follow
[`plans/release-without-sign.md`](plans/release-without-sign.md) for prerequisites, publishing,
checksums, OS warning instructions, manual upgrades, and later migration to signed releases.

For CI, export the Developer ID Application and Developer ID Installer identities separately as `MAC_CERT_P12_B64`/`MAC_CERT_PASSWORD` and `MAC_INSTALLER_CERT_P12_B64`/`MAC_INSTALLER_CERT_PASSWORD`. Beta and production have distinct app IDs and data roots; the signed update manifest is channel-bound, so moving from beta to production is an explicit install plus verified backup/import rather than an automatic in-place channel switch.

### In-app updates and migrations

Signed beta/production builds with the embedded update public key enable verified in-app download
and installer handoff. Unsigned tagged builds use a separate notification-only mode: they may check
published GitHub Releases and open the selected release page, but they never download or execute a
package inside the app. Development builds show “Development build — updates disabled.” Settings
lets the user opt into a maximum once-per-24-hour check.

Every update asset is accepted only after its Ed25519 manifest signature, exact size/SHA-256, platform/package match, channel/SemVer rules, and native package signature/structure pass. The old app creates a verified rollback backup before installation. On next launch, pending SQLite migrations run against a staged consistent database copy; integrity and foreign-key checks must pass before it replaces the live generation. Preferences, quotations, assets, and external backups are outside the immutable installed application and remain in the same channel-specific data root.

An update that adds migration `011` needs no special old-app code: ship cumulative embedded migrations `001..011`, set the update manifest schema target through the release script, and test upgrades from every supported older version before publishing. Never edit an already released migration.

### Installed data and uninstall behavior

Installed builds use OS-native per-user data/config/state/log/cache roots. Beta and production are isolated. Application files are immutable; no runtime database, log, backup, or export depends on the launch working directory. Default uninstall removes package-owned application files and launcher registration but preserves quotations, assets, settings, and backups so reinstall/upgrade can rediscover them. User exports and manually selected backups always remain user-owned.

Before publishing, install each artifact on a clean supported machine, launch from the native application list with an arbitrary read-only working directory, exercise backup/restore/PDF, upgrade from the oldest supported release, verify signatures and version identity, uninstall, reinstall, and confirm preserved data.
