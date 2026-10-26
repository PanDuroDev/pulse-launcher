import { describe, expect, it } from 'vitest'
import {
  formatOpenverseLicense,
  mapArchiveEntry,
  mapAudiusRow,
  mapDeezerRow,
  mapItunesRow,
  mapOpenverseRow,
  parseArchiveDuration,
} from './providers'

describe('iTunes adapter', () => {
  it('maps a preview, duration, and larger artwork', () => {
    const track = mapItunesRow({
      trackId: 42,
      trackName: 'Numb',
      artistName: 'Linkin Park',
      collectionName: 'Meteora',
      trackTimeMillis: 185_000,
      previewUrl: 'https://audio-ssl.itunes.apple.com/preview.m4a',
      artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/cover/100x100bb.jpg',
      trackViewUrl: 'https://music.apple.com/song/42',
    })
    expect(track).toMatchObject({
      id: 'itunes:42',
      provider: 'itunes',
      title: 'Numb',
      artist: 'Linkin Park',
      album: 'Meteora',
      durationMs: 185_000,
      publisher: 'Apple Music',
      streamKind: 'preview',
    })
    expect(track?.remoteArtworkUrl).toContain('/600x600bb.jpg')
  })

  it('drops rows without an HTTPS preview', () => {
    expect(mapItunesRow({ trackName: 'Numb', artistName: 'Linkin Park' })).toBeNull()
    expect(
      mapItunesRow({
        trackName: 'Numb',
        artistName: 'Linkin Park',
        previewUrl: 'http://example.com/preview.m4a',
      }),
    ).toBeNull()
  })
})

describe('Deezer adapter', () => {
  it('converts seconds to milliseconds and prefers the largest cover', () => {
    const track = mapDeezerRow({
      id: 7,
      title: 'Numb',
      duration: 185,
      preview: 'https://cdns-preview.dzcdn.net/preview.mp3',
      link: 'https://www.deezer.com/track/7',
      artist: { name: 'Linkin Park' },
      album: {
        title: 'Meteora',
        cover_medium: 'https://e-cdns-images.dzcdn.net/medium.jpg',
        cover_xl: 'https://e-cdns-images.dzcdn.net/xl.jpg',
      },
    })
    expect(track).toMatchObject({
      id: 'deezer:7',
      provider: 'deezer',
      durationMs: 185_000,
      publisher: 'Deezer',
      streamKind: 'preview',
      remoteArtworkUrl: 'https://e-cdns-images.dzcdn.net/xl.jpg',
    })
  })

  it('drops a row when the preview is missing', () => {
    expect(mapDeezerRow({ id: 7, title: 'Numb', duration: 185 })).toBeNull()
  })
})

describe('Audius adapter', () => {
  it('maps a full stream and permalink', () => {
    const track = mapAudiusRow({
      id: 'abc',
      title: 'Numb',
      duration: 186,
      permalink: '/linkinpark/numb',
      user: { name: 'Linkin Park' },
      artwork: { '480x480': 'https://creatornode.audius.co/480.jpg' },
    })
    expect(track).toMatchObject({
      id: 'audius:abc',
      provider: 'audius',
      artist: 'Linkin Park',
      durationMs: 186_000,
      streamKind: 'full',
      sourceUrl: 'https://audius.co/linkinpark/numb',
    })
    expect(track?.remoteStreamUrl).toContain('/v1/tracks/abc/stream')
  })
})

describe('Openverse adapter', () => {
  it('formats Creative Commons licenses', () => {
    expect(formatOpenverseLicense('by', '4.0')).toBe('CC BY 4.0')
    expect(formatOpenverseLicense('cc0', '1.0')).toBe('CC0 1.0')
    expect(formatOpenverseLicense('', '')).toBeNull()
  })

  it('keeps the license and source publisher', () => {
    const track = mapOpenverseRow({
      id: 'ov-1',
      title: 'Numb',
      creator: 'Linkin Park',
      duration: 186_000,
      url: 'https://cdn.openverse.org/numb.mp3',
      license: 'by',
      license_version: '4.0',
      foreign_landing_url: 'https://openverse.org/audio/ov-1',
      provider: 'Jamendo',
    })
    expect(track).toMatchObject({
      provider: 'openverse',
      publisher: 'Jamendo',
      license: 'CC BY 4.0',
      streamKind: 'full',
      sourceUrl: 'https://openverse.org/audio/ov-1',
    })
  })
})

describe('Internet Archive adapter', () => {
  it('parses seconds and colon durations', () => {
    expect(parseArchiveDuration(245.12)).toBe(245_120)
    expect(parseArchiveDuration('245.12')).toBe(245_120)
    expect(parseArchiveDuration('4:05')).toBe(245_000)
    expect(parseArchiveDuration('1:02:03')).toBe(3_723_000)
    expect(parseArchiveDuration('0:30')).toBe(30_000)
    expect(parseArchiveDuration('nope')).toBe(0)
    expect(parseArchiveDuration(undefined)).toBe(0)
  })

  it('chooses the best audio file and builds encoded URLs', () => {
    const track = mapArchiveEntry(
      { identifier: 'item 1', title: 'Meteora' },
      {
        metadata: { title: 'Meteora', creator: 'Linkin Park' },
        files: [
          { name: '__ia_thumb.jpg', format: 'JPEG' },
          { name: 'song.flac', format: 'FLAC', length: '185.2' },
          {
            name: 'song.mp3',
            format: 'VBR MP3',
            length: '3:05',
            title: 'Numb',
            artist: 'Linkin Park',
          },
        ],
      },
    )
    expect(track).toMatchObject({
      provider: 'archive',
      title: 'Numb',
      artist: 'Linkin Park',
      album: 'Meteora',
      durationMs: 185_000,
      publisher: 'Internet Archive',
      streamKind: 'full',
    })
    expect(track?.remoteStreamUrl).toBe(
      'https://archive.org/download/item%201/song.mp3',
    )
    expect(track?.remoteArtworkUrl).toBe('https://archive.org/services/img/item%201')
  })

  it('drops private files and items without audio', () => {
    expect(
      mapArchiveEntry(
        { identifier: 'item' },
        { files: [{ name: 'song.mp3', format: 'MP3', private: 'true' }] },
      ),
    ).toBeNull()
    expect(mapArchiveEntry({ identifier: 'item' }, { files: [] })).toBeNull()
    expect(mapArchiveEntry({}, { files: [] })).toBeNull()
  })
})
