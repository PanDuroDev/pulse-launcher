import { execFile } from 'node:child_process'
import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { GameRecord } from '@shared/types'
import { accentFor } from '@shared/format'
import { getVdfObject, getVdfString, parseVdf } from './vdf'
import { log } from '../logger'

const EXCLUDED_APP_IDS = new Set(['228980'])
const EXCLUDED_NAMES =
  /steamworks common redistributables|steam linux runtime|proton|steamvr|steam audio/i

export interface SteamScanResult {
  games: GameRecord[]
  steamRoot: string | null
  warnings: string[]
}

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        windowsHide: true,
        timeout: 5_000,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      },
      (error, stdout) => {
        resolve(error ? '' : stdout)
      },
    )
  })
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function registrySteamPath(): Promise<string | null> {
  const queries: Array<[string, string]> = [
    ['HKCU\\Software\\Valve\\Steam', 'SteamPath'],
    ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'],
    ['HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath'],
  ]

  for (const [key, value] of queries) {
    const output = await run('reg.exe', ['query', key, '/v', value])
    const match = output.match(new RegExp(`${value}\\s+REG_SZ\\s+(.+)`))
    const candidate = match?.[1]?.trim()
    if (candidate && (await isFile(path.join(candidate, 'steam.exe')))) {
      return candidate
    }
  }

  return null
}

export async function findSteamRoot(): Promise<string | null> {
  const fromRegistry = await registrySteamPath()
  if (fromRegistry) return fromRegistry

  const candidates = [
    process.env['ProgramFiles(x86)']
      ? path.join(process.env['ProgramFiles(x86)'], 'Steam')
      : null,
    process.env['ProgramFiles'] ? path.join(process.env['ProgramFiles'], 'Steam') : null,
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    if (await isFile(path.join(candidate, 'steam.exe'))) return candidate
  }

  return null
}

export async function readSteamLibraries(steamRoot: string): Promise<string[]> {
  const libraries = new Set<string>([steamRoot])
  const libraryFile = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf')

  try {
    const parsed = parseVdf(await readFile(libraryFile, 'utf8'))
    const folders = getVdfObject(parsed, 'libraryfolders')
    if (folders) {
      for (const value of Object.values(folders)) {
        if (typeof value !== 'object') continue
        const libraryPath = getVdfString(value, 'path')
        if (libraryPath) libraries.add(libraryPath)
      }
    }
  } catch (error) {
    log.warn('[steam] could not read libraryfolders.vdf', error)
  }

  return [...libraries]
}

export async function parseSteamManifest(
  content: string,
  libraryRoot?: string,
): Promise<GameRecord | null> {
  const parsed = parseVdf(content)
  const state = getVdfObject(parsed, 'AppState')
  if (!state) return null

  const appId = getVdfString(state, 'appid')
  const name = getVdfString(state, 'name')
  const installDir = getVdfString(state, 'installdir')
  if (!appId || !name || !installDir) return null
  if (EXCLUDED_APP_IDS.has(appId) || EXCLUDED_NAMES.test(name)) return null
  if (!/^\d+$/.test(appId)) return null

  const stateFlags = Number(getVdfString(state, 'StateFlags') ?? '0')
  if (stateFlags > 0 && (stateFlags & 4) === 0) return null

  const sizeOnDisk = Number(getVdfString(state, 'SizeOnDisk') ?? '0')
  const process = libraryRoot
    ? { installDir: path.join(libraryRoot, 'steamapps', 'common', installDir) }
    : undefined

  return {
    id: `steam-${appId}`,
    source: 'steam',
    name,
    installed: true,
    appId,
    sizeBytes: Number.isFinite(sizeOnDisk) && sizeOnDisk > 0 ? sizeOnDisk : undefined,
    accent: accentFor(`steam-${appId}`),
    process,
    launch: {
      kind: 'steam',
      target: `steam://rungameid/${appId}`,
    },
  }
}

export async function scanSteam(signal?: AbortSignal): Promise<SteamScanResult> {
  const warnings: string[] = []
  signal?.throwIfAborted()
  const steamRoot = await findSteamRoot()
  if (!steamRoot) {
    return { games: [], steamRoot: null, warnings: ['Steam install path not found'] }
  }

  signal?.throwIfAborted()
  const libraries = await readSteamLibraries(steamRoot)
  const games: GameRecord[] = []
  const seen = new Set<string>()

  for (const library of libraries) {
    signal?.throwIfAborted()
    const steamapps = path.join(library, 'steamapps')
    let files: string[]
    try {
      files = await readdir(steamapps)
    } catch {
      continue
    }

    for (const file of files) {
      signal?.throwIfAborted()
      if (!/^appmanifest_\d+\.acf$/i.test(file)) continue
      try {
        const manifest = await readFile(path.join(steamapps, file), {
          encoding: 'utf8',
          signal,
        })
        const game = await parseSteamManifest(manifest, library)
        if (game && !seen.has(game.id)) {
          seen.add(game.id)
          games.push(game)
        }
      } catch (error) {
        signal?.throwIfAborted()
        warnings.push(`Failed to read ${file}`)
        log.warn('[steam] failed to read manifest', file, error)
      }
    }
  }

  return { games, steamRoot, warnings }
}
