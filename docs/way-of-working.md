# Quotier Labs Native Desktop Installation and Runtime Filesystem Plan

Status: implementation-ready specification; no source or packaging changes are made by this document.

> **Current distribution scope (2026-09-01):** Linux runtime-path research remains useful, but
> Linux packaging and releases are deferred. The active release matrix is macOS plus Windows only.
> `docs/release-steps.md` is the operational release runbook.

This document defines how a released Quotier Labs desktop application must install, register with the operating system, resolve writable paths, preserve user data, upgrade, and uninstall on Windows, macOS, and Linux. It supersedes any assumption that the process working directory or the installed executable directory is writable application storage.

Normative terms `MUST`, `MUST NOT`, `SHOULD`, and `MAY` are intentional. Example paths use the production identity; beta and development identities are defined separately below.

## Executive decision

Quotier Labs must use this invariant:

```text
Signed/package-managed application files (immutable)
  != durable user/business data
  != user preferences
  != diagnostics and recovery state
  != recreatable cache
  != process-lifetime temporary files
  != user-selected exports and backups
```

The current application violates that invariant for its SQLite database, main log, and automatic-backup fallback because they are relative to the current working directory. A release launched from Finder, Start Menu, a Linux desktop entry, a terminal, or an installer can therefore create or look for different data. It can also attempt to write inside a protected installation directory. These are release-blocking issues.

The immediate release target remains a signed NSIS installer on Windows, a signed/notarized macOS application bundle, and a signed/checksummed native Linux package. In addition, Quotier Labs will provide an in-app update experience backed initially by GitHub Releases. The app owns checking, presentation, download progress, verification, save/backup coordination, and restart; the platform-specific installer/updater owns privileged or atomic replacement of installed application files. Updates never replace the live database directly.

## 1. Research basis and governing conventions

The target is based primarily on OS specifications, not on a framework default:

- Apple requires runtime resources to stay inside the application bundle and places managed persistent data in `~/Library/Application Support`, caches in `~/Library/Caches`, and logs in `~/Library/Logs`. Apple also says internal application files should use resolved standard directories, while user documents should use Open/Save panels. See [macOS Library directory details](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/MacOSXDirectories/MacOSXDirectories.html), [accessing files and directories](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/AccessingFilesandDirectories/AccessingFilesandDirectories.html), and [using the file system effectively](https://developer.apple.com/documentation/foundation/using-the-file-system-effectively).
- Windows separates code in Program Files (or a per-user Programs directory) from persistent per-user data in known AppData folders. Machine-local databases and caches belong under Local AppData, not roaming AppData and never beside the executable. See [Windows known folders](https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid), [Windows Shell security guidance](https://learn.microsoft.com/en-us/windows/win32/shell/sec-shell), and [Microsoft's explicit code-versus-data guidance](https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-getsystemdirectoryw).
- Linux follows the [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/): durable data in `$XDG_DATA_HOME`, configuration in `$XDG_CONFIG_HOME`, logs and persistent operational state in `$XDG_STATE_HOME`, recreatable files in `$XDG_CACHE_HOME`, and short-lived IPC/locks in `$XDG_RUNTIME_DIR`. Static packaged files follow the [Filesystem Hierarchy Standard](https://refspecs.linuxfoundation.org/FHS_3.0/fhs-3.0.html).
- Linux launchers must be valid desktop entries with an identity-based filename and an icon installed through the icon theme hierarchy. See the [Desktop Entry Specification](https://specifications.freedesktop.org/desktop-entry/latest-single/) and [Icon Theme Specification](https://specifications.freedesktop.org/icon-theme/latest/).
- Go's [`os.UserConfigDir`, `os.UserCacheDir`, `os.TempDir`, and `os.MkdirTemp`](https://pkg.go.dev/os) are useful primitives, but `UserConfigDir` alone is not a complete cross-platform application layout. In particular, it resolves to roaming AppData on Windows and XDG config on Linux, neither of which is the correct home for Quotier Labs' local SQLite database and managed images.
- Mature frameworks expose separate path classes. Electron exposes user data, session data, logs, and crash dumps through [`app.getPath`](https://www.electronjs.org/docs/latest/api/app), while Tauri exposes app config, data, local data, cache, and log roots through its [filesystem base directories](https://v2.tauri.app/plugin/file-system/). Quotier Labs needs the equivalent as an internal Go service rather than framework calls spread through handlers.
- SQLite warns that copying a live main database alone can produce an inconsistent backup, and recommends `VACUUM INTO` or the backup API. It also warns about replacing/renaming an open database and about separating WAL/journal files. See [SQLite: how corruption occurs](https://www.sqlite.org/howtocorrupt.html).
- Release trust is part of correct installation. macOS direct distribution requires Developer ID signing, hardened runtime, secure timestamp, notarization, and stapling; see [Apple Developer ID](https://developer.apple.com/support/developer-id/), [notarization requirements](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), and [packaging for distribution](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution). Windows installers and binaries must be Authenticode-signed; unsigned and self-signed downloads trigger SmartScreen warnings, as described in [Microsoft's SmartScreen guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).
- Wails v2 supports an NSIS installer and draws installer metadata from the `Info` block in `wails.json`; see [Wails NSIS installer documentation](https://wails.io/docs/guides/windows-installer/). Current Quotier Labs metadata does not populate that block.
- GitHub's [Releases REST API](https://docs.github.com/en/rest/releases/releases) exposes public published releases and release assets without embedding a user token. Its `latest` endpoint deliberately excludes drafts and prereleases, so beta-channel discovery must not use that endpoint. GitHub metadata is a discovery mechanism, not sufficient executable trust; Quotier Labs must independently verify a signed update manifest, asset hash, and platform signature.
- On macOS, [Sparkle 2](https://github.com/sparkle-project/Sparkle) is a mature updater that performs atomic bundle replacement, but embedding another native framework/key/appcast lifecycle is not required for the first Wails release. The implemented adapter uses a separately Developer ID Installer-signed, notarized, stapled PKG after Quotier's signed-manifest verification. The OS Installer owns replacement, authorization, receipts, and errors; the DMG remains the normal manual-install artifact. Sparkle may be reconsidered only through a later pinned-version security review.

These conventions establish a lifecycle distinction: cache and temporary data may be deleted; the business database, managed document assets, and user-created backups must never depend on such storage.

## 2. Current-state audit

### 2.1 Audit summary

| Area | Current behavior | Finding | Required disposition |
|---|---|---|---|
| Application identity | `wails.json` has a display name and author, but no complete Wails `Info`; generated macOS and Windows identities use `com.wails...`; app version and OS are hardcoded | Identity is placeholder-derived and can drift between package metadata, runtime, backups, and data paths | Replace with one explicit identity/version source |
| SQLite location | `ProvideDB()` and `ProvideCurrentDBPath()` both use `quotierlabs.db` | CWD-relative, launch-method-dependent, and potentially unwritable | Release blocker; resolve through the path service |
| SQLite setup | Embedded migrations; foreign keys enabled; WAL, `synchronous=NORMAL`, and busy timeout configured | Sound foundation | Keep; add lifecycle, path, integrity, and migration safety around it |
| Logging | `quotierlabs.log` opened relative to CWD with mode `0644`; debug JSON and debug console output always enabled | Wrong location, overly permissive Unix mode, no rotation/retention, file handle ownership, or production policy | Replace initialization, not Zap itself |
| Managed images | Uses `os.UserConfigDir()/QuotierLabs/images`, validates extension/size, constrains reads to that root | Read scoping is good; durable assets are misclassified as config, Windows path roams, names collide/overwrite, and absolute paths are persisted | Keep validation; move to managed data/assets and store stable relative asset IDs |
| Manual file workflows | Native Wails Open/Save/Directory dialogs are used for images, PDF export, backups, restore, CSV import/export | Correct OS-native behavior | Keep; improve defaults, cancellation semantics, and path validation |
| PDF temporary files | Writes predictable `os.TempDir()/defaultFilename`, mode `0644`, with no ownership/collision protection or cleanup | Collision, stale-sensitive-file, and symlink risks | Use a private random session directory and cleanup policy |
| Automatic backups | Hourly ticker; configured destination supported; missing setting falls back to `./backups` | CWD-dependent, no immediate/startup schedule, retention, space policy, or user-visible failure state | Remove fallback; require a resolved/user-approved location |
| Backup snapshot | Uses `VACUUM INTO` to a private temporary directory | Correct consistent-live-snapshot approach | Keep, using a bound parameter/escaped SQLite filename or backup API |
| Backup content | Archive contains database and metadata only | Contradicts the project plan's requirement to include assets; restored documents may lose logos/stamps/signatures | Add all referenced managed assets and versioned manifest |
| Backup finalization | ZIP is written directly to the destination filename | A failure can leave a plausible partial backup | Write `.partial`, flush, verify, then atomically rename on the destination filesystem |
| Backup metadata/name | App version `1.0.0` and migration version `9` hardcoded; company name inserted unsanitized into filename | Metadata drifts; invalid/path-like filename input possible | Inject real build/schema info and generate a safe bounded filename |
| Restore | Validates basic ZIP members, closes DB, sleeps 500 ms, renames/copies over DB, does not reopen it, and emits completion while the process continues | Unsafe DB replacement and broken post-restore lifecycle; no WAL/SHM handling, rollback, full integrity check, size limits, or asset transaction | Restore only in controlled restart/maintenance flow with rollback |
| Recovery checkpoints | Important unsaved quotation recovery is stored in WebView `localStorage` | Location/lifecycle is controlled by the webview; Windows uninstaller currently removes its data; it is not an adequate authoritative recovery store | Move recovery to explicit state/recovery storage with atomic writes |
| UI preferences | Theme and density live in `localStorage` | Acceptable only as disposable UI state, but preferences should not be lost when webview cache is reset | Move durable preferences to config/settings; localStorage may remain a cache |
| WebView data | Windows leaves `WebviewUserDataPath` empty, so Wails defaults to `%APPDATA%/<binary>.exe`; NSIS deletes it on uninstall | Roaming location contains mixed cache/state and deletion currently also removes recovery/preferences | Explicitly place webview data under local cache after valuable state is migrated out |
| Crash reporting | No top-level panic/crash artifact policy; initialization uses `log.Fatalf` before UI/logger recovery | Startup failures can be invisible in GUI launches; no support bundle or sanitized diagnostic record | Add early bootstrap diagnostics and app-level panic metadata; retain OS crash facilities |
| Updates | No updater; no network/update service or UI | Does not meet the newly approved in-app update requirement | Add signed manifest discovery, channel policy, verified download, native install adapters, migration-safe restart, and update UI |
| Packaging | macOS script emits only an unsigned app; Windows produces NSIS but signing hooks are disabled; Linux emits a raw binary | Not release-ready on any OS | Produce signed/notarized or signed/checksummed install artifacts and verify them |
| Windows installer | Defaults to admin/all-users Program Files, creates Start Menu and desktop shortcuts unconditionally, removes webview data, has placeholder identity | Functional template, not product-ready | Default to per-user install, Start Menu registration, opt-in desktop shortcut, stable uninstall identity |
| macOS bundle | Generated bundle ID is `com.wails.quotier-labs`; placeholder product metadata | Bundle identity is not owned or stable | Set explicit product bundle ID and metadata; distribute through DMG |
| Linux integration | No `.deb`/`.rpm`/AppImage packaging, `.desktop` entry, icon installation, dependencies, or uninstall integration | Raw binary is not a mature installed app | Add a native package as primary Linux release |
| Build pipeline | Master script currently packages only macOS; tests are incomplete in scope; no clean-tree/version/signature/checksum/SBOM gates | Cannot produce reproducible verified releases | Replace with per-OS CI release jobs and artifact verification |

### 2.2 Specific code and configuration evidence

- `backend/infrastructure/di/wire.go` and generated `wire_gen.go` construct SQLite with a relative filename.
- `backend/infrastructure/logging/zap.go` opens a relative log file and has no rolling sink.
- `backend/transport/wails/image_handler.go` directly resolves its own directory instead of consuming an application path dependency.
- `backend/application/backup/autobackup.go` uses `./backups` when no setting exists.
- `backend/application/backup/service.go` hardcodes version information and uses company input in a filesystem name.
- `backend/infrastructure/backup/sqlite_backup.go` has a sound `VACUUM INTO` snapshot but unsafe finalization and restore replacement.
- `backend/transport/wails/export_handler.go` generates predictable, persistent temporary PDF paths.
- `frontend/src/features/quotations/hooks/useRecovery.ts`, `frontend/src/hooks/use-theme.tsx`, and `frontend/src/features/settings/SettingsPage.tsx` depend on WebView `localStorage` for data with different durability requirements.
- `apps/desktop/main.go` initializes storage and logging before Wails without a bootstrap error/crash path.
- `apps/desktop/wails.json`, `build/darwin/Info.plist`, and Windows manifest/NSIS templates do not define a Quotier Labs-owned stable identity.
- `scripts/package-*.sh` do not yet sign, notarize, checksum, or produce a native Linux package.

### 2.3 Correct behavior to retain

Do not rewrite these merely to make the new architecture look uniform:

- Keep embedded migrations; no production runtime must locate SQL files in the source tree.
- Keep SQLite foreign keys, WAL, synchronous mode, and busy timeout unless performance/integrity tests justify a documented change.
- Keep native Open/Save/Directory dialogs for user-owned inputs and outputs.
- Keep the image type/size allowlist and containment check, adapting it to asset IDs.
- Keep private `os.MkdirTemp` workspaces and guaranteed cleanup for backup assembly.
- Keep `VACUUM INTO` or replace it only with SQLite's online backup API; never raw-copy an open WAL database.
- Keep user data on uninstall by default, matching the existing Phase 16 acceptance criterion.

## 3. Application identity and path-resolution strategy

### 3.1 Canonical identity manifest

Create one build-time identity source consumed by Go, Wails metadata, platform packages, diagnostics, backups, and About UI:

| Field | Production value |
|---|---|
| Vendor | `Quotier Labs` |
| Product name | `Quotier Labs` |
| Executable/base slug | `quotier-labs` (keep a compatibility alias only if needed for an existing release) |
| Reverse-DNS application ID | `com.quotierlabs.QuotierLabs` |
| Linux desktop ID | `com.quotierlabs.QuotierLabs.desktop` |
| Data directory slug | Windows: vendor/product hierarchy; macOS: application ID; Linux: `quotier-labs` |
| Version | SemVer release version, plus a monotonically increasing platform build number where required |
| Channel | `production`, `beta`, or `development` |

Production identity MUST never change during an ordinary upgrade. Package upgrade codes, uninstall registry identity, macOS bundle ID, Linux desktop ID, data roots, backup metadata, and runtime-reported version must agree.

Channels are deterministic but deliberately isolated:

| Channel | Display name | Application ID suffix | Data suffix |
|---|---|---|---|
| Production | Quotier Labs | none | none |
| Beta | Quotier Labs Beta | `.Beta` | `-beta` / Beta product directory |
| Development | Quotier Labs Dev | `.Dev` | `-dev` / Dev product directory |

This is the safe meaning of consistency across development, beta, and production: one naming rule with stable, explicit identities—not accidental sharing. Different channels MUST NOT open the same live database. Promotion from beta to production is an explicit verified backup/import operation.

### 3.2 Version source of truth

The Git release tag is the source of truth for a release version. Do not manually maintain competing version strings in Go, `wails.json`, backup code, or the Settings UI.

The repository currently has the annotated tag `v1.3.0-beta.1`, but the application does not consume it: `GetAppInfo()` and backup metadata still report hardcoded `1.0.0`, and `wails.json` has no product-version metadata. Therefore, merely creating the tag does not currently change the built app. Implementation must introduce a generated `BuildInfo` contract:

```text
SemanticVersion = 1.3.0-beta.1       # user-facing/update comparison; leading v removed
GitTag          = v1.3.0-beta.1
GitCommit       = full commit SHA
BuildTime       = reproducible UTC value supplied by CI
Channel         = beta
Dirty           = false for every release
DBSchemaTarget  = actual highest embedded Goose migration
DocumentSchema  = actual supported document schema
```

Release behavior:

1. CI checks out the exact annotated tag and rejects a dirty tree, a lightweight/malformed version, or a tag that does not point at `HEAD`.
2. The release script validates the tag against SemVer and derives the channel: a prerelease containing `beta` is beta; a version without prerelease data is production. Development is never inferred as a release.
3. Go variables receive BuildInfo through Wails' supported `-ldflags` (`-X` values). About, logs, backups, crash reports, and updater all read the injected object; they contain no fallback release literal other than an unmistakable `0.0.0-dev` test default.
4. The build creates platform metadata from the same object. Because platform version formats differ, “one source” does not mean every formatted string is identical:
   - user-facing SemVer: `1.3.0-beta.1`;
   - Windows numeric file version: four integers generated by policy, for example `1.3.0.1`, while Product/Display Version remains `1.3.0-beta.1`;
   - macOS `CFBundleShortVersionString`: `1.3.0`; `CFBundleVersion`: a monotonically increasing integer; About still displays `1.3.0-beta.1`;
   - Linux package version: package-manager-safe mapping that preserves prerelease ordering (Debian commonly uses `1.3.0~beta.1`).
5. The build fails if any generated package version, update manifest, or runtime BuildInfo disagrees.

The existing tag must not be moved to include later commits. Builds of that exact commit are `1.3.0-beta.1`; continued work after it receives a new tag such as `v1.3.0-beta.2` or, when ready, `v1.3.0`. A manual `make dev` build derives a non-release label from the nearest tag and commit, for example `1.3.0-beta.1+dev.4.gabc1234.dirty`. SemVer build metadata is ignored for update precedence, and development builds never participate in self-update.

### 3.3 Central path service

Add a small infrastructure abstraction, injected at the composition root, that resolves all paths once before logging or SQLite opens:

```go
type AppPaths struct {
    InstallRoot    string // read-only; diagnostic only
    DataRoot       string // database and managed assets
    ConfigRoot     string // small preferences/configuration
    StateRoot      string // recovery and operational state
    LogRoot        string
    CrashRoot      string // app-generated sanitized crash metadata
    CacheRoot      string
    RuntimeRoot    string // locks/IPC for this login/session
    TempRoot       string // private random directory for this process/session
}
```

Requirements:

1. Resolve using OS APIs/environment standards, never `os.Getwd()` and never by joining writable content to `os.Executable()`.
2. Validate that XDG environment values are absolute; ignore relative values as the XDG specification requires.
3. Create only the directories required for the current startup, with restrictive permissions.
4. Return typed bootstrap errors identifying the path class, not raw home paths to the UI.
5. Expose test constructors with explicit temporary roots. Unit tests MUST NOT depend on the developer's real home directory.
6. Permit a root override only in tests and an explicit development profile. Production builds MUST ignore undocumented path-changing environment variables.
7. No application/domain service may call `UserConfigDir`, `UserCacheDir`, `TempDir`, inspect CWD, or invent a product directory. Those are path-service responsibilities.
8. Persist logical asset IDs and relative paths only. Absolute paths may be returned internally after containment validation but MUST NOT enter document JSON or the database as managed asset identity.

## 4. OS-specific target architecture

### 4.1 Windows 10/11

Immediate target: signed per-user NSIS installer, because this is supported by the current Wails v2 project and avoids an elevation prompt for a single-user offline application. An optional enterprise all-users build MAY install under Program Files, but it must use the same per-user data design.

| Purpose | Target |
|---|---|
| Per-user install | `%LOCALAPPDATA%\Programs\Quotier Labs\` |
| Optional all-users install | `%ProgramFiles%\Quotier Labs\Quotier Labs\` |
| Durable local data | `%LOCALAPPDATA%\Quotier Labs\Quotier Labs\data\` |
| Database | `...\data\db\quotierlabs.sqlite3` |
| Managed assets | `...\data\assets\` |
| Small roaming-safe config | `%APPDATA%\Quotier Labs\Quotier Labs\config\` |
| Recovery/operational state | `%LOCALAPPDATA%\Quotier Labs\Quotier Labs\state\` |
| Logs | `%LOCALAPPDATA%\Quotier Labs\Quotier Labs\logs\` |
| App crash metadata | `%LOCALAPPDATA%\Quotier Labs\Quotier Labs\crashes\` |
| Cache/WebView data | `%LOCALAPPDATA%\Quotier Labs\Quotier Labs\cache\` and `...\webview\` |
| Process temp | `%TEMP%\Quotier Labs\<cryptographically-random-session>\` |
| User exports/backups | User-selected through native dialog; never silently inferred from CWD |

Rules:

- The SQLite DB and assets MUST use Local AppData, not roaming AppData: they are large, machine-local, lock-sensitive, and unsafe to synchronize through roaming profiles.
- Only small preferences that are safe to appear on another device may use Roaming AppData. A setting that contains a local path (backup destination, recent export directory) belongs in local state/config.
- The Wails `WebviewUserDataPath` MUST be explicitly assigned to the local WebView directory. Before this is made disposable, recovery checkpoints and durable preferences must be moved out of `localStorage`.
- The installer MUST create a Start Menu shortcut in the correct current-user or all-user Programs known folder and register a stable Apps & Features uninstall entry. A desktop shortcut MUST be opt-in, not unconditional. Do not pin the app to the taskbar or Start automatically.
- The installer and executable MUST be Authenticode-signed and timestamped. Release verification must check both signatures.
- Do not request administrator privileges for the default per-user install. The app itself MUST always run unelevated.
- Windows Error Reporting remains the source of native process dumps. Quotier Labs must not silently change machine-wide WER registry policy. If support requests a dump, provide documented opt-in instructions; Microsoft's default local-dump convention is described in [WER settings](https://learn.microsoft.com/en-us/windows/win32/wer/wer-settings).

Future option: MSIX may be evaluated for Store/enterprise distribution and managed updates. Its install directory is protected and package writes are prohibited, reinforcing this plan; see [MSIX packaged desktop behavior](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes). Do not switch formats until data migration, package identity, file-dialog access, signing, and uninstall semantics are tested.

### 4.2 macOS

Immediate target: a universal signed and notarized `Quotier Labs.app` distributed in a signed/notarized/stapled DMG.

| Purpose | Target |
|---|---|
| Install | `/Applications/Quotier Labs.app` (or user-chosen `~/Applications`) |
| Durable data | `~/Library/Application Support/com.quotierlabs.QuotierLabs/data/` |
| Database | `.../data/db/quotierlabs.sqlite3` |
| Managed assets | `.../data/assets/` |
| Configuration | `~/Library/Application Support/com.quotierlabs.QuotierLabs/config/` |
| Recovery/operational state | `~/Library/Application Support/com.quotierlabs.QuotierLabs/state/` |
| Logs | `~/Library/Logs/com.quotierlabs.QuotierLabs/` |
| App crash metadata | `~/Library/Logs/com.quotierlabs.QuotierLabs/crashes/` |
| Cache/WebView disposable data | `~/Library/Caches/com.quotierlabs.QuotierLabs/` plus the bundle-ID-keyed WebKit store |
| Process temp | resolved `$TMPDIR/com.quotierlabs.QuotierLabs/<random-session>/` |
| User exports/backups | User-selected through native panels |

Rules:

- Nothing mutable may be written into `Quotier Labs.app/Contents` or beside the bundle.
- The bundle ID in `Info.plist`, signing identity, data roots, and diagnostics MUST use the canonical ID, not `com.wails.*`.
- The DMG presents the app and an Applications alias. The app does not create desktop aliases or Dock entries; those are user choices.
- Produce a separately signed/notarized/stapled PKG for update handoff. It replaces only `/Applications/<channel app>.app`; it never scripts or removes Application Support data.
- Sign all nested executable code, enable hardened runtime, use a secure timestamp, notarize the outer distribution, staple the ticket, and verify with `codesign`, `spctl`, and `stapler` on a different clean Mac.
- Use the operating system's crash reports as the authoritative native crash source. Apple directs users to Console > Crash Reports; see [acquiring crash reports and diagnostic logs](https://developer.apple.com/documentation/xcode/acquiring-crash-reports-and-diagnostic-logs). App-generated crash metadata supplements rather than replaces those reports.
- Deleting the `.app` must not delete business data. Provide a separately confirmed in-app “Delete all local Quotier Labs data” action or documented manual removal procedure.

### 4.3 Linux

Immediate target: `.deb` for the supported Debian/Ubuntu baseline, with an `.rpm` added when a supported RPM-family test matrix exists. A raw binary is a development artifact, not the primary release. AppImage MAY be offered later as a portable package, but “portable” must never mean “write the database next to the AppImage.”

| Purpose | Target |
|---|---|
| Executable | `/usr/bin/quotier-labs` (or wrapper to static files under `/usr/lib/quotier-labs`) |
| Desktop entry | `/usr/share/applications/com.quotierlabs.QuotierLabs.desktop` |
| Icons | PNGs at required sizes under `/usr/share/icons/hicolor/<size>x<size>/apps/com.quotierlabs.QuotierLabs.png` |
| Durable data | `${XDG_DATA_HOME:-$HOME/.local/share}/quotier-labs/` |
| Database | `.../db/quotierlabs.sqlite3` |
| Managed assets | `.../assets/` |
| Configuration | `${XDG_CONFIG_HOME:-$HOME/.config}/quotier-labs/` |
| Recovery/operational state | `${XDG_STATE_HOME:-$HOME/.local/state}/quotier-labs/` |
| Logs | `${XDG_STATE_HOME:-$HOME/.local/state}/quotier-labs/logs/` |
| App crash metadata | `${XDG_STATE_HOME:-$HOME/.local/state}/quotier-labs/crashes/` |
| Cache/WebView data | `${XDG_CACHE_HOME:-$HOME/.cache}/quotier-labs/` |
| Runtime lock/IPC | `$XDG_RUNTIME_DIR/quotier-labs/`, mode `0700`; secure temp fallback if unavailable |
| Process temp | private random child of `$TMPDIR`/system temp |
| User exports/backups | User-selected through native portal/dialog; do not assume `$HOME/Documents` exists |

Rules:

- Reject relative XDG environment paths and fall back to the standard absolute default.
- The desktop file uses `Type=Application`, stable `Name`, identity icon, appropriate business/office categories, and an `Exec` command with no shell interpolation. Add `%F`/`%U` only after a supported file type and safe open-file contract exist.
- Declare exact WebKitGTK/runtime dependencies in the native package and test them on every supported distribution version.
- Package uninstall removes `/usr` files and launcher/icon registrations. Debian `remove`/`purge` must not enumerate or delete per-user home data. Package-manager conffiles follow Debian policy; application-managed per-user configuration remains in the user's home until the user deletes it.
- Native coredumps are controlled by the desktop/OS (commonly systemd-coredump). App crash metadata under XDG state must be small and sanitized; do not duplicate or retain full core dumps automatically. See [systemd-coredump](https://www.freedesktop.org/software/systemd/man/latest/systemd-coredump.html).

## 5. Runtime data layout and lifecycle

Each root contains only its declared class:

```text
DataRoot/
  db/
    quotierlabs.sqlite3
    quotierlabs.sqlite3-wal       # SQLite-owned, while present
    quotierlabs.sqlite3-shm       # SQLite-owned, while present
  assets/
    <content-hash>.<validated-extension>

ConfigRoot/
  settings.json                  # operational/UI preferences only

StateRoot/
  recovery/
    <quotation-id>.json
  migration/
    legacy-import-v1.json
  last-clean-shutdown.json

LogRoot/
  quotierlabs.jsonl
  quotierlabs.jsonl.1 ...

CrashRoot/
  <timestamp>-<random-id>.json

CacheRoot/
  preview/
  thumbnails/
  webview/                       # Windows explicit; equivalent platform store elsewhere

RuntimeRoot/
  instance.lock

TempRoot/
  print-<random>.pdf
  share-<random>.pdf
  backup-work/
```

### 5.1 Database and managed assets

- Parent directories are private to the current user. On Unix create directories as `0700` and database/asset files as `0600`, subject to a restrictive umask. On Windows rely on the user's inherited profile ACL and ensure no `Everyone` write grant is added.
- Keep DB, WAL, and SHM on a local filesystem. Do not place the live DB in OneDrive, iCloud Drive, roaming profiles, network shares, removable media, or a user-selected backup directory.
- Add a single-instance policy keyed by production/channel identity. The lock is short-lived runtime state; stale locks must be verified by OS locking/process ownership, not trusted by file existence alone.
- Startup order is: resolve paths -> create private roots -> initialize bootstrap diagnostics -> acquire instance lock -> inspect/migrate legacy data -> open DB -> run migration preflight/backup/migrations -> initialize full logger/services -> start UI.
- Managed asset filenames are generated from a content hash or random ID plus an allowlisted extension. Never derive the destination from the source basename. Decode and validate image type/dimensions, copy atomically, and store an asset ID/relative name in documents.
- Garbage collection of unreferenced assets is a separate explicit operation with a grace period and pre-delete reference scan; never delete on ordinary document save.

### 5.2 Configuration and preferences

- `settings.json` contains only non-business preferences such as theme, density, locale, diagnostic consent, last non-sensitive directory choice, and backup schedule/location reference. Company, customer, quotation, numbering, tax, and template data remains in SQLite.
- The file has a schema version, strict parsing, bounded values, and atomic temp-write + flush + rename semantics. A corrupt file is quarantined and defaults are loaded with a visible warning; it is never silently overwritten before preservation.
- A backup directory is a user grant/choice. Store its canonical reference in local config/state. If it becomes unavailable, show “Backup paused—choose a location”; never fall back to CWD.
- WebView `localStorage` may cache UI preferences for rendering speed, but it is not authoritative. Recovery checkpoints must move out entirely.

### 5.3 Logs

- Production: JSON-lines at INFO and above, rotating by bounded size and age. Initial target: 10 MiB per file, five retained files, maximum 14 days; adjust only from measured support needs. Development additionally logs human-readable DEBUG output to the terminal.
- Never log quotation content, customer names, GSTIN/PAN, bank details, signatures/stamps, full SQL, backup contents, or access tokens. Paths shown in support logs should be minimized or home-prefix-redacted.
- Log stable build version, channel, OS/architecture, schema version, startup stage, migration IDs, backup success/failure without destination details, and sanitized typed errors.
- Logger ownership includes closing the file sink. A logger constructor must return cleanup and startup must call it on all exit paths.
- “Export diagnostics” creates a user-reviewed bundle of logs and metadata only; database, images, quotations, and raw crash/core dumps are excluded unless the user explicitly selects a separate support workflow.

### 5.4 Crash and startup diagnostics

- A minimal bootstrap logger writes to the resolved crash/log root before DI initialization. If roots cannot be created, show a native user-safe startup error and use OS logging/stderr as a last resort; do not expose internal paths or stack traces in the dialog.
- Recover panics at owned Go goroutine boundaries and the main bootstrap boundary where technically valid. Record timestamp, build/channel, OS/architecture, last startup stage, panic class, and stack in a bounded local crash JSON file. This does not claim to catch native faults or abrupt termination.
- Preserve OS-native Windows Error Reporting, macOS Diagnostic Reports, and Linux coredump behavior. Remote upload is opt-in future scope: no crash, telemetry, log, or business data leaves the device without informed consent.
- Keep symbols securely per release so native reports can be symbolicated. Publish no secrets in symbols or build paths; use Wails/Go `-trimpath` in production.

### 5.5 Cache and temporary files

- Everything in CacheRoot must be safely deletable while the app is closed and reproducible from durable data.
- Use one private, random session temp directory created with `os.MkdirTemp`; do not construct predictable filenames directly under the shared OS temp root.
- Print/share PDFs contain sensitive commercial data. Create them with private permissions, pass explicit argument arrays to OS commands, delete after the consumer is finished where detectable, and age-clean abandoned files on next startup. Never shell-quote a path into a PowerShell command string.
- Startup may remove Quotier Labs-owned temp directories older than a conservative threshold after verifying ownership/marker and exact root. It must never recursively clean the OS temp root.

### 5.6 Backups

- Manual backups always use a native Save/Directory dialog. Automatic backup must be explicitly enabled with a user-approved destination. The UI may suggest the OS Documents directory, but creates nothing until the user confirms.
- A complete versioned backup includes the consistent SQLite snapshot, every referenced managed asset, a manifest with hashes/sizes, format version, actual app version, actual DB migration version, channel, creation time in UTC, and non-sensitive counts.
- Write to a random `.partial` file in the selected destination directory, flush/close, reopen, validate archive structure, size limits, member hashes, SQLite header and `PRAGMA integrity_check`, then atomically rename to the final sanitized filename. This ensures the final rename stays on one filesystem.
- Apply retention only to files with a valid Quotier Labs backup manifest in the configured directory. Never delete unknown files. Define count/age/space limits in settings and keep at least the newest verified backup.
- Backup archives contain sensitive financial and identity data. Until authenticated encryption is designed and recovery-tested, the UI must clearly state that backups are not encrypted and must use a private destination. Before production, make an explicit security decision between an authenticated encrypted `.qlbackup` format with user-managed recovery secret and documented unencrypted portability; do not imply ZIP encryption provides protection.
- Restore is a maintenance/restart operation: validate without changing state, show metadata/compatibility, obtain explicit confirmation, create and verify a rollback backup, stop writes/autobackup, close all DB handles, stage DB/assets, atomically swap the complete data generation, relaunch, run integrity/migration checks, and delete rollback data only after a confirmed healthy startup. On any failure, restore the old generation and show recovery instructions.
- Reject archives with unknown required fields, incompatible future schema, duplicate members, absolute/traversal paths, symlinks, decompression bombs, excess member count/size, hash mismatch, malformed SQLite, or unexpected files. Revalidate the exact selected file immediately before restore.

## 6. Installation, packaging, launchers, and shortcuts

### 6.1 Common release requirements

- Build on each target OS in CI from a clean tagged commit. Do not cross-package and claim verification where native signing/installer tools or runtime tests are unavailable.
- Inject one version into Go runtime, About UI, Wails metadata, macOS bundle, Windows resources/installer, Linux package metadata, backup manifest, logs, and update metadata.
- Produce SHA-256 checksums, a dependency/SBOM artifact, release notes, and signing/notarization evidence. Verify artifacts after signing because signing changes bytes.
- Ship only embedded/read-only resources with the app. No migrations, fonts, icons, or templates may be loaded from the developer repository at runtime unless they are deliberate user documents.
- File associations and custom protocols are absent until Quotier Labs owns a versioned file format and safely validates open requests. Remove template-generated association code paths from effective packaging configuration rather than registering speculative types.
- Launch successfully with an arbitrary and read-only CWD. Test from launcher, double-click, terminal, login shell, and a path containing spaces/non-ASCII characters.

### 6.2 Windows package requirements

- Populate `wails.json` `Info` with company, product, version, copyright, and release comments. Set a stable executable manifest identity and AppUserModelID.
- Configure NSIS per-user installation by default and make the install scope, shell context, uninstall key, and shortcuts agree. Upgrade must detect the same product and replace binaries in place instead of side-by-side duplicates.
- Start Menu shortcut is default; desktop shortcut is a clearly labeled optional installer checkbox. Shortcut target and working directory are explicit and correctly quoted by NSIS. No “Run as administrator.”
- Sign the app executable before packaging, sign the uninstaller through the NSIS finalize hook, then sign/timestamp the outer installer. Verify with Windows tooling on a clean VM.
- Do not let the uninstaller recursively delete `%APPDATA%\Quotier Labs` or `%LOCALAPPDATA%\Quotier Labs` by default. It may remove the explicitly disposable WebView/cache root after offering “keep preferences” semantics, but preserving all data is safer for MVP.
- WebView2 strategy (evergreen bootstrapper/download/embedded) must be explicit, tested offline according to the supported-install promise, and documented in artifact size/network requirements.

### 6.3 macOS package requirements

- Replace the generated `com.wails.*` ID in the source plist template with the canonical bundle ID. Provide complete version/copyright metadata and a documented minimum supported macOS version aligned with the Wails/WebKit test matrix.
- Build a universal app if both Intel and Apple Silicon remain supported. Test each architecture natively, not only under Rosetta.
- Sign inside-out with Developer ID Application, hardened runtime, least-privilege entitlements, and timestamp. Package in a DMG, sign as appropriate, notarize the outer distribution, staple, and verify offline Gatekeeper behavior.
- The app must run after being copied to `/Applications`, from `~/Applications`, and during a clean first launch. It must not assume the mounted DMG is writable or permanent.

### 6.4 Linux package requirements

- Build native packages with architecture, version, license, dependencies, maintainer, and uninstall metadata. Install no mutable defaults under `/usr`; copy defaults into memory or the per-user config root on first use.
- Provide a valid desktop entry and hicolor icons. Validate with `desktop-file-validate` and package lint tooling. Refresh desktop/icon caches through package-supported mechanisms where required.
- Sign package repositories/packages where a repository is offered and publish checksums for direct downloads.
- Document the supported distro/WebKitGTK matrix. A raw binary may remain a developer artifact but is not advertised as an installed release.

## 7. Permissions and security requirements

1. Run as the logged-in user. No runtime elevation and no writes to Program Files, `/Applications`, `/usr`, or other system locations.
2. Treat the application path, CWD, environment variables, imported filenames, company names, backup members, and user-selected directories as untrusted input.
3. Use typed path capabilities (`DataRoot`, `CacheRoot`, etc.) instead of passing arbitrary base strings across layers. Resolve/clean, verify containment, reject symlink escapes where writes could overwrite outside managed storage, and avoid TOCTOU-prone check-then-open flows.
4. Managed Unix directories default `0700`; managed sensitive files default `0600`. User exports use normal user-document permissions subject to umask. Windows inherits private user-profile ACLs.
5. Never log secrets or business content. Do not upload diagnostics automatically.
6. SQLite and recovery writes are atomic/durable in proportion to their purpose. Check disk-full, read-only filesystem, permission denied, and interrupted-write outcomes explicitly.
7. Bound every imported/backup member count, compressed and uncompressed size, image dimensions, config length, and diagnostic retention.
8. Use `exec.Command` with separate arguments for OS integration. Remove the current PowerShell command-string interpolation for printing.
9. The application must display actionable, user-safe errors for data-root unavailable, DB locked, DB newer than app, migration failed, backup destination unavailable, disk full, and permission denied.
10. No cleanup routine accepts a broad environment variable, home directory, drive root, installation root, or unresolved glob as a recursive-delete target.

## 8. Upgrade, reinstall, update, and uninstall behavior

### 8.1 Ordinary upgrade/reinstall

- A same-channel upgrade uses the same identity and data roots. Installer replacement affects application files only.
- Before a schema migration, verify available disk space, acquire the single-instance lock, create a consistent internal rollback snapshot, validate it, and then apply embedded forward migrations. Record migration state outside the DB as well as in Goose only where necessary for recovery.
- A successful migration keeps the rollback for a bounded safety window; a failed migration leaves the old DB/assets intact and starts in recovery mode. Never continue with a partially migrated database.
- If the DB schema is newer than the executable supports, refuse to open it read-write and explain that the user must reinstall the newer version. Do not attempt an automatic downgrade.
- Reinstalling the same version repairs/replaces signed application files and rediscovers existing user data. It must not rerun onboarding or create a second DB when valid data exists.

### 8.2 In-app updater target

The updater is approved scope. GitHub Releases at `ashokkmt/quotier-labs` is the initial artifact origin, but the updater must depend on a provider interface so the feed/assets can later move to `updates.quotierlabs.com` without changing update trust or UI.

#### Discovery and channels

- Production builds accept only stable SemVer releases and ignore drafts/prereleases. GitHub's `/releases/latest` can be used for discovery, but the signed channel manifest remains authoritative.
- Beta builds accept newer beta prereleases and stable releases of equal or greater precedence. Because GitHub's latest endpoint excludes prereleases, beta uses the public list-releases endpoint or a small HTTPS beta-channel pointer, then selects with a real SemVer parser.
- Development builds do not check, download, or install releases. Settings shows “Development build — updates disabled.” This prevents `make dev` from overwriting source/build output or mixing signed app state with repository state.
- Automatic checks are enabled only after a clear setting/consent decision. Check once after the UI is usable, then at most every 24 hours with jitter and cached ETag/Last-Modified. A network failure is non-blocking and quiet; a user-triggered check shows the error and Retry.
- Never embed a GitHub personal access token. Public release discovery works unauthenticated; respect GitHub rate-limit headers and cache results. If the repository becomes private, use a separate public signed feed—not a shipped repository credential.

#### Signed update manifest

Every published release contains a canonical JSON manifest and detached Ed25519 signature. The corresponding public key is embedded in the installed app. The private key exists only in protected release signing infrastructure and is separate from GitHub credentials and platform code-signing keys.

Minimum manifest fields:

```json
{
  "format_version": 1,
  "app_id": "com.quotierlabs.QuotierLabs",
  "channel": "beta",
  "version": "1.3.0-beta.2",
  "published_at": "UTC timestamp",
  "release_url": "https://github.com/ashokkmt/quotier-labs/releases/tag/v1.3.0-beta.2",
  "minimum_source_version": "1.2.0",
  "db_schema_before_min": 9,
  "db_schema_after": 10,
  "document_schema_after": 5,
  "critical": false,
  "assets": [
    {
      "os": "windows",
      "arch": "amd64",
      "package": "nsis",
      "url": "HTTPS GitHub release asset URL",
      "size": 123,
      "sha256": "hex digest"
    }
  ]
}
```

The app validates the signature before displaying release-supplied version, notes, URLs, or actions; validates app ID/channel/SemVer/source compatibility; chooses exactly one matching OS/architecture/package asset; and rejects unknown required fields or a manifest older than the last successfully observed signed version (freeze/rollback protection). GitHub's asset digest and artifact attestations are useful release evidence, but do not replace the app's embedded-key signature and platform signature.

Key rotation requires a transition release signed by the old key that authorizes the new public key. Losing the only private key without such a transition means existing clients cannot safely accept a replacement feed; key backups and recovery procedure are a release prerequisite.

#### User experience and state machine

Settings gets an **About & Updates** section containing current version, channel, last checked time, automatic-check toggle, `Check for updates`, and a link to signed release notes. When a newer compatible release exists, show its version, size, concise notes, and `Update now` / `Later`. Do not use blocking launch modals for ordinary updates.

```text
idle
-> checking
-> up-to-date | available | check-failed
-> downloading (bytes and percentage; Cancel)
-> verifying
-> ready-to-install
-> preparing-data (save + verified rollback backup)
-> awaiting-app-exit
-> installing (native updater/installer)
-> relaunching
-> migrating-data
-> complete | recovery-required
```

Download to `CacheRoot/updates/<version>/<random>.partial`, with a size limit and streaming hash. Follow HTTPS redirects only to an explicit GitHub/CDN allowlist, reject scheme downgrade/local addresses, and never use a release-supplied output path. On completion, flush/close, verify manifest signature, exact size/hash, platform package signature/notarization, and only then rename to a ready file. Partial downloads can resume only when server validators and expected hash still match; otherwise discard them. Cache retains at most the current verified candidate and one known-good previous installer, subject to a size cap.

Before install, finish/flush current edits, stop autosave and automatic backup, create and validate a rollback backup, record an update transaction, and close the DB cleanly. If save or backup fails, installation does not begin. The UI must say that the app will restart and must never claim completion before the new version has passed startup/migration health checks.

#### Platform installation adapters

- **Windows NSIS:** download the full Authenticode-signed per-user installer. After verification, launch it in an explicit update mode, exit Quotier Labs, let the installer wait for process termination and atomically replace package-owned files, then relaunch. The installer preserves Local/Roaming AppData and must not require elevation for the normal per-user install. Silent flags are used only if they preserve clear progress/error reporting and no license/scope choice is bypassed. Verify the new executable's publisher and version after relaunch.
- **macOS native PKG:** download the full Developer ID Installer-signed, notarized, stapled PKG selected by the signed manifest. Verify its installer identity with `pkgutil` and Gatekeeper with `spctl --type install`, then open the OS Installer and exit Quotier Labs. The PKG replaces only the channel-specific app bundle under `/Applications`; Application Support remains untouched. The system confirmation is intentional and must not be imitated by React.
- **Linux native package:** never overwrite `/usr/bin` from the running unelevated app. Download and verify the `.deb`/`.rpm`, then open the distro's native package installer/software center and explain that OS authentication may be required. If installed from a configured apt/rpm repository, invoke/open the package-manager update flow instead. Completion is verified after the package manager relaunches the app. A future AppImage build may use verified atomic AppImage replacement only when the running image is user-writable. Flatpak/Snap builds, if added, delegate entirely to their store/update mechanism.

The visual experience is consistent, but platform security prompts are not hidden or imitated. “One-click update” means one Quotier action initiates a verified native flow; Windows/macOS can be nearly automatic, while system-installed Linux packages legitimately require package-manager confirmation.

#### Database and document migrations during update

Application update and data migration are two separate transactions:

1. The old app downloads/verifies the new package, saves work, creates a verified rollback backup, writes `update-pending.json`, closes SQLite, and exits.
2. The platform adapter replaces only installed application files. `DataRoot`, `ConfigRoot`, and external backups are untouched.
3. The new app starts in migration mode before normal services/UI. It acquires the single-instance lock, verifies the pending transaction and source DB integrity, checks free space, and creates a staged database generation using SQLite backup/VACUUM—not a raw copy of a live WAL DB.
4. The new binary runs all embedded Goose migrations from the installed source schema to `db_schema_after` against the staged DB. Migration files are cumulative and never edited or deleted after release. Each migration has upgrade fixtures from every supported starting version.
5. Versioned JSON/document migrations run according to their own contract. Finalized quotations remain reproducible: prefer compatible readers/adapters or migrate copies without changing immutable semantic snapshots. A database migration number and a document schema number are never treated as the same thing.
6. Run `foreign_key_check`, `integrity_check`, domain invariants, asset-reference validation, and a representative render smoke test on staged data. Only a successful stage is atomically promoted; the original generation remains rollback data for the safety window.
7. Mark the update healthy only after the main window starts, repositories can read, and a health marker is written. Then show “Updated to …” once and re-enable autosave/backups.
8. On migration/health failure, do not continue on partially migrated data. Preserve diagnostics, restore the original data generation, and launch recovery UI. Where the platform adapter retains the old signed installer/app, offer verified application rollback; otherwise instruct reinstall of the previous signed release. An older binary must refuse to open a newer schema.

Example: if `v1.3.0-beta.1` contains migrations through `010` and `v1.3.0-beta.2` introduces `011`, the beta.2 binary embeds `001..011`. On first beta.2 launch Goose sees `010`, applies only `011` to the staged database, validates it, and promotes it. Settings and assets remain in their stable beta data roots. Reinstalling the app does not rerun `011` because Goose records it; restoring a pre-update backup and starting beta.2 applies it again to that restored copy.

#### Update policy and failure behavior

- Never force an update merely because the network feed says so. A critical security update may be prominently recommended and an explicitly unsupported minimum version may disable only unsafe network/update operations, but offline quotation access/export remains available unless data safety makes it impossible.
- Skipped version and remind-later choices are config state. A newer version overrides a skip; critical updates cannot be permanently hidden but can be deferred safely.
- Power loss, app kill, installer cancellation, no disk space, proxy/TLS failure, signature mismatch, revoked platform signature, incompatible architecture, and migration failure all have explicit recoverable states.
- Update logs contain versions/stages/error codes, not release secrets, business data, signed URLs with credentials, or full user paths.
- No delta updates in the first implementation. Full signed packages reduce patching risk. Add deltas only after full-package updating and rollback are proven on every platform.

### 8.3 Uninstall

- Default uninstall removes application binaries, package registrations, shortcuts/desktop entry, file associations actually owned by the app, and installer metadata. It preserves database, assets, user backups, config, logs, and crash reports.
- If an installer offers “also delete my local Quotier Labs data,” it must be unchecked by default, list the categories and locations in human terms, warn that quotations are permanently lost, require an additional confirmation, and never delete external backup/export directories.
- macOS bundle deletion naturally leaves Library data. Supply an in-app destructive reset or a documented manual cleanup; do not install a privileged uninstaller solely for cleanup.
- Linux package remove/purge never deletes arbitrary users' XDG data. Windows uninstall follows the same preservation rule despite its ability to reach the current user's profile.
- A later reinstall must find preserved data. If the user explicitly deleted data, it starts onboarding cleanly.

## 9. Development versus production behavior

| Concern | Development | Beta | Production |
|---|---|---|---|
| Identity/data | Explicit repository-local `.devdata/quotier-labs` root and `.Dev` runtime identity | Dedicated OS-native `.Beta` identity/root | Stable OS-native canonical identity/root |
| Logs | DEBUG to terminal plus rotating dev file | INFO file; optional diagnostic toggle | INFO file, bounded/redacted |
| DB | `.devdata/quotier-labs/data/db/quotierlabs.sqlite3` | Beta OS data root | Production OS data root |
| Signing | Local/ad-hoc as appropriate, clearly Dev-branded | Real distribution signature | Real distribution signature/notarization |
| Updates | Disabled; never replace source/dev binary | Beta channel, including newer betas/stable | Production stable channel only |
| Path override | Injected explicitly by `make dev`; repository-local only | Disabled | Disabled |
| Crash upload | None by default | Opt-in only if implemented | Opt-in only if implemented |

### 9.1 Repository-local `make dev` layout

Manual development data is intentionally kept inside the repository in one dedicated, ignored directory—not scattered beside Go/TypeScript files and not in production OS locations:

```text
<repository>/.devdata/quotier-labs/
  data/db/quotierlabs.sqlite3
  data/assets/
  config/settings.json
  state/recovery/
  logs/
  crashes/
  cache/
  webview/                 # where the platform/Wails API allows an explicit root
  backups/
  exports/
  tmp/<random-session>/
  runtime/
```

`.devdata/` MUST be in `.gitignore`, include a Quotier-owned marker used by safe cleanup, and never be packaged. It may contain sensitive real-looking test data, so it must never be committed, attached to diagnostics automatically, or used by CI artifacts.

`make dev` currently changes directory to `apps/desktop` and invokes `wails dev`; relying on that CWD would put data in the wrong subtree. The future Make target must compute the absolute repository root once and explicitly pass a development profile/root to the app (for example through a dev-only application argument plus build tag). The app accepts that override only when compiled as a development build. A signed beta/production binary ignores/rejects it.

Development behavior by category:

- Database, managed images, recovery, config, logs, crash metadata, cache, Quotier-generated temporary PDFs, and automatic/manual test backups use the corresponding `.devdata/quotier-labs` children.
- Automatic backup may default to `.devdata/quotier-labs/backups` only in development, so manual testing works without a directory prompt. Production/beta still require the user-approved location described earlier.
- Native Export/Save dialogs remain part of the behavior under test. Their suggested initial directory may be `.devdata/quotier-labs/exports`, but the actual export goes only to the path the tester confirms.
- Native webview engines can retain some framework-owned process/cache data in OS-controlled locations on platforms where Wails exposes no override. No durable Quotier state may depend on it; all app-controlled WebView storage should use `.devdata` where supported.
- DEBUG logs go both to the terminal and `.devdata/quotier-labs/logs`. Crashes write there before the process exits. Temp/session content is age-cleaned on the next dev launch.
- `make dev-reset` may remove only the marker-verified `.devdata/quotier-labs` directory after a clear confirmation (or an explicit `CONFIRM=1` automation flag). Separate targets such as `make dev-open-data` and `make dev-backup` may improve manual testing without exposing production data.
- Automated tests do not share persistent `.devdata`. Each test receives its own `t.TempDir()`/temporary AppPaths root and cleans it, preventing test-order coupling.

The dev app must never open beta/production data and an installed app must never open `.devdata`. The repository-local policy is a convenience profile, not CWD-based path resolution.

### 9.2 Development version behavior

`make dev` derives BuildInfo on every launch and passes it with Wails `-ldflags`. At the exact clean `v1.3.0-beta.1` commit it may display `1.3.0-beta.1+dev`; after commits it displays the nearest tag plus commit count/SHA; with local changes it appends `.dirty`. It also displays “Development” in About and disables updater installation.

For a real beta release, create a new annotated signed tag on a clean commit and let CI build that exact tag. Do not edit `GetAppInfo()` or backup code and do not retag `v1.3.0-beta.1`.

## 10. Required code, configuration, and build changes

This is an implementation inventory, not authorization to make the changes in this task.

### Backend/runtime

- Add an infrastructure `appidentity`/`apppaths` package with OS-specific resolvers and injected build info.
- Resolve/create paths in `apps/desktop/main.go` before DI; pass `AppPaths` and `BuildInfo` into logging, DB, backup, images, export temp, crash handling, and app-info handlers.
- Change Wire providers to accept an absolute DB path; regenerate Wire output. Remove all production CWD fallbacks.
- Update logger to rotating files, environment-aware levels, redaction policy, sink cleanup, and bootstrap fallback.
- Add single-instance locking and explicit graceful DB close. Startup/shutdown must leave a clean-shutdown marker and clean owned temp state.
- Redesign managed asset storage around validated relative IDs/content hashes, atomic copy, collision safety, and migration from existing absolute image paths.
- Redesign recovery checkpoints as atomically written state files (or a dedicated recovery DB) with schema, bounds, timestamps, and cleanup after authoritative save.
- Make config storage typed/versioned/atomic; migrate theme and density from WebView storage. Treat localStorage as cache only.
- Make temporary export paths random/private and add lifecycle cleanup. Replace command-string shell integration with argument-safe/native adapters.
- Complete backup archives with assets/manifests/hashes; make creation atomic and retention safe; make restore a verified relaunch transaction.
- Inject real application and migration versions into About, logs, backups, crash metadata, and compatibility checks.
- Add an application-layer update service with provider, signed-manifest verifier, SemVer/channel policy, resumable bounded downloader, platform installer interface, update transaction journal, progress events, cancellation, and typed failures. Network and installer code remain infrastructure; React only renders state and requests actions.

### Wails/platform configuration

- Populate full `wails.json` Info and align the executable filename/identity.
- Set the source macOS bundle ID, version fields, minimum OS, entitlements, and signing configuration.
- Set Windows manifest identity/AppUserModelID, explicit WebView local data path, NSIS per-user default, stable uninstall key, correct shortcut choices, signing hooks, and safe uninstall behavior.
- Add Linux package metadata, desktop entry, icons, declared dependencies, maintainer scripts only where necessary, and package lint configuration.
- Add the Windows update-mode installer contract, signed/notarized macOS PKG handoff, and Linux package-kind detection/native installer handoff.

### Release pipeline

- Replace the host-local `~/go/bin/wails` assumption with a pinned, verified Wails tool invocation.
- Run all Go modules/tests, frontend checks, vulnerability/audit gates, and clean-tree checks before packaging.
- Build/sign/package on native CI runners for each OS/architecture, then verify signatures, notarization, package contents, checksums, SBOM, and installability.
- Keep signing credentials only in protected CI secret/key services; never in repository files or logs.
- Retain symbol files and a release manifest mapping commit, Go/Wails versions, schema, artifact hashes, and signing identities.
- Generate and Ed25519-sign the canonical channel/update manifests after every platform artifact is signed; publish manifests, signatures, packages, checksums, release notes, and attestations together as a GitHub Release. Enable immutable releases where available and still verify independently in the client.
- Add a dev launcher wrapper/Make target that derives BuildInfo and injects the absolute `.devdata/quotier-labs` root. Release CI must assert that this path/profile cannot be enabled in signed builds.

## 11. Migration for existing installations and development data

Current releases/development builds may have data in more than one legacy location because CWD determined the DB/log/backup path. Migration therefore must be conservative and user-visible.

### 11.1 Known legacy candidates

- `quotierlabs.db`, `quotierlabs.db-wal`, and `quotierlabs.db-shm` in the process CWD used by prior launches.
- A DB beside the legacy executable, if a prior packaged shortcut launched with that working directory.
- Repository-root DB from development commands.
- `os.UserConfigDir()/QuotierLabs/images` for managed images.
- `./backups` relative to a prior launch working directory.
- `%APPDATA%/<legacy-binary>.exe` WebView storage on Windows, including recovery/preferences.

Do not recursively search the user's disk. Scan only documented candidates available for the running legacy/new install, and allow the user to choose an additional DB/backup explicitly through a native file picker.

### 11.2 Migration algorithm

1. If a valid target DB already exists, open only that DB and do not auto-import another candidate.
2. If target data is absent, inspect known candidates read-only. Verify SQLite header, expected tables, Goose/schema versions, and integrity. Never trust filename alone.
3. If exactly one valid candidate exists, present its location in redacted/friendly form, company name/counts, and modified time; ask permission to migrate. If multiple exist, require the user to choose—never merge silently.
4. Acquire locks and create a verified snapshot through SQLite, not a raw live copy. Copy to a staged target generation and migrate schema there.
5. Import managed assets, hashing/deduplicating them and translating only contained legacy absolute paths to new relative asset IDs. Report missing assets without deleting source data.
6. Import durable WebView recovery/preferences through a one-time versioned adapter where feasible. Prefer the authoritative DB when a recovery checkpoint is stale; never silently overwrite newer saved content.
7. Validate target DB, references, representative PDF generation, and counts. Write a migration receipt containing source fingerprint, target identity, time, and outcome—no business content.
8. Leave legacy DB/assets untouched and clearly label them as a recoverable old copy. Offer cleanup only after multiple successful starts and a verified user backup; never delete automatically in the migration release.
9. Legacy logs need not migrate. Legacy `./backups` remain user-owned; detect and inform, but do not move or delete them without approval.
10. The migration is idempotent. A crash at every step either resumes from a stage marker or discards only the incomplete staged target.

## 12. Testing and verification strategy

### 12.1 Automated path tests

- Table-test Windows, macOS, and Linux resolver inputs, including unset/empty/relative XDG values, spaces, Unicode usernames, long paths, missing home/config APIs, read-only locations, and channel identity.
- Assert that no resolved writable root is inside the executable/install root and no production path contains the repository/CWD.
- Inject temp roots for all storage tests; assert exact modes on Unix and containment behavior across symlinks/traversal inputs.
- Add a static/CI check forbidding new production uses of relative DB/log/backup paths and direct path API calls outside the resolver package.

### 12.2 Storage and failure tests

- Fresh DB creation; WAL restart; concurrent second-instance attempt; abrupt process kill; disk full; permission denied; read-only config; corrupt config; cache deletion; stale temp cleanup.
- Recovery checkpoint write/restore/clear, crash between temp write and rename, stale/newer comparison, and WebView cache deletion without recovery loss.
- Asset collision, same-content deduplication, malformed extension/content mismatch, oversized dimensions, symlink escape, missing referenced asset, and migration from legacy absolute path.
- Log rotation/retention and a PII regression corpus asserting no customer, GSTIN/PAN, bank, quotation content, or full path leaks.

### 12.3 Backup/restore tests

- Live WAL writes during backup; backup includes every referenced asset; `.partial` never appears as a completed backup; destination disconnect/disk-full; retention never deletes unrelated files.
- Corrupt ZIP, path traversal, absolute names, symlinks, duplicates, zip bomb ratios, truncated archive, modified hash, incompatible old/new schema, malformed DB, and oversized assets.
- Kill the app at every restore stage and prove either old or new complete generation starts. Verify rollback, DB reopening only after relaunch, WAL/SHM correctness, and multi-version upgrade restore.

### 12.4 Development-profile and updater tests

- Run `make dev` from the repository root and from a wrapper-invoked arbitrary CWD. Assert that DB, assets, logs, crash metadata, backups, exports defaults, cache, recovery, and app temp appear only under the absolute marker-owned `.devdata/quotier-labs` tree. Assert that no production/beta OS data root is opened.
- Verify dev version generation at an exact tag, commits after a tag, no tags, and a dirty tree. Release builds reject dirty/non-exact/malformed tags and show the identical derived version through every consumer.
- Test production versus beta SemVer selection, including prerelease ordering, stable promotion, skip/remind state, incompatible minimum source version, malformed tags, drafts, and GitHub's latest endpoint excluding prereleases.
- Test manifest canonicalization/signature, wrong/rotated key, altered release notes/URL/hash/size, app-ID/channel mismatch, freeze/rollback response, unsupported OS/architecture, redirect downgrade, unapproved host/private address, rate-limit/ETag behavior, offline startup, partial resume, disk full, cancellation, and checksum/platform-signature failure.
- Platform updater integration tests must cover installer cancellation, running-process wait, successful relaunch, old/new executable verification, user permission denial, and power/process interruption at every transaction stage.
- Build historical install fixtures at least for N-2 releases. Update each to the candidate release with and without every DB/document migration, then verify settings, quotations, assets, backups, PDF rendering, rollback copy, idempotent second start, and older-binary newer-schema refusal.

### 12.5 Packaging and clean-machine matrix

Use fresh VMs/physical machines with no repository, Go, Node, Wails, signing tools, or prior app data:

| OS | Minimum matrix |
|---|---|
| Windows | Supported Windows 10 and Windows 11; standard non-admin user; per-user install; optional all-user install by admin; offline WebView scenario |
| macOS | Oldest supported macOS plus current; Intel and Apple Silicon if both shipped; Gatekeeper online and offline after stapling |
| Linux | Each explicitly supported Debian/Ubuntu version and desktop; add each RPM distro before publishing RPM |

For every target execute:

```text
Download release artifact
-> verify signature/checksum
-> install without developer tools
-> launch from OS launcher with arbitrary/read-only CWD
-> complete onboarding
-> create quotation with images/signature/stamp
-> restart and verify persistence
-> export/print/open PDF
-> enable and run backup
-> force abnormal termination and recover
-> discover the next signed update in Settings
-> download, verify, install, relaunch, and migrate through the in-app update flow
-> verify data/assets/preferences/backups
-> attempt downgrade and receive safe refusal
-> reinstall same version and verify repair/data preservation
-> uninstall and verify binaries/launchers removed, user data retained
-> reinstall and verify retained data discovered
-> explicitly delete local data and verify clean onboarding
```

Also test paths with spaces/non-ASCII characters, low disk space, disconnected backup volume, antivirus/quarantine behavior, two simultaneous launches, clock/time-zone changes, and no network connection.

### 12.6 Release gates

A build is not releasable until:

- no runtime mutable file is created beside the executable or in CWD;
- all package identities and runtime versions match the release manifest;
- signatures/notarization/package lint and checksums pass;
- clean-machine install, upgrade, uninstall, reinstall, backup, restore, recovery, and PDF workflows pass on every advertised OS;
- a support diagnostics bundle is bounded and contains no business data;
- legacy migration is tested from each known old location;
- user data survives ordinary upgrade/reinstall/uninstall by default.
- development artifacts stay under `.devdata/quotier-labs`, which is ignored and absent from packages;
- update feed/manifests and artifacts verify, channel rules pass, and signed N-2-to-current in-app update/migration tests pass.

## 13. Ordered implementation plan and acceptance criteria

### Step 1 — Freeze identity and supported distribution matrix

Decide canonical IDs, executable compatibility name, supported OS versions/architectures, Windows install scope, and Linux package targets. Add one generated build-info pipeline.

Acceptance: a checked test manifest shows identical product/version/channel values in Go, Wails, plist, Windows resources/NSIS, Linux metadata, About, logs, and backup metadata; channel roots are isolated.

### Step 2 — Implement and test `AppPaths`

Build OS resolvers, validation, private directory creation, the explicit repository-local `.devdata/quotier-labs` development profile, isolated test injection, and typed bootstrap errors. Wire it before every filesystem consumer.

Acceptance: installed apps start with a read-only arbitrary CWD on all OSes and write only native roots; `make dev` writes every Quotier-controlled artifact only below marker-owned `.devdata/quotier-labs`; tests use isolated temp roots; no implicit CWD path remains.

### Step 3 — Move database and add lifecycle safety

Open SQLite from `DataRoot/db`, add explicit close and single-instance locking, pre-migration snapshot/integrity checks, newer-schema refusal, and clean startup/shutdown stages.

Acceptance: fresh install, restart, abrupt kill, migration failure, concurrent launch, upgrade, reinstall, and downgrade tests have deterministic non-corrupt outcomes.

### Step 4 — Migrate legacy data and assets

Implement candidate detection, consent/selection, staged verified DB copy, managed asset conversion, receipts, idempotency, and retained legacy rollback copies.

Acceptance: every known legacy layout migrates without modifying its source; ambiguous candidates require choice; interruption at any stage is recoverable.

### Step 5 — Classify config, recovery, WebView, cache, and temp data

Move recovery to StateRoot, preferences to versioned config, WebView data to local cache where configurable, and print/share work to private session temp with cleanup.

Acceptance: deleting cache/WebView data loses no quotation or recovery checkpoint; temp PDFs are private/random and age-cleaned; theme/density persist through a cache reset.

### Step 6 — Harden logging and crash diagnostics

Add bootstrap logging, rotating/redacted production logs, sink cleanup, panic boundaries, sanitized crash metadata, support-bundle export, and retained release symbols.

Acceptance: startup failures are actionable; rotation bounds disk use; crash tests produce a bounded record; PII regression tests and opt-in/no-upload requirements pass.

### Step 7 — Complete backup and safe restore

Include assets and hashed manifest, actual versions, atomic destination writes, validation/limits, retention, failure UI, and restart-based transactional restore with rollback.

Acceptance: Phase 14 requirements are met; backup remains consistent during writes; fault-injected restore always leaves one bootable generation; unknown destination files are never removed.

### Step 8 — Productize platform packages

Configure full Wails/platform identities; create Windows NSIS, macOS DMG, and Linux native packages; add launcher/icon/uninstall behavior; remove placeholder registration.

Acceptance: each artifact installs as a standard user where intended, appears once in the native launcher/application list, launches independently of CWD, and removes only package-owned files on default uninstall.

### Step 9 — Establish tag-derived versions, signing, and automated releases

Add tag-derived BuildInfo/platform metadata, native CI jobs, protected platform and Ed25519 update signing, checksums, SBOM, release/update manifests, symbol retention, artifact verification, and clean exact-tag rules.

Acceptance: `v1.3.0-beta.1` builds report `1.3.0-beta.1` everywhere; Windows signatures/timestamps verify, macOS Gatekeeper succeeds offline with a stapled ticket, Linux package lint/signature/checksum passes, and signed manifests identify the exact matching artifacts/schema targets.

### Step 10 — Implement the in-app update lifecycle

Implement GitHub/provider discovery, channel selection, signed manifests, secure download/progress/cancel, Settings UI, Windows NSIS update mode, signed macOS PKG handoff, Linux native-package handoff, transaction journaling, pre-update save/backup, staged first-launch migrations, health confirmation, and recovery/rollback.

Acceptance: production ignores prereleases; beta discovers a newer beta; dev updater is disabled; each platform completes a verified update/relaunch; N-2 databases with new Goose/document migrations upgrade exactly once without losing settings, documents, or assets; every fault-injected stage preserves a bootable data generation.

### Step 11 — Execute the clean-machine and lifecycle qualification

Run the full matrix in section 12, archive evidence, update support/uninstall/data-location documentation, and fix all discovered defects before release.

Acceptance: every release gate passes on every advertised OS and architecture. There are no exceptions recorded as “known issues” for data loss, install privilege, upgrade, backup/restore, or uninstall behavior.

## Final invariant for implementation agents

At every filesystem write, the implementation must be able to answer all five questions:

1. Is this immutable application content, durable business data, configuration, state/logs, cache, temp, or a user-owned document/backup?
2. Which central `AppPaths` capability or native user-selected path authorizes it?
3. What permissions, bounds, atomicity, and cleanup lifecycle apply?
4. What happens during crash, upgrade, reinstall, and uninstall?
5. Can the same operation run from a launcher with an arbitrary read-only CWD?

If any answer is ambiguous, the write is not ready to implement.
