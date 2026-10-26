import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parseSteamManifest } from './steam'

vi.mock('../logger', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

function manifest(overrides: Record<string, string> = {}): string {
  const state: Record<string, string> = {
    appid: '730',
    name: 'Counter-Strike 2',
    installdir: 'Counter-Strike Global Offensive',
    StateFlags: '4',
    SizeOnDisk: '76027351245',
    ...overrides,
  }

  return `"AppState"\n{\n${Object.entries(state)
    .map(([key, value]) => `  "${key}" "${value}"`)
    .join('\n')}\n}\n`
}

describe('parseSteamManifest', () => {
  it('builds a launchable record from an installed manifest', async () => {
    const game = await parseSteamManifest(manifest())

    expect(game).toMatchObject({
      id: 'steam-730',
      source: 'steam',
      name: 'Counter-Strike 2',
      installed: true,
      appId: '730',
      sizeBytes: 76027351245,
      launch: {
        kind: 'steam',
        target: 'steam://rungameid/730',
      },
    })
  })

  it('rejects incomplete manifests', async () => {
    expect(await parseSteamManifest('not a manifest')).toBeNull()
    expect(await parseSteamManifest(manifest({ appid: '' }))).toBeNull()
    expect(await parseSteamManifest(manifest({ name: '' }))).toBeNull()
    expect(await parseSteamManifest(manifest({ installdir: '' }))).toBeNull()
    expect(await parseSteamManifest(manifest({ appid: '730x' }))).toBeNull()
  })

  it('rejects redistributables and games that are not fully installed', async () => {
    expect(await parseSteamManifest(manifest({ appid: '228980' }))).toBeNull()
    expect(await parseSteamManifest(manifest({ name: 'Steamworks Common Redistributables' }))).toBeNull()
    expect(await parseSteamManifest(manifest({ StateFlags: '2' }))).toBeNull()
  })

  it('accepts manifests without a state flag or size', async () => {
    const game = await parseSteamManifest(manifest({ StateFlags: '0', SizeOnDisk: '0' }))

    expect(game?.sizeBytes).toBeUndefined()
  })

  it('records the install directory when a library root is available', async () => {
    const game = await parseSteamManifest(
      manifest(),
      'D:\\SteamLibrary',
    )

    expect(game?.process).toEqual({
      installDir: path.join(
        'D:\\SteamLibrary',
        'steamapps',
        'common',
        'Counter-Strike Global Offensive',
      ),
    })
  })
})
