import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { GameRecord } from '@shared/types'
import { accentFor } from '@shared/format'
import { log } from '../logger'

const EpicManifestSchema = z
  .object({
    AppName: z.string().optional(),
    DisplayName: z.string().optional(),
    InstallLocation: z.string().optional(),
    LaunchExecutable: z.string().optional(),
    CatalogNamespace: z.string().optional(),
    CatalogItemId: z.string().optional(),
    bIsIncompleteInstall: z.boolean().optional(),
    bIsApplication: z.boolean().optional(),
    bIsExecutable: z.boolean().optional(),
    InstallSize: z.number().optional(),
    VaultThumbnailUrl: z.string().optional(),
  })
  .passthrough()

export interface EpicScanResult {
  games: GameRecord[]
  manifestDirectory: string | null
  warnings: string[]
}

const EXCLUDED_NAMES =
  /unreal engine|epic games launcher|epic online services|rad debugger/i

export function epicLaunchUri(
  namespace: string,
  catalogItemId: string,
  appName: string,
): string {
  const encoded = [namespace, catalogItemId, appName]
    .map((part) => encodeURIComponent(part))
    .join('%3A')
  return `com.epicgames.launcher://apps/${encoded}?action=launch&silent=true`
}

export function parseEpicManifest(content: string): GameRecord | null {
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch {
    return null
  }

  const parsed = EpicManifestSchema.safeParse(raw)
  if (!parsed.success) return null
  const data = parsed.data

  if (data.bIsIncompleteInstall === true) return null
  if (data.bIsApplication === false) return null
  if (!data.AppName || !data.DisplayName) return null
  if (EXCLUDED_NAMES.test(data.DisplayName)) return null

  const hasLaunchUri = Boolean(
    data.CatalogNamespace && data.CatalogItemId && data.AppName,
  )
  const executable =
    data.InstallLocation && data.LaunchExecutable
      ? path.join(data.InstallLocation, data.LaunchExecutable)
      : null

  if (!hasLaunchUri && !executable) return null

  const artCandidates = data.VaultThumbnailUrl?.startsWith('https://')
    ? { cover: [data.VaultThumbnailUrl] }
    : undefined
  const processHints = executable
    ? {
        executable,
        installDir: data.InstallLocation,
        names: [path.basename(executable)],
      }
    : undefined

  return {
    id: `epic-${data.AppName}`,
    source: 'epic',
    name: data.DisplayName,
    installed: true,
    sizeBytes: data.InstallSize && data.InstallSize > 0 ? data.InstallSize : undefined,
    accent: accentFor(`epic-${data.AppName}`),
    process: processHints,
    artCandidates,
    launch: hasLaunchUri
      ? {
          kind: 'epic',
          target: epicLaunchUri(
            data.CatalogNamespace!,
            data.CatalogItemId!,
            data.AppName,
          ),
        }
      : {
          kind: 'exe',
          target: executable!,
          workDir: data.InstallLocation,
        },
  }
}

function defaultManifestDirectory(): string {
  return path.join(
    process.env['ProgramData'] ?? 'C:\\ProgramData',
    'Epic',
    'EpicGamesLauncher',
    'Data',
    'Manifests',
  )
}

async function directoryExists(directory: string): Promise<boolean> {
  try {
    await access(directory)
    return true
  } catch {
    return false
  }
}

export async function scanEpic(signal?: AbortSignal): Promise<EpicScanResult> {
  signal?.throwIfAborted()
  const manifestDirectory = defaultManifestDirectory()
  const warnings: string[] = []

  if (!(await directoryExists(manifestDirectory))) {
    return { games: [], manifestDirectory: null, warnings: ['Epic manifest directory not found'] }
  }

  signal?.throwIfAborted()
  let files: string[]
  try {
    files = await readdir(manifestDirectory)
  } catch {
    return {
      games: [],
      manifestDirectory,
      warnings: ['Could not read Epic manifest directory'],
    }
  }

  const games: GameRecord[] = []
  for (const file of files) {
    signal?.throwIfAborted()
    if (!file.toLowerCase().endsWith('.item')) continue
    try {
      const content = await readFile(path.join(manifestDirectory, file), {
        encoding: 'utf8',
        signal,
      })
      const game = parseEpicManifest(content)
      if (game) games.push(game)
    } catch (error) {
      signal?.throwIfAborted()
      warnings.push(`Failed to read ${file}`)
      log.warn('[epic] failed to read manifest', file, error)
    }
  }

  return { games, manifestDirectory, warnings }
}
