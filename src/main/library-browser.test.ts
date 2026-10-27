import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  isBrowsablePath,
  listDirectory,
  pathCrumbs,
  resolvePlaces,
} from './library-browser'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'pulse-browser-'))
  await mkdir(path.join(root, 'Game Folder'))
  await mkdir(path.join(root, 'another folder'))
  await mkdir(path.join(root, '$Recycle.Bin'))
  await mkdir(path.join(root, '.hidden'))
  await writeFile(path.join(root, 'Alpha.exe'), '')
  await writeFile(path.join(root, 'beta.LNK'), '')
  await writeFile(path.join(root, 'notes.txt'), '')
  await writeFile(path.join(root, 'setup.msi'), '')
  await writeFile(path.join(root, 'cover.PNG'), '')
  await writeFile(path.join(root, 'photo.jpeg'), '')
  await writeFile(path.join(root, 'art.webp'), '')
  await writeFile(path.join(root, 'screenshot.gif'), '')
})

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true })
})

describe('isBrowsablePath', () => {
  it('accepts absolute drive paths', () => {
    expect(isBrowsablePath('C:\\Program Files')).toBe(true)
    expect(isBrowsablePath(root)).toBe(true)
  })

  it('rejects relative, empty and device paths', () => {
    expect(isBrowsablePath('')).toBe(false)
    expect(isBrowsablePath('Program Files')).toBe(false)
    expect(isBrowsablePath('.\\Games')).toBe(false)
    expect(isBrowsablePath('C:\\Games\0')).toBe(false)
  })

  it('rejects network and device namespaces on Windows', () => {
    if (process.platform !== 'win32') return
    expect(isBrowsablePath('\\\\server\\share')).toBe(false)
    expect(isBrowsablePath('\\\\?\\C:\\Games')).toBe(false)
    expect(isBrowsablePath('//server/share')).toBe(false)
  })
})

describe('listDirectory', () => {
  it('returns folders first, then only .exe/.lnk files', async () => {
    const listing = await listDirectory(root)
    expect(listing.ok).toBe(true)
    expect(listing.path).toBe(path.resolve(root))
    expect(listing.entries?.map((entry) => entry.name)).toEqual([
      'another folder',
      'Game Folder',
      'Alpha.exe',
      'beta.LNK',
    ])
    expect(listing.entries?.map((entry) => entry.kind)).toEqual([
      'directory',
      'directory',
      'file',
      'file',
    ])
    expect(listing.entries?.map((entry) => entry.extension)).toEqual([
      undefined,
      undefined,
      'exe',
      'lnk',
    ])
    expect(listing.truncated).toBe(false)
  })

  it('lists only image files when the picker is choosing artwork', async () => {
    const listing = await listDirectory(root, 'image')

    expect(listing.ok).toBe(true)
    expect(listing.entries?.map((entry) => entry.name)).toEqual([
      'another folder',
      'Game Folder',
      'art.webp',
      'cover.PNG',
      'photo.jpeg',
    ])
    expect(listing.entries?.map((entry) => entry.extension)).toEqual([
      undefined,
      undefined,
      'webp',
      'png',
      'jpeg',
    ])
  })

  it('lists only folders when the picker is choosing a music folder', async () => {
    const listing = await listDirectory(root, 'folder')

    expect(listing.ok).toBe(true)
    expect(listing.entries?.map((entry) => entry.name)).toEqual([
      'another folder',
      'Game Folder',
    ])
    expect(listing.entries?.every((entry) => entry.kind === 'directory')).toBe(true)
  })

  it('skips hidden and system-looking folders', async () => {
    const listing = await listDirectory(root)
    const names = listing.entries?.map((entry) => entry.name) ?? []
    expect(names).not.toContain('$Recycle.Bin')
    expect(names).not.toContain('.hidden')
  })

  it('reports the parent and breadcrumbs for the folder', async () => {
    const listing = await listDirectory(path.join(root, 'Game Folder'))
    expect(listing.ok).toBe(true)
    expect(listing.parent).toBe(path.resolve(root))
    expect(listing.crumbs?.at(-1)).toEqual({
      name: 'Game Folder',
      path: path.resolve(root, 'Game Folder'),
    })
    expect(listing.crumbs?.[0]?.path).toBe(path.parse(path.resolve(root)).root)
  })

  it('has no parent at a drive root', async () => {
    const drive = `${path.parse(path.resolve(root)).root}`
    const listing = await listDirectory(drive)
    expect(listing.ok).toBe(true)
    expect(listing.parent).toBeNull()
  })

  it('rejects a missing folder without throwing', async () => {
    const listing = await listDirectory(path.join(root, 'nope'))
    expect(listing).toEqual({ ok: false, error: 'That folder is no longer available.' })
  })

  it('rejects a file path', async () => {
    const listing = await listDirectory(path.join(root, 'Alpha.exe'))
    expect(listing).toEqual({ ok: false, error: 'That path is not a folder.' })
  })

  it('rejects a relative path before touching the filesystem', async () => {
    const listing = await listDirectory('Game Folder')
    expect(listing).toEqual({ ok: false, error: 'Choose a folder on a local drive.' })
  })

  it('does not read file contents, only names', async () => {
    const listing = await listDirectory(root)
    for (const entry of listing.entries ?? []) {
      expect(Object.keys(entry).sort()).toEqual(
        entry.kind === 'file'
          ? ['extension', 'kind', 'name', 'path']
          : ['kind', 'name', 'path'],
      )
    }
  })
})

describe('pathCrumbs', () => {
  it('starts at the drive root and ends at the folder', () => {
    const target = path.resolve('C:\\Program Files\\Steam')
    const crumbs = pathCrumbs(target)
    expect(crumbs[0]).toEqual({ name: 'C:', path: 'C:\\' })
    expect(crumbs.map((crumb) => crumb.name)).toEqual([
      'C:',
      'Program Files',
      'Steam',
    ])
    expect(crumbs.at(-1)?.path).toBe(target)
  })

  it('keeps a drive root as a single crumb', () => {
    const crumbs = pathCrumbs('C:\\')
    expect(crumbs).toHaveLength(1)
    expect(crumbs[0]).toEqual({ name: 'C:', path: 'C:\\' })
  })
})

describe('resolvePlaces', () => {
  it('keeps only existing folders and resolves their paths', async () => {
    const places = await resolvePlaces([
      { id: 'root', label: 'Root', path: root },
      { id: 'missing', label: 'Missing', path: path.join(root, 'missing') },
      { id: 'file', label: 'File', path: path.join(root, 'Alpha.exe') },
      { id: 'relative', label: 'Relative', path: 'Games' },
    ])
    expect(places).toEqual([
      { id: 'root', label: 'Root', path: path.resolve(root), kind: 'place' },
    ])
  })
})
