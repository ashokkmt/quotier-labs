import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const configPath = resolve(root, 'apps/desktop/wails.json')
const plistPath = resolve(root, 'apps/desktop/build/darwin/Info.plist')
const windowsManifestPath = resolve(root, 'apps/desktop/build/windows/wails.exe.manifest')
const originalConfig = readFileSync(configPath, 'utf8')
const originalPlist = readFileSync(plistPath, 'utf8')
const originalWindowsManifest = readFileSync(windowsManifestPath, 'utf8')
if (!process.env.QL_VERSION || !process.env.QL_PLATFORM_VERSION || !process.env.QL_APP_ID || process.argv.length < 3) {
  console.error('run-with-metadata requires QL_* build variables and a command')
  process.exit(2)
}
const config = JSON.parse(originalConfig)
config.name = process.env.QL_NAME
config.info.productName = process.env.QL_NAME
config.info.productVersion = process.env.QL_METADATA_VERSION || process.env.QL_PLATFORM_VERSION
const plist = originalPlist
  .replace(/<key>CFBundleIdentifier<\/key><string>[^<]+<\/string>/, `<key>CFBundleIdentifier</key><string>${process.env.QL_APP_ID}</string>`)
  .replace(/<key>CFBundleVersion<\/key><string>[^<]+<\/string>/, `<key>CFBundleVersion</key><string>${process.env.QL_MAC_BUILD || '1'}</string>`)
  .replace(/<key>CFBundleShortVersionString<\/key><string>[^<]+<\/string>/, `<key>CFBundleShortVersionString</key><string>${process.env.QL_PLATFORM_VERSION}</string>`)
const windowsManifest = originalWindowsManifest.replace(
  /(<assemblyIdentity type="win32" name=")[^"]+(" version=")/,
  `$1${process.env.QL_APP_ID}$2`,
)
try {
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
  writeFileSync(plistPath, plist)
  writeFileSync(windowsManifestPath, windowsManifest)
  const result = spawnSync(process.argv[2], process.argv.slice(3), { cwd: resolve(root, 'apps/desktop'), stdio: 'inherit', env: process.env })
  process.exitCode = result.status ?? 1
} finally {
  writeFileSync(configPath, originalConfig)
  writeFileSync(plistPath, originalPlist)
  writeFileSync(windowsManifestPath, originalWindowsManifest)
}
