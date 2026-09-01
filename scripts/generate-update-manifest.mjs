import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { basename, resolve } from 'node:path'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'

const root = resolve(import.meta.dirname, '..')
const artifactDir = resolve(root, 'release-artifacts')
const version = process.env.QL_VERSION
const channel = process.env.QL_CHANNEL
const tag = process.env.QL_TAG
const privateKeyPath = process.env.QUOTIER_UPDATE_PRIVATE_KEY_FILE
if (!version || !channel || !tag || !process.env.QL_APP_ID || !privateKeyPath || !process.env.QUOTIER_MINIMUM_SOURCE_VERSION || !process.env.QUOTIER_MINIMUM_DB_SCHEMA) {
  throw new Error('QL build metadata, update signing key, QUOTIER_MINIMUM_SOURCE_VERSION, and QUOTIER_MINIMUM_DB_SCHEMA are required')
}

const migrations = readdirSync(resolve(root, 'migrations')).map((name) => Number(name.match(/^(\d+)_/)?.[1] || 0))
const dbSchema = Math.max(...migrations)
const minimumDBSchema = Number(process.env.QUOTIER_MINIMUM_DB_SCHEMA)
if (!Number.isSafeInteger(minimumDBSchema) || minimumDBSchema < 1 || minimumDBSchema > dbSchema) {
  throw new Error(`QUOTIER_MINIMUM_DB_SCHEMA must be an integer from 1 through ${dbSchema}`)
}
const classify = (name) => {
  if (/windows-amd64-installer\.exe$/.test(name)) return { os: 'windows', arch: 'amd64', package: 'nsis' }
  if (/macos-universal\.pkg$/.test(name)) return [{ os: 'darwin', arch: 'amd64', package: 'pkg' }, { os: 'darwin', arch: 'arm64', package: 'pkg' }]
  return null
}
const files = readdirSync(artifactDir)
const assets = files.flatMap((name) => {
  const classified = classify(name)
  if (!classified) return []

  const path = resolve(artifactDir, name)
  const bytes = readFileSync(path)
  const targets = Array.isArray(classified) ? classified : [classified]
  return targets.map((target) => ({ ...target, url: `https://github.com/ashokkmt/quotier-labs/releases/download/${tag}/${encodeURIComponent(name)}`, size: statSync(path).size, sha256: createHash('sha256').update(bytes).digest('hex') }))
})
if (!assets.length) throw new Error('No installable release artifacts were found')

let releaseNotes = ''
if (process.env.QUOTIER_RELEASE_NOTES_FILE) releaseNotes = readFileSync(process.env.QUOTIER_RELEASE_NOTES_FILE, 'utf8').slice(0, 12_000)
const manifest = {
  format_version: 1,
  app_id: process.env.QL_APP_ID,
  channel,
  version,
  published_at: new Date().toISOString(),
  release_url: `https://github.com/ashokkmt/quotier-labs/releases/tag/${tag}`,
  release_notes: releaseNotes,
  minimum_source_version: process.env.QUOTIER_MINIMUM_SOURCE_VERSION,
  db_schema_before_min: minimumDBSchema,
  db_schema_after: dbSchema,
  document_schema_after: 5,
  critical: process.env.QUOTIER_CRITICAL_UPDATE === '1',
  assets,
}
const raw = Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
const privateKey = createPrivateKey(readFileSync(privateKeyPath))
if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Update manifest key must be Ed25519')
const publicDER = createPublicKey(privateKey).export({ type: 'spki', format: 'der' })
const publicRaw = publicDER.subarray(publicDER.length - 32).toString('base64')
if (process.env.QUOTIER_UPDATE_PUBLIC_KEY && process.env.QUOTIER_UPDATE_PUBLIC_KEY !== publicRaw) {
  throw new Error('QUOTIER_UPDATE_PUBLIC_KEY does not match the signing private key')
}
writeFileSync(resolve(artifactDir, 'quotierlabs-update.json'), raw, { mode: 0o600 })
writeFileSync(resolve(artifactDir, 'quotierlabs-update.json.sig'), sign(null, raw, privateKey).toString('base64') + '\n', { mode: 0o600 })
console.log(`Signed update manifest for ${version} (${assets.length} platform artifact${assets.length === 1 ? '' : 's'}).`)
console.log(`Embed this public key in signed builds: ${publicRaw}`)
