#!/usr/bin/env node
import { readdir, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

const target = resolve(process.argv[2] || 'build/bin')
const out = resolve(process.argv[3] || 'artifact-sizes.json')
async function files(root) {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => entry.isDirectory() ? files(join(root, entry.name)) : [{ path: join(root, entry.name), size: (await stat(join(root, entry.name))).size }]))
  return nested.flat()
}
const rows = await files(target)
const total = rows.reduce((sum, row) => sum + row.size, 0)
const largest = [...rows].sort((a, b) => b.size - a.size).slice(0, 10).map(row => ({ file: basename(row.path), bytes: row.size }))
await writeFile(out, JSON.stringify({ schema_version: 1, target, total_bytes: total, file_count: rows.length, largest_files: largest }, null, 2) + '\n')
console.log(`Wrote ${out}: ${(total / 1024 / 1024).toFixed(1)} MiB across ${rows.length} files`)
