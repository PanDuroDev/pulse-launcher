import type { MusicProvider } from '@shared/contracts/music'
import type { MusicSourceFilter } from '@/lib/music-queue'

export const PROVIDER_LABELS: Record<MusicProvider, string> = {
  itunes: 'iTunes',
  deezer: 'Deezer',
  audius: 'Audius',
  openverse: 'Openverse',
  archive: 'Archive',
  youtube: 'YouTube',
}

export const SOURCE_LABELS: Record<MusicSourceFilter, string> = {
  all: 'All',
  library: 'Library',
  online: 'Online',
  youtube: 'YouTube',
}
