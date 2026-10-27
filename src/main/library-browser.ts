import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type {
  DirectoryListing,
  PickerEntry,
  PickerKind,
  PickerLocation,
} from '@shared/types'

/** A folder with thousands of entries is unusable on a TV; cap the listing. */
export const MAX_DIRECTORY_ENTRIES = 400

const GAME_EXTENSIONS = new Set(['.exe', '.lnk'])

/** Images the details page accepts as custom cover art. */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif'])

/** Noise that Windows keeps in otherwise useful folders. */
const IGNORED_NAMES = new Set(['System Volume Information', 'Config.Msi'])

export interface PlaceCandidate {
  id: string
  label: string
  path: string
}

function ignored(name: string): boolean {
  return name.startsWith('.') || name.startsWith('$') || IGNORED_NAMES.has(name)
}

/**
 * The picker only reads inside local drive paths. UNC shares, device paths and
 * relative paths are rejected before any filesystem call, so a renderer cannot
 * turn the browse channel into a probe for arbitrary namespaces.
 */
export function isBrowsablePath(target: string): boolean {
  if (!target || target.length > 1024 || target.includes('\0')) return false
  if (!path.isAbsolute(target)) return false
  if (process.platform !== 'win32') return true
  if (target.startsWith('\\\\') || target.startsWith('//')) return false
  return /^[a-zA-Z]:[\\/]/.test(target)
}

export function pathCrumbs(target: string): Array<{ name: string; path: string }> {
  const parsed = path.parse(target)
  const crumbs = [{ name: parsed.root.replace(/[\\/]+$/, ''), path: parsed.root }]
  const segments = target
    .slice(parsed.root.length)
    .split(/[\\/]+/)
    .filter(Boolean)
  let current = parsed.root
  for (const segment of segments) {
    current = path.join(current, segment)
    crumbs.push({ name: segment, path: current })
  }
  return crumbs
}

function listingError(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : ''
  if (code === 'ENOENT') return 'That folder is no longer available.'
  if (code === 'EACCES' || code === 'EPERM') {
    return 'Pulse cannot open that folder. Try a different location.'
  }
  if (code === 'ENOTDIR') return 'That path is not a folder.'
  return 'Could not read that folder.'
}

function compareEntries(left: PickerEntry, right: PickerEntry): number {
  if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

/**
 * Reads one folder for the in-app picker: subfolders plus the files the caller
 * is looking for (game executables/shortcuts, or images for custom artwork).
 * Nothing is executed or opened here; adding or editing stays a separate call.
 */
export async function listDirectory(
  target: string,
  kind: PickerKind = 'game',
): Promise<DirectoryListing> {
  if (!isBrowsablePath(target)) {
    return { ok: false, error: 'Choose a folder on a local drive.' }
  }

  const resolved = path.resolve(target)

  let info
  try {
    info = await stat(resolved)
  } catch (error) {
    return { ok: false, error: listingError(error) }
  }
  if (!info.isDirectory()) {
    return { ok: false, error: 'That path is not a folder.' }
  }

  let dirents
  try {
    dirents = await readdir(resolved, { withFileTypes: true })
  } catch (error) {
    return { ok: false, error: listingError(error) }
  }

  const entries: PickerEntry[] = []
  for (const dirent of dirents) {
    if (ignored(dirent.name)) continue
    const entryPath = path.join(resolved, dirent.name)
    if (dirent.isDirectory()) {
      entries.push({ name: dirent.name, path: entryPath, kind: 'directory' })
      continue
    }
    if (!dirent.isFile()) continue
    // Folder mode only wants directories — picking a music folder never needs files.
    if (kind === 'folder') continue
    const extension = path.extname(dirent.name).toLowerCase()
    const allowed = kind === 'image' ? IMAGE_EXTENSIONS : GAME_EXTENSIONS
    if (!allowed.has(extension)) continue
    entries.push({
      name: dirent.name,
      path: entryPath,
      kind: 'file',
      extension: extension.slice(1) as PickerEntry['extension'],
    })
  }

  entries.sort(compareEntries)
  const parentPath = path.dirname(resolved)
  const parent = parentPath === resolved ? null : parentPath

  return {
    ok: true,
    path: resolved,
    parent,
    crumbs: pathCrumbs(resolved),
    entries: entries.slice(0, MAX_DIRECTORY_ENTRIES),
    truncated: entries.length > MAX_DIRECTORY_ENTRIES,
  }
}

/** Fixed local drives, used as the top-level destinations in the picker. */
export async function listDrives(): Promise<string[]> {
  if (process.platform !== 'win32') return ['/']
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const roots = await Promise.all(
    letters.map(async (letter) => {
      const root = `${letter}:\\`
      try {
        const info = await stat(root)
        return info.isDirectory() ? root : null
      } catch {
        return null
      }
    }),
  )
  return roots.filter((root): root is string => Boolean(root))
}

/**
 * Keeps only shortcuts that exist on this machine, so the sidebar never offers
 * a dead location. Duplicate folders (Desktop inside Home, for example) are
 * kept on purpose: each is a distinct, recognisable destination.
 */
export async function resolvePlaces(
  candidates: PlaceCandidate[],
): Promise<PickerLocation[]> {
  const places: PickerLocation[] = []
  for (const candidate of candidates) {
    if (!isBrowsablePath(candidate.path)) continue
    try {
      const info = await stat(candidate.path)
      if (!info.isDirectory()) continue
    } catch {
      continue
    }
    places.push({
      id: candidate.id,
      label: candidate.label,
      path: path.resolve(candidate.path),
      kind: 'place',
    })
  }
  return places
}

export function driveLocations(drives: string[]): PickerLocation[] {
  return drives.map((drive) => ({
    id: `drive-${drive[0]?.toLowerCase() ?? 'x'}`,
    label: `Local disk (${drive.slice(0, 2).toUpperCase()})`,
    path: drive,
    kind: 'drive',
  }))
}
