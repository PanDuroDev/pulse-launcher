import { createHash } from 'node:crypto'
import path from 'node:path'
import type { GameRecord, ManualGame } from '@shared/types'
import { accentFor } from '@shared/format'

export function manualGameId(executable: string): string {
  const normalized = path.resolve(executable).toLowerCase()
  return `manual-${createHash('sha1').update(normalized).digest('hex').slice(0, 16)}`
}

/** Images the launcher can serve as custom cover art. */
const ARTWORK_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif'])

/** Matches the download ceiling in the artwork service. */
export const MAX_ARTWORK_BYTES = 20 * 1024 * 1024

export function isArtworkExtension(target: string): boolean {
  return ARTWORK_EXTENSIONS.has(path.extname(target).toLowerCase())
}

export function manualGameFromExecutable(
  executable: string,
  addedAt = Date.now(),
): ManualGame | null {
  const extension = path.extname(executable).toLowerCase()
  if (extension !== '.exe' && extension !== '.lnk') return null

  const name = path.basename(executable, extension).trim()
  if (!name) return null

  return {
    id: manualGameId(executable),
    name,
    executable,
    addedAt,
  }
}

export function manualGameToRecord(game: ManualGame): GameRecord {
  const extension = path.extname(game.executable).toLowerCase()
  const executable = path.resolve(game.executable)
  return {
    id: game.id,
    source: 'manual',
    name: game.name,
    installed: true,
    addedAt: game.addedAt,
    accent: accentFor(game.id),
    manualArtwork: game.artwork,
    process:
      extension === '.exe'
        ? {
            executable,
            installDir: path.dirname(executable),
            names: [path.basename(executable)],
          }
        : undefined,
    launch:
      extension === '.lnk'
        ? {
            kind: 'shortcut',
            target: game.executable,
            workDir: path.dirname(game.executable),
          }
        : {
            kind: 'exe',
            target: game.executable,
            workDir: path.dirname(game.executable),
          },
  }
}
