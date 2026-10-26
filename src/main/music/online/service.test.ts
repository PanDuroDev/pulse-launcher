import { describe, expect, it } from 'vitest'
import { isPublicHttpsUrl } from './service'

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
