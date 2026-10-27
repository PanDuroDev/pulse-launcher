#!/usr/bin/env node
/**
 * Fails a release when the installer predates the code it is supposed to ship.
 *
 * This regressed twice: `out/` was rebuilt and committed while the installer on
 * disk still contained month-old code. Comparing timestamps is cheap and catches
 * the whole class of mistakes (forgot `npm run dist`, dist failed silently, an
 * old `release/` folder left over from another branch).
 *
 * Order of a healthy build: every file in `out/` → `app.asar` → installer.
 *
 * Usage:
 *   node scripts/verify-installer.mjs             # unpacked app + installer
 *   node scripts/verify-installer.mjs --unpacked  # unpacked app only (npm run pack)
 */
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT_DIR = path.join(ROOT, 'out')
const UNPACKED_ASAR = path.join(ROOT, 'release', 'win-unpacked', 'resources', 'app.asar')
const RELEASE_DIR = path.join(ROOT, 'release')

/** Timestamps are seconds apart at worst; a smaller gap is a filesystem artefact. */
const TOLERANCE_MS = 1_000

const unpackedOnly = process.argv.includes('--unpacked')

async function newestFile(directory) {
  let newest = null
  const queue = [directory]
  while (queue.length > 0) {
    const current = queue.pop()
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        queue.push(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      try {
        const info = await stat(fullPath)
        if (!newest || info.mtimeMs > newest.mtimeMs) {
          newest = { path: fullPath, mtimeMs: info.mtimeMs, bytes: info.size }
        }
      } catch {
        // A file that vanished mid-walk cannot be the newest build output.
      }
    }
  }
  return newest
}

async function fileInfo(filePath) {
  try {
    const info = await stat(filePath)
    return { path: filePath, mtimeMs: info.mtimeMs, bytes: info.size }
  } catch {
    return null
  }
}

async function newestInstaller() {
  let entries
  try {
    entries = await readdir(RELEASE_DIR, { withFileTypes: true })
  } catch {
    return null
  }
  const candidates = entries
    .filter((entry) => entry.isFile() && /^Pulse-Launcher-.+-x64\.exe$/.test(entry.name))
    .map((entry) => entry.name)
  let newest = null
  for (const name of candidates) {
    const info = await fileInfo(path.join(RELEASE_DIR, name))
    if (info && (!newest || info.mtimeMs > newest.mtimeMs)) newest = info
  }
  return newest
}

function stamp(mtimeMs) {
  const date = new Date(mtimeMs)
  const pad = (value) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

function age(fromMs, toMs) {
  const seconds = Math.max(0, Math.round((toMs - fromMs) / 1000))
  if (seconds < 120) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 120) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

function row(label, info) {
  if (!info) return `${label.padEnd(22)} missing`
  return `${label.padEnd(22)} ${stamp(info.mtimeMs)}  ${path.relative(ROOT, info.path)}`
}

const failures = []
const notes = []

const newestOut = await newestFile(OUT_DIR)
if (!newestOut) {
  failures.push(`No build output in ${path.relative(ROOT, OUT_DIR)}\\ — run \`npm run build\` first.`)
}

const asar = await fileInfo(UNPACKED_ASAR)
if (newestOut && !asar) {
  failures.push(
    `release\\win-unpacked\\resources\\app.asar is missing — run \`npm run pack\` or \`npm run dist\`.`,
  )
}
if (newestOut && asar && asar.mtimeMs + TOLERANCE_MS < newestOut.mtimeMs) {
  failures.push(
    `Packaged app is ${age(asar.mtimeMs, newestOut.mtimeMs)} older than ${path.relative(ROOT, newestOut.path)} — run \`npm run dist\`.`,
  )
}

let installer = null
if (!unpackedOnly) {
  installer = await newestInstaller()
  if (!installer) {
    failures.push('No release\\Pulse-Launcher-*-x64.exe found — run `npm run dist`.')
  } else if (asar && installer.mtimeMs + TOLERANCE_MS < asar.mtimeMs) {
    failures.push(
      `Installer is ${age(installer.mtimeMs, asar.mtimeMs)} older than the packaged app — run \`npm run dist\`.`,
    )
  }
  if (installer && installer.mtimeMs + TOLERANCE_MS < newestOut?.mtimeMs) {
    notes.push(
      `Installer is ${age(installer.mtimeMs, newestOut.mtimeMs)} older than the build output.`,
    )
  }
}

console.log('Release freshness')
console.log(`  ${row('newest build output', newestOut)}`)
console.log(`  ${row('packaged app.asar', asar)}`)
if (!unpackedOnly) console.log(`  ${row('installer', installer)}`)
console.log('')

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`)
  process.exit(1)
}

for (const note of notes) console.warn(`WARN ${note}`)
console.log('OK   the packaged app is newer than the build output.')
process.exit(0)
