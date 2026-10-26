import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { GameRecord } from '@shared/types'
import { accentFor } from '@shared/format'
import { resolveResourcePath } from '../paths'
import { log } from '../logger'

const ShortcutSchema = z.object({
  name: z.string(),
  shortcut: z.string(),
  target: z.string().optional().default(''),
  args: z.string().optional().default(''),
  workdir: z.string().optional().default(''),
})

const ShortcutListSchema = z.union([
  ShortcutSchema,
  z.array(ShortcutSchema),
])

const EXCLUDED_NAMES =
  /uninstall|unins\d*|setup|updater|update|readme|crash|report|website|help|documentation/i

function runPowerShell(script: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        script,
      ],
      {
        windowsHide: true,
        timeout: 20_000,
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
        signal,
      },
      (error, stdout) => {
        if (error) {
          if (!signal?.aborted) {
            log.warn('[start-menu] PowerShell scan failed', error.message)
          }
          resolve('')
          return
        }
        resolve(stdout)
      },
    )
  })
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export interface StartMenuScanResult {
  games: GameRecord[]
  warnings: string[]
}

export async function scanStartMenu(signal?: AbortSignal): Promise<StartMenuScanResult> {
  signal?.throwIfAborted()
  const script = resolveResourcePath('resolve-shortcuts.ps1')
  if (!(await fileExists(script))) {
    return { games: [], warnings: ['Start Menu scan script is missing'] }
  }

  const output = (await runPowerShell(script, signal)).trim()
  signal?.throwIfAborted()
  if (!output) return { games: [], warnings: [] }

  let raw: unknown
  try {
    raw = JSON.parse(output)
  } catch (error) {
    log.warn('[start-menu] could not parse PowerShell output', error)
    return { games: [], warnings: ['Could not parse Start Menu shortcuts'] }
  }

  const parsed = ShortcutListSchema.safeParse(raw)
  if (!parsed.success) {
    return { games: [], warnings: ['Unexpected Start Menu shortcut data'] }
  }

  const shortcuts = Array.isArray(parsed.data) ? parsed.data : [parsed.data]
  const games: GameRecord[] = []
  const seen = new Set<string>()

  for (const shortcut of shortcuts) {
    signal?.throwIfAborted()
    if (!shortcut.target.toLowerCase().endsWith('.exe')) continue
    if (EXCLUDED_NAMES.test(shortcut.name)) continue
    if (!(await fileExists(shortcut.target))) continue

    const normalizedTarget = shortcut.target.toLowerCase()
    if (seen.has(normalizedTarget)) continue
    seen.add(normalizedTarget)

    const id = `start-menu-${createHash('sha1')
      .update(shortcut.shortcut.toLowerCase())
      .digest('hex')
      .slice(0, 16)}`
    const executable = path.resolve(shortcut.target)

    games.push({
      id,
      source: 'start-menu',
      name: shortcut.name,
      installed: true,
      accent: accentFor(id),
      process: {
        executable,
        installDir: path.dirname(executable),
        names: [path.basename(executable)],
      },
      launch: {
        kind: 'shortcut',
        target: shortcut.shortcut,
        workDir: shortcut.workdir || path.dirname(shortcut.target),
      },
    })
  }

  return { games, warnings: [] }
}
