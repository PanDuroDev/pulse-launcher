import type { GameRecord } from '@shared/types'
import { accentFor } from '@shared/format'

interface DemoEntry {
  appId: string
  name: string
  source: 'steam' | 'epic'
  sizeGb: number
}

const DEMO_ENTRIES: DemoEntry[] = [
  { appId: '1091500', name: 'Cyberpunk 2077', source: 'steam', sizeGb: 68.4 },
  { appId: '1245620', name: 'Elden Ring', source: 'steam', sizeGb: 49.2 },
  { appId: '1086940', name: "Baldur's Gate 3", source: 'steam', sizeGb: 121.7 },
  { appId: '1145360', name: 'Hades', source: 'steam', sizeGb: 15.1 },
  { appId: '1174180', name: 'Red Dead Redemption 2', source: 'steam', sizeGb: 115.3 },
  { appId: '1593500', name: 'God of War', source: 'steam', sizeGb: 66.8 },
  { appId: '1551360', name: 'Forza Horizon 5', source: 'steam', sizeGb: 103.4 },
  { appId: '367520', name: 'Hollow Knight', source: 'steam', sizeGb: 9.3 },
  { appId: '870780', name: 'Control Ultimate Edition', source: 'epic', sizeGb: 42.6 },
  { appId: '1426210', name: 'It Takes Two', source: 'epic', sizeGb: 43.8 },
  { appId: '1895880', name: 'Ratchet & Clank: Rift Apart', source: 'steam', sizeGb: 75.9 },
  { appId: '1817070', name: 'Marvel’s Spider-Man Remastered', source: 'steam', sizeGb: 72.1 },
  { appId: '2050650', name: 'Resident Evil 4', source: 'steam', sizeGb: 55.4 },
  { appId: '2358720', name: 'Black Myth: Wukong', source: 'steam', sizeGb: 124.2 },
]

const STEAM_CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps'

export function demoGames(): GameRecord[] {
  return DEMO_ENTRIES.map((entry, index) => {
    const id = `${entry.source}-${entry.appId}`
    const artCandidates = {
      cover: [
        `${STEAM_CDN}/${entry.appId}/library_600x900_2x.jpg`,
        `${STEAM_CDN}/${entry.appId}/library_600x900.jpg`,
      ],
      hero: [
        `${STEAM_CDN}/${entry.appId}/library_hero.jpg`,
        `${STEAM_CDN}/${entry.appId}/hero_capsule.jpg`,
      ],
      logo: [
        `${STEAM_CDN}/${entry.appId}/logo_2x.png`,
        `${STEAM_CDN}/${entry.appId}/logo.png`,
      ],
    }

    return {
      id,
      source: entry.source,
      name: entry.name,
      installed: true,
      appId: entry.appId,
      sizeBytes: Math.round(entry.sizeGb * 1024 ** 3),
      accent: accentFor(id),
      artCandidates,
      launch:
        entry.source === 'steam'
          ? { kind: 'steam', target: `steam://rungameid/${entry.appId}` }
          : {
              kind: 'epic',
              target: `com.epicgames.launcher://apps/demo%3Ademo%3A${entry.appId}?action=launch&silent=true`,
            },
      addedAt: Date.now() - index * 86_400_000,
    } satisfies GameRecord
  })
}

export function demoLastPlayed(gameId: string): number | undefined {
  const index = DEMO_ENTRIES.findIndex((entry) => gameId.endsWith(entry.appId))
  if (index < 0) return undefined
  return Date.now() - index * 7.5 * 3_600_000
}
