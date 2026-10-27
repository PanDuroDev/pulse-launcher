// Design census: counts the visual vocabulary in the launcher and fails when it
// grows past docs/design/03-type-and-spacing.md. Static only: it reads source
// text, so it cannot measure a real element box (see §3.1.1 of the plan).
//
// Warn mode is the default so early phases are not blocked; P6 flips the
// package script to --strict for CI.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = 'src/renderer/src'
const SKIP = new Set(['bloub', 'ui'])
const SOURCE = /\.(tsx?|css)$/

export const LIMITS = {
  fontSizes: 6, // --text-* roles
  radii: 4, // full, control, card, none
  durations: 2, // --duration-focus, --duration-panel
  blurs: 1,
  rows: 3,
  tools: 4,
  hints: 3,
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      if (!SKIP.has(name)) walk(full, out)
    } else if (SOURCE.test(name)) {
      out.push(full)
    }
  }
  return out
}

const collect = (files, pattern, allowed) => {
  const found = new Map()
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      for (const match of line.matchAll(pattern)) {
        const token = match[0]
        if (allowed(token)) {
          const key = `${path.relative(process.cwd(), file)}:${index + 1}`
          if (!found.has(token)) found.set(token, [])
          found.get(token).push(key)
        }
      }
    })
  }
  return found
}

// Only literal sizes are violations; the named roles are the sanctioned path.
const fontSize = /text-\[(\d+(?:\.\d+)?(?:px|rem))\]/g
const radius = /\brounded-\[[^\]]+\]/g
const duration = /\bduration-\d+\b/g
const blur = /\bbackdrop-blur-\d?[a-z]*\b/g
const glow = /0 0 \d+px/g
const viewportGutter = /px-\[[^\]]*vw\]/g

const rules = [
  ['أحجام خطوط مخصّصة', fontSize, LIMITS.fontSizes, (t) => t !== 'text-[14px]'],
  ['أنصاف أقطار مخصّصة', radius, LIMITS.radii, () => true],
  ['مدد حركة', duration, LIMITS.durations, (t) => t !== 'duration-0'],
  ['شدات ضباب', blur, LIMITS.blurs, () => true],
  ['توهّجات', glow, 0, () => true],
  ['هوامش نسبية للعرض', viewportGutter, 0, () => true],
]

export function census(root = ROOT) {
  const files = walk(root)
  const results = []
  for (const [label, pattern, limit, allowed] of rules) {
    const hits = collect(files, pattern, allowed)
    results.push({ label, limit, count: hits.size, tokens: [...hits.keys()].sort() })
  }
  return results
}

const strict = process.argv.includes('--strict')
const results = census()
let failed = false
for (const { label, limit, count, tokens } of results) {
  const over = count > limit
  if (over) failed = true
  console.log(`${over ? '✗' : '✓'} ${label}: ${count}/${limit}${tokens.length ? ` → ${tokens.join(', ')}` : ''}`)
}
console.log(strict ? '\nstrict mode' : '\nwarn mode (exit 0)')
process.exit(strict && failed ? 1 : 0)
