import { describe, expect, it } from 'vitest'
import type { MusicOnlineProviderStatus } from '@shared/types'
import { isPublicHttpsUrl, providerWarning } from './service'

describe('online URL validation', () => {
  it('accepts public HTTPS hosts', () => {
    expect(isPublicHttpsUrl('https://is1-ssl.mzstatic.com/cover.jpg')).toBe(true)
    expect(isPublicHttpsUrl('https://archive.org/download/item/song.mp3')).toBe(true)
  })

  it('rejects plain HTTP', () => {
    expect(isPublicHttpsUrl('http://archive.org/song.mp3')).toBe(false)
    expect(isPublicHttpsUrl('ftp://archive.org/song.mp3')).toBe(false)
  })

  it('rejects localhost, private names, and IP literals', () => {
    expect(isPublicHttpsUrl('https://localhost/audio.mp3')).toBe(false)
    expect(isPublicHttpsUrl('https://printer.local/audio.mp3')).toBe(false)
    expect(isPublicHttpsUrl('https://service.internal/audio.mp3')).toBe(false)
    expect(isPublicHttpsUrl('https://127.0.0.1/audio.mp3')).toBe(false)
    expect(isPublicHttpsUrl('https://169.254.169.254/latest/meta-data')).toBe(false)
    expect(isPublicHttpsUrl('https://[::1]/audio.mp3')).toBe(false)
    expect(isPublicHttpsUrl('https://intranet/audio.mp3')).toBe(false)
  })

  it('rejects malformed URLs', () => {
    expect(isPublicHttpsUrl('not a url')).toBe(false)
    expect(isPublicHttpsUrl('')).toBe(false)
  })
})

function status(
  provider: MusicOnlineProviderStatus['provider'],
  ok: boolean,
  count = 0,
): MusicOnlineProviderStatus {
  return { provider, ok, count, error: ok ? null : 'The catalog timed out.' }
}

describe('providerWarning', () => {
  it('stays silent when every catalog answered', () => {
    expect(providerWarning([status('itunes', true, 3), status('deezer', true, 2)])).toBeNull()
  })

  it('names a single failing catalog', () => {
    expect(providerWarning([status('itunes', false), status('deezer', true, 2)])).toBe(
      'iTunes did not respond; showing the other catalogs.',
    )
  })

  it('joins several failures readably', () => {
    expect(
      providerWarning([
        status('itunes', false),
        status('deezer', false),
        status('audius', true, 4),
      ]),
    ).toBe('iTunes and Deezer did not respond; showing the other catalogs.')
  })
  it('uses the full product name for the archive catalog', () => {
    expect(providerWarning([status('archive', false)])).toBe(
      'Internet Archive did not respond; showing the other catalogs.',
    )
  })
})
