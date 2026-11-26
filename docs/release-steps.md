# Quotier Labs macOS and Windows Release Runbook

Status: authoritative operational runbook for the active desktop release matrix.

Last verified: 2026-09-01.

This document covers both the one-time setup and every later release. The supported release targets
are macOS universal (`amd64` + `arm64`) and Windows `amd64`. Linux packaging is deferred.

## 1. Direct answer: can a Windows release be built on a Mac?

Do not use the Mac to create the official Windows release. Go/Wails can cross-compile some Windows
output from macOS, but that is not the product's release artifact. Quotier's Windows release must:

1. build on Windows;
2. sign the application executable with Authenticode;
3. let NSIS build and sign its uninstaller and outer installer;
4. apply an RFC 3161 timestamp; and
5. verify the result with Windows trust tools and install it on clean Windows 10/11.

`scripts/package-windows.sh` deliberately rejects macOS. GitHub Actions is the normal solution: a
tag pushed from the Mac starts separate native macOS and Windows jobs. A Linux runner performs only
cheap source verification and release publication; it does not build or publish a Linux app.

## 2. What a successful release produces

For tag `vX.Y.Z` or `vX.Y.Z-beta.N`, the workflow creates a **draft** GitHub Release containing:

- `quotier-labs-X.Y.Z-macos-universal.dmg` — normal macOS drag-to-Applications installer;
- `quotier-labs-X.Y.Z-macos-universal.pkg` — native macOS updater handoff;
- checksum files for both macOS artifacts;
- `quotier-labs-X.Y.Z-windows-amd64-installer.exe` — per-user NSIS installer;
- Windows checksum output;
- `quotierlabs-update.json` and `quotierlabs-update.json.sig` — app update metadata;
- `update-metadata.sha256`;
- CycloneDX SBOM; and
- GitHub build-provenance attestations.

The GitHub Release remains a draft until the artifacts pass clean-machine installation checks.
The in-app updater sees only a published release.

## 3. Costs and accounts

Proper public distribution is not completely free.

### macOS

Apple's free developer account is sufficient for local development, but not for a publicly trusted
Developer ID release. Join the Apple Developer Program. Apple currently lists the membership at
**USD 99 per membership year**, or local currency where available. Developer ID certificates and
notarization are included; there is no separate per-build notarization fee. See Apple's
[membership details](https://developer.apple.com/programs/whats-included/) and
[Developer ID documentation](https://developer.apple.com/help/account/certificates/create-developer-id-certificates).

Choose the enrollment identity carefully:

- Individual enrollment displays the individual's verified legal name as publisher.
- Organization enrollment displays the legal organization and normally requires a D-U-N-S number,
  organization-domain email, and a public website.

### Windows

Unsigned or self-signed installers are not a proper public release. Microsoft documents that a
self-signed binary behaves like an unsigned binary for public trust, and even a newly signed publisher
may initially receive a SmartScreen “unrecognized app” warning while reputation develops. See
[Microsoft's SmartScreen guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

The active workflow uses **DigiCert KeyLocker/Software Trust Manager** because its HSM-backed key can
be used by SignTool inside an ephemeral GitHub Windows runner. DigiCert pricing is account/quote based;
budget for a paid publicly trusted code-signing certificate plus its cloud signing service. Another
CA/cloud signer can be substituted later, but the workflow's KeyLocker setup must then be changed and
re-tested before a release.

Do not plan around downloading a new ordinary signing key as a reusable PFX. CA/Browser Forum rules
have required newly issued public code-signing private keys to remain in approved hardware or an
HSM-backed signing service since June 2023. See the
[current Code Signing Baseline Requirements](https://cabforum.org/working-groups/code-signing/requirements/).

Microsoft Azure Artifact Signing is a possible lower-cost alternative where its **Public Trust**
identity validation is available. Its Basic account is currently listed at USD 9.99/month, but the
official eligibility list must be checked before purchase; as of this runbook date, Public Trust is
not offered for an India-based legal identity. The repository is therefore not wired to depend on it.
See the [Artifact Signing quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)
and [current pricing](https://azure.microsoft.com/en-us/products/artifact-signing).

### GitHub

GitHub Actions standard runners are free for public repositories. Private repositories receive the
plan's monthly allowance; macOS minutes are considerably more expensive than Windows/Linux minutes
after the allowance. Check [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
before repeated release retries. The workflow creates one native job per supported OS.

## 4. Release trust model

Three independent trust mechanisms are used:

| Trust | Purpose | Private material |
|---|---|---|
| Apple Developer ID + notarization | macOS Gatekeeper trusts the app/DMG/PKG | Developer ID private keys in exported CI P12 files and Apple account credentials |
| Windows Authenticode + timestamp | Windows verifies publisher and integrity | Code-signing private key stays in DigiCert's HSM; CI receives only client credentials |
| Quotier Ed25519 update signature | Existing Quotier installations trust the update manifest | One offline-backed-up Ed25519 private key; public half embedded in every release |

Never commit any private key, P12/PFX, password, API key, app-specific password, or base64-encoded
secret. Base64 is transport encoding, not encryption.

## 5. One-time local setup

### 5.1 Create and protect the Quotier update key

Generate this key once on a trusted offline/local machine:

```bash
umask 077
openssl genpkey -algorithm Ed25519 -out quotier-update-private.pem
openssl pkey -in quotier-update-private.pem -pubout -outform DER \
  | tail -c 32 | base64
base64 < quotier-update-private.pem | tr -d '\n'
```

The first output is `QUOTIER_UPDATE_PUBLIC_KEY`. The second base64 output is stored in GitHub as
`UPDATE_PRIVATE_KEY_PEM_B64`.

Keep two encrypted offline backups of `quotier-update-private.pem` in separate controlled locations.
Losing this key prevents installed copies from trusting later update manifests. If compromise is
suspected, stop publishing immediately; key rotation requires a release signed by the still-trusted
old key.

### 5.2 Configure signed Git tags

Release scripts require an exact annotated tag. A cryptographically signed tag is preferred:

```bash
git config --global user.signingkey YOUR_GPG_KEY_ID
git config --global tag.gpgSign true
```

GPG tag signing is free. If it is not configured, use `git tag -a`; never use a lightweight release
tag and never move or reuse a published tag.

## 6. One-time Apple setup

1. Enroll in the Apple Developer Program and complete identity verification.
2. Enable two-factor authentication on the Apple Account.
3. In Keychain Access, create a Certificate Signing Request.
4. In Apple Developer → Certificates, Identifiers & Profiles, create both:
   - **Developer ID Application**;
   - **Developer ID Installer**.
5. Download and install both `.cer` files into the login keychain used by the CSR.
6. Verify the identities locally:

   ```bash
   security find-identity -v -p codesigning
   security find-identity -v
   ```

7. In Keychain Access → My Certificates, export each identity **with its private key** as a separate,
   strongly password-protected P12:
   - application identity → `developer-id-application.p12`;
   - installer identity → `developer-id-installer.p12`.
8. Encode them for GitHub without committing the output:

   ```bash
   base64 < developer-id-application.p12 | tr -d '\n'
   base64 < developer-id-installer.p12 | tr -d '\n'
   ```

9. In the Apple Account, create an app-specific password for CI notarization. Record the Apple Team
   ID shown in the developer account.
10. Keep encrypted offline backups of the P12 files and their passwords. Do not revoke working
    Developer ID certificates during routine renewal; revocation affects trust materially.

The exact identity secrets must include the full text printed by `security find-identity`, for example:

```text
Developer ID Application: Legal Publisher Name (TEAMID)
Developer ID Installer: Legal Publisher Name (TEAMID)
```

An App Store Connect app record is not required for this direct Developer ID distribution route.

## 7. One-time Windows signing setup

The checked-in GitHub workflow is configured for DigiCert KeyLocker. Complete these steps in the
DigiCert account; labels may evolve, so follow DigiCert's current
[GitHub/KSP integration guide](https://docs.digicert.com/en/digicert-keylocker/ci-cd-integrations-and-deployment-pipelines/scripts/github/scripts-for-signing-using-ksp-library-on-github.html)
when the portal differs.

1. Purchase a publicly trusted Windows code-signing certificate with KeyLocker/Software Trust access.
2. Complete individual or organization identity verification. Use the same durable publisher identity
   for future renewals so Windows reputation is not unnecessarily reset.
3. Create the KeyLocker keypair and public code-signing certificate.
4. Create a restricted CI service/user with permission to sign only with that keypair.
5. Create an API key for that CI identity.
6. Create and download the DigiCert client-authentication P12 and save its one-time password.
   This authenticates CI; it is not the exportable code-signing private key.
7. Obtain from DigiCert:
   - service host URL (`SM_HOST`);
   - API key (`SM_API_KEY`);
   - client-authentication P12 and password;
   - public signing certificate SHA-1 fingerprint (`SM_CODE_SIGNING_CERT_SHA1_HASH`).
8. Encode the client-authentication P12:

   ```bash
   base64 < digicert-client-auth.p12 | tr -d '\n'
   ```

9. Apply least privilege, expiration, MFA/server-to-server controls, signing audit logs, and usage
   alerts in DigiCert. Record renewal dates in a calendar.

The workflow installs DigiCert's client on the temporary Windows runner, synchronizes the public
certificate into the runner's certificate store, and leaves the signing private key inside DigiCert's
HSM. `scripts/windows-sign.cmd` then uses the fingerprint with SignTool for the application,
uninstaller, and installer.

## 8. Configure GitHub Actions

In GitHub, open the repository → **Settings → Secrets and variables → Actions**.

### 8.1 Repository secrets

Add these exact names:

| Secret | Value |
|---|---|
| `QUOTIER_UPDATE_PUBLIC_KEY` | Base64 raw 32-byte Ed25519 public key |
| `UPDATE_PRIVATE_KEY_PEM_B64` | Base64 of the complete Ed25519 private PEM |
| `MAC_CERT_P12_B64` | Base64 Developer ID Application P12 |
| `MAC_CERT_PASSWORD` | Application P12 password |
| `MAC_INSTALLER_CERT_P12_B64` | Base64 Developer ID Installer P12 |
| `MAC_INSTALLER_CERT_PASSWORD` | Installer P12 password |
| `APPLE_DEVELOPER_ID_APPLICATION` | Full Developer ID Application identity text |
| `APPLE_DEVELOPER_ID_INSTALLER` | Full Developer ID Installer identity text |
| `APPLE_ID` | Apple Account email used for notarization |
| `APPLE_TEAM_ID` | Apple developer team ID |
| `APPLE_APP_PASSWORD` | Dedicated Apple app-specific password |
| `SM_HOST` | DigiCert KeyLocker host URL |
| `SM_API_KEY` | Restricted DigiCert CI API key |
| `SM_CLIENT_CERT_FILE_B64` | Base64 DigiCert client-authentication P12 |
| `SM_CLIENT_CERT_PASSWORD` | DigiCert client-authentication P12 password |
| `SM_CODE_SIGNING_CERT_SHA1_HASH` | DigiCert public code-signing certificate fingerprint |

Do not place secrets in repository variables, workflow YAML, release notes, shell history, issues,
or Actions artifacts. Limit repository administrator access and enable mandatory 2FA.

### 8.2 Repository variables

Add:

| Variable | Meaning |
|---|---|
| `QUOTIER_MINIMUM_SOURCE_VERSION` | Oldest already-released Quotier version permitted to install this update |
| `QUOTIER_MINIMUM_DB_SCHEMA` | Oldest database schema verified to migrate safely to this release |

Examples:

- If `v1.3.0-beta.2` was distributed and its database is schema 10, use
  `QUOTIER_MINIMUM_SOURCE_VERSION=1.3.0-beta.2` and `QUOTIER_MINIMUM_DB_SCHEMA=10` for beta.3.
- If there was no supported predecessor at all, set both to the first release's own version/schema.
- Do not lower these values without testing that older version and schema through the entire update.

The current highest migration is derived automatically from `migrations/`; do not manually set the
target schema and never edit a migration that has shipped.

### 8.3 GitHub repository settings

1. Under **Actions → General**, allow the repository workflow and give `GITHUB_TOKEN` read/write
   contents permission so it can create a draft Release and provenance.
2. Add a tag ruleset for `v*` so only the owner/release maintainer can create release tags.
3. Protect the default branch and require the normal tests before merging.
4. Keep `.github/workflows/release.yml.disabled` reviewed but disabled until signing credentials
   are configured. Rename it to `.github/workflows/release.yml` only when enabling signed releases.
   Adding/enabling the workflow does not rebuild old
   tags; it runs only when a new matching tag is pushed.
5. Optionally use a protected GitHub Environment named `release` with manual approval. If enabled,
   add `environment: release` to signing/publish jobs and store the credentials there rather than as
   repository secrets.

## 9. First automated release from this repository

Tags `v1.3.0-beta.1` and `v1.3.0-beta.2` already exist. Do not overwrite either. The next beta tag is
`v1.3.0-beta.3`; the first stable production-channel tag may be `v1.3.0` after beta acceptance.
Beta and production have separate app IDs and data directories, so stable is an explicit install,
not an automatic beta-to-production update.

### 9.1 Prepare the source

From the repository root:

```bash
git status --short
go test -race ./...
cd frontend
npm ci
npm test -- --run
npm run lint
npm run build
cd ..
```

Resolve every failure. Review `git diff`, update `plans/WORKLOG.md`, commit all intended source and
release-pipeline changes, and ensure the worktree is empty:

```bash
git status --short
git push origin HEAD
```

The release script rejects a dirty tree and a tag that is not exactly at `HEAD`.

### 9.2 Create and push the tag

Preferred signed tag:

```bash
git tag -s v1.3.0-beta.3 -m "Quotier Labs v1.3.0-beta.3"
git tag -v v1.3.0-beta.3
git push origin v1.3.0-beta.3
```

If GPG signing is not available, create an annotated tag instead:

```bash
git tag -a v1.3.0-beta.3 -m "Quotier Labs v1.3.0-beta.3"
git push origin v1.3.0-beta.3
```

Pushing the tag starts `.github/workflows/release.yml` only after the disabled workflow has been
renamed to that active filename and committed before the tag is created.

### 9.3 Observe the workflow

In GitHub → **Actions → Signed desktop release**, verify:

1. `verify` passes tests and path-policy checks;
2. `macos` imports temporary identities, builds universal, signs, notarizes, staples, and uploads;
3. `windows` connects to KeyLocker, builds on Windows, signs the app/uninstaller/installer, verifies,
   and uploads;
4. `publish` merges both artifact sets, signs the Quotier update manifest, creates the SBOM and
   provenance, and opens a **draft** GitHub Release.

Never rerun only the publication step with artifacts from a different commit. Every artifact,
manifest, checksum, tag, and runtime version must refer to the same commit.

## 10. Mandatory verification before publishing

### 10.1 macOS artifact verification

Download the draft artifacts onto a Mac:

```bash
codesign --verify --deep --strict --verbose=2 "/Applications/Quotier Labs Beta.app"
spctl --assess --type execute --verbose=2 "/Applications/Quotier Labs Beta.app"
xcrun stapler validate "quotier-labs-VERSION-macos-universal.dmg"
xcrun stapler validate "quotier-labs-VERSION-macos-universal.pkg"
pkgutil --check-signature "quotier-labs-VERSION-macos-universal.pkg"
```

Test on a clean supported Intel Mac and Apple Silicon Mac, or clean VMs where licensing permits:

- download through a browser so quarantine/Gatekeeper behavior is real;
- install from DMG into `/Applications`;
- confirm no bypass such as right-click → Open is required;
- create a quotation, save, reload, preview, export PDF, backup, restore, and quit cleanly;
- install the PKG over the prior version and confirm user data remains;
- uninstall the app bundle, reinstall, and confirm preserved data is rediscovered.

### 10.2 Windows artifact verification

On a clean standard-user Windows 10 and Windows 11 machine or VM:

```powershell
Get-AuthenticodeSignature .\quotier-labs-VERSION-windows-amd64-installer.exe | Format-List *
signtool verify /pa /all /v .\quotier-labs-VERSION-windows-amd64-installer.exe
Get-FileHash .\quotier-labs-VERSION-windows-amd64-installer.exe -Algorithm SHA256
```

Require `Status: Valid`, the expected publisher, a valid timestamp, and the published checksum.
Then verify:

- installer runs unelevated for the default per-user scope;
- publisher is displayed correctly;
- Start Menu shortcut works and desktop shortcut is opt-in;
- application, generated uninstaller, and outer installer are all signed;
- create/save/reload/preview/PDF/backup/restore works;
- upgrade replaces application files but preserves AppData;
- default uninstall preserves quotations/settings/backups; reinstall discovers them;
- WebView2 behavior is acceptable on a clean/offline machine according to the supported promise.

A valid new signature may still receive an initial SmartScreen reputation warning. Confirm that the
publisher is correct; never ask users to disable SmartScreen.

### 10.3 Publish

Only after both platform checklists pass:

1. edit and review the generated release notes;
2. confirm every filename contains the exact tag version;
3. confirm the update manifest contains only Windows NSIS and macOS PKG targets;
4. confirm checksums/signatures and provenance are attached;
5. publish the GitHub draft Release.

After publication, test the in-app update check from the previous beta/stable build. Production
ignores prereleases; beta accepts newer beta releases only.

## 11. Every later release

For each later release:

1. Choose the next immutable SemVer tag:
   - beta: `v1.3.0-beta.4`;
   - stable bug fix: `v1.3.1`;
   - backward-compatible feature: `v1.4.0`;
   - breaking product/data boundary: plan and test before choosing `v2.0.0`.
2. Test direct install and update from `QUOTIER_MINIMUM_SOURCE_VERSION`.
3. If migrations changed, test a real copy of every supported older database. Migrations must be
   cumulative, run exactly once, preserve data, and pass integrity/foreign-key checks.
4. Update the two GitHub compatibility variables only after those tests establish the supported floor.
5. Confirm Apple membership/certificates, Apple app password, DigiCert certificate/client credentials,
   and update signing key are not near expiration.
6. Run the source checklist, commit, ensure a clean tree, create a new signed/annotated tag, and push it.
7. Review the Actions run and draft artifacts.
8. Repeat clean-machine signature, install, upgrade, data-preservation, and uninstall tests.
9. Publish the draft and verify in-app update discovery.

Never delete and recreate a published release tag to “fix” its contents. Fix the source and issue the
next beta/patch version. Keep prior artifacts and symbols available for crash diagnosis and rollback.

## 12. Credential renewal and incident rules

- **Apple membership:** renew annually. Existing properly signed apps can continue to run, but new
  releases require a valid membership/certificate. Replace expiring certificates deliberately and
  update their GitHub P12 secrets together.
- **Apple app-specific password:** if revoked, create a dedicated replacement and update only
  `APPLE_APP_PASSWORD`.
- **DigiCert certificate/client credentials:** renew before expiry, retain the same verified publisher
  identity, update secrets, and run a signing-only test before the next release tag.
- **GitHub secret suspected leaked:** rotate it immediately, audit Actions logs/runs, and review all
  releases made during the exposure.
- **Windows code-signing key compromise:** suspend signing and contact the CA for revocation.
- **Apple Developer ID compromise:** contact Apple and revoke only through the incident process.
- **Quotier update private key compromise:** stop publication. Do not silently replace the public key;
  existing installations will reject it. Follow a planned old-key-signed rotation release if possible.

## 13. Files that define the release system

| File | Responsibility |
|---|---|
| `.github/workflows/release.yml.disabled` | Parked native signed macOS/Windows workflow; rename to `.yml` after credentials are ready |
| `scripts/lib/build-info.sh` | Exact tag → version/channel/app identity/Go linker metadata |
| `scripts/package-macos.sh` | Universal app, Developer ID signing, PKG/DMG, notarization/stapling |
| `scripts/package-windows.sh` | Windows app, NSIS per-user installer, SignTool verification/checksum |
| `scripts/windows-sign.cmd` | SHA-256 Authenticode and RFC 3161 timestamp command used by NSIS hooks |
| `scripts/finalize-release.sh` | Signed in-app update metadata finalization |
| `scripts/generate-update-manifest.mjs` | macOS PKG and Windows NSIS target manifest with size/hash/schema rules |
| `apps/desktop/build/windows/installer/project.nsi` | Shortcut, install, update, uninstall, inner/outer signing behavior |
| `docs/release-steps.md` | Human one-time and repeatable release procedure |

Linux runtime compatibility code may remain where it keeps shared code portable, but no Linux package,
Linux release job, Linux update artifact, or Linux release credential belongs to the active pipeline.
