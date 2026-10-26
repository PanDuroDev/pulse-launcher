import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { epicLaunchUri, parseEpicManifest } from './epic'

vi.mock('../logger', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

function manifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    AppName: 'Sugar',
    DisplayName: 'Rocket League',
    InstallLocation: 'C:\\Games\\RocketLeague',
    LaunchExecutable: 'Binaries\\Win64\\RocketLeague.exe',
    CatalogNamespace: '9773aa1aa54f4f7b80e44bef04986cea',
    CatalogItemId: '530145df28a24424923f5828cc9031a1',
    bIsIncompleteInstall: false,
    bIsApplication: true,
    InstallSize: 44257924504,
    ...overrides,
  })
}

describe('epicLaunchUri', () => {
  it('encodes each manifest identifier', () => {
    expect(epicLaunchUri('a b', 'c:d', 'e/f')).toBe(
      'com.epicgames.launcher://apps/a%20b%3Ac%3Ad%3Ae%2Ff?action=launch&silent=true',
    )
  })
})

describe('parseEpicManifest', () => {
  it('prefers a validated Epic launch URI', () => {
    const game = parseEpicManifest(manifest())

    expect(game).toMatchObject({
      id: 'epic-Sugar',
      source: 'epic',
      name: 'Rocket League',
      installed: true,
      sizeBytes: 44257924504,
      process: {
        executable: path.join(
          'C:\\Games\\RocketLeague',
          'Binaries\\Win64\\RocketLeague.exe',
        ),
        installDir: 'C:\\Games\\RocketLeague',
        names: ['RocketLeague.exe'],
      },
      launch: {
        kind: 'epic',
        target:
          'com.epicgames.launcher://apps/9773aa1aa54f4f7b80e44bef04986cea%3A530145df28a24424923f5828cc9031a1%3ASugar?action=launch&silent=true',
      },
    })
  })

  it('falls back to a direct executable when catalog identifiers are missing', () => {
    const game = parseEpicManifest(
      manifest({ CatalogNamespace: undefined, CatalogItemId: undefined }),
    )

    expect(game?.launch).toEqual({
      kind: 'exe',
      target: path.join('C:\\Games\\RocketLeague', 'Binaries\\Win64\\RocketLeague.exe'),
      workDir: 'C:\\Games\\RocketLeague',
    })
  })

  it('keeps HTTPS vault artwork only', () => {
    expect(
      parseEpicManifest(manifest({ VaultThumbnailUrl: 'https://cdn.example/cover.jpg' }))
        ?.artCandidates,
    ).toEqual({ cover: ['https://cdn.example/cover.jpg'] })

    expect(
      parseEpicManifest(manifest({ VaultThumbnailUrl: 'http://cdn.example/cover.jpg' }))
        ?.artCandidates,
    ).toBeUndefined()
  })

  it('rejects invalid, excluded, and incomplete entries', () => {
    expect(parseEpicManifest('{')).toBeNull()
    expect(parseEpicManifest(manifest({ bIsIncompleteInstall: true }))).toBeNull()
    expect(parseEpicManifest(manifest({ bIsApplication: false }))).toBeNull()
    expect(parseEpicManifest(manifest({ DisplayName: 'Unreal Engine' }))).toBeNull()
    expect(parseEpicManifest(manifest({ AppName: undefined }))).toBeNull()
    expect(parseEpicManifest(manifest({ DisplayName: undefined }))).toBeNull()
    expect(
      parseEpicManifest(
        manifest({
          CatalogNamespace: undefined,
          CatalogItemId: undefined,
          InstallLocation: undefined,
        }),
      ),
    ).toBeNull()
  })
})
