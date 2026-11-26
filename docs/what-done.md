# Quotier Labs Desktop Runtime, Updates, and Release System

This document explains the desktop runtime and release system now implemented in Quotier Labs. It is both an engineering handoff and an operator runbook. It covers development runs, installed application data, backup and recovery, version injection, signed native packages, the GitHub release workflow, in-app updates, database migrations, and the V5-only document boundary.

## 1. System outcome

Quotier Labs no longer treats the process working directory or installed executable directory as writable application storage.

```text
Immutable installed application
  ├── executable, bundle resources, icons, package metadata
  └── replaced only by the OS installer

Writable per-channel application data
  ├── SQLite database and managed images
  ├── preferences and recovery checkpoints
  ├── logs and local crash records
  ├── disposable cache/WebView data
  └── private process temporary files

User-owned files
  ├── exported PDFs and CSV files
  └── manually selected backup locations
```

Production, beta, and development builds use different identities and different data roots. They cannot accidentally open the same live database.

The application now has:

- one tag-derived `BuildInfo` contract used by runtime UI, logs, backups, packages, and updater checks;
- one injected `AppPaths` resolver for all application-controlled filesystem locations;
- repository-local development data under `.devdata/quotier-labs`;
- staged SQLite migrations with integrity checks and a preserved pre-migration generation;
- verified backups containing the database, metadata, and managed assets;
- local bounded logs, crash records, diagnostics export, and recovery checkpoints;
- signed-manifest update discovery, download, verification, pre-update backup, native installer handoff, and first-launch health confirmation;
- native Windows, macOS, and Debian release packaging scripts;
- a multi-platform GitHub Actions release workflow that creates a draft release;
- an explicit migration screen for databases created by the former CWD-based desktop runtime;
- schema V5 as the only supported editor, persistence, template, preview, and PDF document model.

## 2. Application identity and versions

The release version comes from an exact Git tag. It is not manually edited in Go, React, Wails configuration, backup code, or the Settings page.

| Channel | Display name | Application ID | Data isolation |
|---|---|---|---|
| Production | Quotier Labs | `com.quotierlabs.QuotierLabs` | production roots |
| Beta | Quotier Labs Beta | `com.quotierlabs.QuotierLabs.Beta` | beta roots |
| Development | Quotier Labs Dev | `com.quotierlabs.QuotierLabs.Dev` | repository `.devdata` |

Release tags accepted by the scripts are:

```text
vMAJOR.MINOR.PATCH
vMAJOR.MINOR.PATCH-beta.N
```

The tag must point exactly to `HEAD`, be annotated (preferably GPG-signed), and the worktree must be clean. Lightweight tags, arbitrary prerelease labels, moved tags, and dirty release trees are rejected.

For a release, `scripts/lib/build-info.sh` derives and injects:

- semantic version and Git tag;
- full commit SHA and build time;
- production or beta channel;
- product name and channel-specific application ID;
- Windows four-part numeric file version;
- macOS numeric bundle build number;
- the Ed25519 update public key.

For development, the nearest tag becomes a descriptive non-release version such as:

```text
1.3.0-beta.1+dev.1.gabc123456789.dirty
```

Development builds always use the development identity and have self-update disabled, even when they are built in Wails production mode for local performance testing.

## 3. Filesystem behavior

### Development

`make dev` and `make build` set the explicit development profile. All app-controlled runtime artifacts remain in the repository:

```text
.devdata/quotier-labs/
  .quotier-devdata
  data/
    db/quotierlabs.sqlite3
    assets/
  config/settings.json
  state/
    recovery/
    update-backups/
    restore-backups/
  logs/quotierlabs.jsonl
  crashes/
  cache/
  webview/
  runtime/
  backups/
  exports/
  tmp/session-*/
```

The marker file is required by `make dev-reset`. Reset refuses to remove the directory without that marker. `.devdata` and `release-artifacts` are ignored by Git.

### Installed builds

| Data class | Windows | macOS | Linux |
|---|---|---|---|
| Application | `%LOCALAPPDATA%\Programs\Quotier Labs…` | `/Applications/Quotier Labs….app` | `/usr/bin/quotier-labs` and `/usr/share` integration |
| Database/assets | `%LOCALAPPDATA%\Quotier Labs\Quotier Labs…\data` | `~/Library/Application Support/<app-id>/data` | `$XDG_DATA_HOME/quotier-labs…` |
| Preferences | `%APPDATA%\Quotier Labs\Quotier Labs…\config` | `~/Library/Application Support/<app-id>/config` | `$XDG_CONFIG_HOME/quotier-labs…` |
| State/recovery | Local AppData application state | Application Support state | `$XDG_STATE_HOME/quotier-labs…` |
| Logs/crashes | Local AppData logs/crashes | `~/Library/Logs/<app-id>` | XDG state logs/crashes |
| Cache/WebView | Local AppData cache/webview | `~/Library/Caches/<app-id>` | `$XDG_CACHE_HOME/quotier-labs…` |

Relative XDG variables are ignored. Runtime directories are created with restrictive permissions. Managed images are stored by content hash and persisted as `asset:<name>`, not absolute paths. PNG, JPEG, and WebP uploads are checked for encoded type, size, decoded format, dimensions, and pixel count.

The app uses a single-instance lock. Process temporary data is random and private, stale session directories are cleaned, and user export paths always come from native Save/Open dialogs.

## 4. Existing-data migration

The former desktop runtime could create `quotierlabs.db` beside the project or executable. On an empty new data root, the application searches only the known legacy candidates. If a valid candidate exists, startup displays an explicit choice:

- import the selected data and restart; or
- start with fresh channel-local data.

Import performs a read-only SQLite snapshot, integrity validation, managed-image migration, target rollback preservation, and an atomic promotion. It never edits or deletes the source database. A receipt prevents the prompt from recurring after the user makes a choice. The next launch applies any cumulative database migrations to a staged copy.

## 5. Database migrations and update compatibility

Database migrations remain numbered, cumulative Goose migrations embedded in the executable. Existing migration files must never be edited after release.

When a database schema is older than the executable:

1. the live database is checkpointed;
2. available disk space is checked;
3. SQLite creates a consistent staged generation with `VACUUM INTO`;
4. pending embedded migrations run against the stage;
5. `integrity_check` and `foreign_key_check` must pass;
6. the old database is renamed to a timestamped rollback generation;
7. the validated stage is promoted to the live path.

A database newer than the executable is rejected, preventing an old binary from silently damaging newer data.

Each signed update manifest declares:

- the oldest app version allowed to install it directly;
- the oldest database schema it accepts;
- its resulting database schema;
- its resulting document schema.

If a future release adds migration `011`, the new binary ships all migrations through `011`. Set `QUOTIER_MINIMUM_DB_SCHEMA` to the oldest schema actually tested for that release. The manifest generator calculates the resulting schema from the migration filenames. The first launch after installation migrates exactly once through the staged path above.

## 6. Backup, restore, recovery, and diagnostics

Backups are consistent SQLite snapshots and include:

- `database/quotierlabs.sqlite3`;
- every managed asset;
- version/channel/schema/count metadata;
- a manifest containing a SHA-256 digest for every included member.

Archives are assembled into a private workspace, written to a `.partial` file, flushed, validated, and atomically published. Restore rejects unsafe paths, symlinks, duplicate/unlisted members, hash failures, member-count excess, oversized expansion, invalid SQLite data, and backups from a newer unsupported schema. A verified rollback backup is created before restore. Restore swaps database and asset generations and then exits so all repositories reopen cleanly.

Automatic backup is opt-in and requires an explicit absolute directory. It runs shortly after startup and hourly thereafter, reports last success/failure in Settings, and retains a conservative maximum of 12 verified Quotier archives, 30 days, or 2 GiB. Unknown files are never deleted.

Recovery checkpoints moved from WebView-only storage into the application state root using atomic writes. Theme and density are persisted in native configuration; browser storage is only a first-paint cache.

JSON logs rotate at 10 MiB with five retained generations. Development also logs readable debug output to the terminal. Local crash metadata is bounded and path-redacted. Diagnostics export is user-initiated and contains build metadata, logs, and crash records only—never the database, quotation content, recovery documents, or images.

## 7. In-app updater behavior

Only a signed beta or production build containing the update public key enables the updater.

### Discovery

The app queries published GitHub Releases through a provider boundary. Automatic checks are opt-in, run at most every 24 hours with a small startup jitter, and never automatically download or install. GitHub ETag and Last-Modified values reduce repeated traffic.

Production accepts only production manifests. Beta accepts only beta manifests. The application ID, channel, and data root therefore remain consistent; promotion from beta to production is an explicit separate installation and verified data transfer, not an automatic channel switch.

The Settings page supports:

- manual check;
- automatic-check preference;
- current version/channel/build information;
- release notes and package size;
- Later and Skip this version (non-critical releases);
- download progress and cancellation;
- explicit install action;
- diagnostics export.

### Trust chain

An update is not a candidate merely because GitHub serves it. The app requires:

1. HTTPS and an allowlisted GitHub download host;
2. an Ed25519-signed `quotierlabs-update.json`;
3. exact application ID and channel;
4. strict SemVer and no feed downgrade below the last observed signed version;
5. compatible source/database/document schema ranges;
6. an exact OS, architecture, and package-kind match;
7. the signed asset size and SHA-256 digest;
8. native package verification before enabling Install.

Downloads use a private partial file, have bounded response-header timeouts, remain cancellable during slow transfers, and are atomically promoted only after verification. The cache retains the current and one prior version.

### Installation transaction

Before native installation, the app stops automatic backup and creates a verified update rollback backup. It writes an update transaction containing from/to versions and expected schemas, starts the OS installer, and exits.

- Windows starts the signed NSIS installer with `/UPDATE`; it waits for the old process, replaces package-owned files, preserves AppData, relaunches the app, and keeps the normal uninstall identity.
- macOS opens a Developer ID Installer-signed, notarized, stapled PKG. The system installer replaces the application bundle in `/Applications`; Application Support data is outside the bundle and remains untouched. The DMG remains the normal manual-install artifact.
- Linux opens the signed-manifest-verified Debian package in the system package UI. The package manager replaces `/usr` files and leaves all XDG user data untouched.

The new executable validates that its embedded database/document schema targets match the pending signed transaction before migration. After dependencies, repositories, handlers, and UI runtime start successfully, it marks the update healthy, clears the pending transaction, and shows a one-time “Updated to…” notice.

The macOS adapter intentionally uses the native signed PKG/System Installer contract rather than silently replacing the live bundle. It delivers the requested in-app check/download/verify flow while retaining explicit OS authorization and package receipts. It does not embed Sparkle or perform an unattended bundle swap.

## 8. Native packages and uninstall behavior

### Windows

The default package is a per-user NSIS installer under Local AppData Programs. It creates a Start Menu shortcut, offers the desktop shortcut as an optional component, registers uninstall, runs unelevated, and signs the executable, uninstaller, and final installer with Authenticode plus timestamping. Default uninstall removes package files and shortcuts, not quotations or settings.

### macOS

The build is universal. The app and DMG use Developer ID Application signing, hardened runtime, notarization, stapling, and Gatekeeper assessment. A Developer ID Installer-signed/notarized/stapled PKG is produced for update handoff. The canonical bundle ID is injected from the same channel identity.

### Linux

The Debian package installs the binary, desktop entry, and hicolor icon under `/usr`. It declares GTK/WebKit dependencies, validates the desktop entry and package structure, emits SHA-256, and requires an armored detached GPG signature. Runtime data remains under XDG user roots and is not removed by package uninstall.

## 9. Script reference

### `scripts/lib/build-info.sh`

The shared identity/version gate. It validates release tags and cleanliness, derives development versions, maps platform versions, builds Go `-ldflags`, validates the update public key, and exports the channel-specific name/application ID. All build/package/finalization scripts source it.

### `scripts/dev.sh`

Runs Wails development mode with HMR, injected development BuildInfo, explicit repository root, development identity, and disabled updater. This is what `make dev` invokes.

### `scripts/build-local.sh`

Creates a local packaged development build with the same repository-local runtime-data behavior as `make dev`. It checks that the pinned Wails CLI exists and injects metadata. This is what `make build` invokes.

### `scripts/dev-reset.sh`

Deletes only `.devdata/quotier-labs`, only when its marker is present, and normally requires the operator to type `DELETE`. `CONFIRM=1 make dev-reset` is available for controlled automation.

### `scripts/check-runtime-paths.sh`

A policy gate used by lint and CI. It searches production Go code for direct CWD/user-cache/temp resolution and known legacy relative paths outside the central resolver and explicit legacy importer.

### `scripts/run-with-metadata.mjs`

Temporarily projects the derived product name, platform version, app ID, macOS build number, and Windows assembly identity into Wails/plist/manifest inputs, runs Wails, and restores the source files in `finally`. It prevents generated platform metadata from becoming a second manually maintained version source.

### `scripts/build-release.sh`

The native-host release entry point behind `make release`. It forces release validation, runs Go race tests plus clean frontend install/tests/build, then dispatches to the current operating system's package script. One machine cannot truthfully produce all native signed artifacts; CI runs the full matrix.

### `scripts/package-windows.sh` and `scripts/windows-sign.cmd`

Build the per-user NSIS package on Windows, sign the app, let NSIS sign its generated uninstaller and installer, verify Authenticode, and place the installer/checksum in `release-artifacts`.

### `scripts/package-macos.sh`

Builds the universal app, signs and verifies the bundle, creates the signed/notarized/stapled manual-install DMG, creates the signed/notarized/stapled native-update PKG, assesses both, and writes checksums.

### `scripts/package-linux.sh`

Builds the Linux application, assembles and validates a Debian package with desktop integration, creates SHA-256 metadata, and creates a required detached GPG signature.

### `scripts/generate-update-manifest.mjs`

Finds the installable native artifacts, computes exact sizes and SHA-256 hashes, derives resulting database schema from migrations, creates the channel/app/schema-bound update manifest, signs its exact bytes with Ed25519, and verifies that the private key matches the public key embedded in the released apps.

The macOS DMG is intentionally excluded from updater selection; the PKG is selected. Checksums, signatures, SBOM files, and other metadata are never misclassified as installer assets.

### `scripts/finalize-release.sh`

Validates the release/tag context and required compatibility variables, invokes the manifest signer, and creates hashes for update metadata after all native artifacts have been collected.

### Make targets

| Target | Purpose |
|---|---|
| `make dev` | Wails HMR development run with repository-local data |
| `make build` | packaged local development build |
| `make dev-open-data` | open `.devdata/quotier-labs` |
| `make dev-reset` | marker-protected development reset |
| `make test` | Go race suite and frontend tests |
| `make lint` | runtime-path policy, Go lint, frontend lint |
| `make generate` | regenerate bindings/types |
| `make migrate` | apply Goose to the marked development database only |
| `make release` | signed native package for the current host |

## 10. GitHub release workflow

`.github/workflows/release.yml` runs when an accepted `v*.*.*` tag is pushed. Invalid tags still fail inside the build gate.

1. **verify** checks out source, installs pinned Go/Node, installs frontend dependencies, checks runtime-path policy, runs Go race tests, frontend tests, and frontend production build.
2. **macos** imports separate Developer ID Application and Installer certificates, configures notarization, builds/signs/notarizes the universal DMG and PKG, and uploads them.
3. **windows** imports the Authenticode PFX, installs NSIS/Windows SDK tooling, builds and signs the per-user installer, and uploads it.
4. **linux** installs native build dependencies, imports the GPG release key, builds the Debian package/checksum/detached signature, and uploads them.
5. **publish** merges native artifacts, reconstructs the protected Ed25519 update key, signs the update manifest, creates a CycloneDX SBOM, attaches GitHub build provenance attestations, and opens a draft GitHub Release.

The workflow deliberately creates a draft. The updater cannot see it until you complete clean-machine checks and publish it.

## 11. Required GitHub configuration

Configure these repository secrets; never commit their values:

| Secret | Purpose |
|---|---|
| `QUOTIER_UPDATE_PUBLIC_KEY` | raw 32-byte Ed25519 public key, base64 |
| `UPDATE_PRIVATE_KEY_PEM_B64` | protected Ed25519 private PEM, base64 for CI |
| `MAC_CERT_P12_B64` / `MAC_CERT_PASSWORD` | Developer ID Application identity |
| `MAC_INSTALLER_CERT_P12_B64` / `MAC_INSTALLER_CERT_PASSWORD` | Developer ID Installer identity |
| `APPLE_DEVELOPER_ID_APPLICATION` | exact codesign identity string |
| `APPLE_DEVELOPER_ID_INSTALLER` | exact productbuild identity string |
| `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD` | notarization credentials |
| `WINDOWS_CERT_PFX_B64`, `WINDOWS_CERT_PASSWORD` | Authenticode identity |
| `LINUX_GPG_PRIVATE_KEY_B64` | Linux release private key export |
| `QUOTIER_LINUX_GPG_KEY` | Linux signing-key fingerprint |

Configure these repository variables for every release:

| Variable | Meaning |
|---|---|
| `QUOTIER_MINIMUM_SOURCE_VERSION` | oldest app version allowed to update directly |
| `QUOTIER_MINIMUM_DB_SCHEMA` | oldest database schema verified for this release |

## 12. Your next release

Do not move `v1.3.0-beta.1`; it permanently names its existing commit. After this work is reviewed and committed, create a new tag.

```bash
git status
go test -race ./...
cd frontend && npm ci && npm test -- --run && npm run build && cd ..

# Next beta example
git tag -s v1.3.0-beta.2 -m "Quotier Labs v1.3.0-beta.2"
git push origin v1.3.0-beta.2
```

Use `git tag -a` only if signed Git tags are not configured. The release pipeline still requires an annotated tag.

After pushing:

1. watch the `Signed desktop release` workflow;
2. inspect all package signatures, checksums, SBOM, provenance, and signed manifest in the draft;
3. install on clean Windows, macOS, and Ubuntu machines;
4. launch from the Start Menu/Finder/application launcher, not a source terminal;
5. verify version/channel in Settings;
6. test new install, upgrade from the oldest supported release, backup/restore, PDF export, uninstall/reinstall, and preserved data;
7. publish the draft only after all advertised platforms pass;
8. from an older signed build, verify check → download → native installer → migrated launch → one-time healthy-update notice.

To build only the current platform locally, first check out a clean exact tag and provide that platform's signing credentials plus `QUOTIER_UPDATE_PUBLIC_KEY`, then run:

```bash
make release
```

Local unsigned builds are development builds and intentionally cannot self-update.

If the in-app check is unavailable, a user may manually download the matching published Windows installer, macOS DMG/PKG, or Debian package and install it over the same channel. The package replaces only installed application files; the next launch reuses the existing channel data root and performs the same staged migrations. Never copy a new executable over a running installation and never move a beta database into production by hand—use a verified Quotier backup/import.

## 13. Legacy builder and compatibility removal

The old frontend builder, recursive canvas components, command stack, section library UI/routes,
V1–V4 schemas and migration service, legacy PDF layout engine, section repository, section seeds,
and automatic migration endpoint were removed after the product owner confirmed there is no legacy
template/document support requirement.

All application boundaries now fail closed on anything except a strictly valid schema V5 document:
template create/update, quotation save/finalize/recalculate, frontend loading, diagnostics, preview,
and PDF export. The built-in template is a valid blank A4 V5 document.

Historical numbered SQL migrations remain immutable so an existing installation can still replay
its database history safely. Migration `011_drop_legacy_section_definitions.sql` removes the obsolete
table from both upgraded and newly created databases. This is database migration continuity, not a
runtime legacy engine.

## 14. Verification completed in this implementation

- complete Go test suite passed;
- complete Go race suite passed;
- frontend Vitest suite passed (70 tests across 17 files at final run before generated-binding refresh);
- frontend production build passed;
- frontend lint/format check passed with pre-existing non-blocking React compiler warnings;
- Wails local packaged development build passed and produced `Quotier Labs Dev.app`;
- Windows amd64 and Linux amd64 build-tag/path helper cross-compilation passed;
- shell syntax and Node script syntax checks passed;
- runtime-path policy passed;
- `git diff --check` passed.

Native signing, notarization, installer execution, GitHub secret access, and clean-machine upgrades cannot be completed without your certificates, private keys, repository settings, and target machines. The scripts and workflow fail closed when required credentials are absent; those operator checks are the final release gate, not optional known issues.
