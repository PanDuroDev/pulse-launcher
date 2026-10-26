import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  accentFor,
  formatBytes,
  formatLastPlayed,
  hashString,
  sourceLabel,
} from './format'

describe('sourceLabel', () => {
  it('maps known sources to display names', () => {
    expect(sourceLabel('steam')).toBe('Steam')
    expect(sourceLabel('epic')).toBe('Epic Games')
    expect(sourceLabel('manual')).toBe('Local')
    expect(sourceLabel('start-menu')).toBe('Desktop')
  })

  it('falls back for unknown sources', () => {
    expect(sourceLabel('other')).toBe('Game')
  })
})

describe('formatBytes', () => {
  it('returns null for missing or zero values', () => {
    expect(formatBytes(undefined)).toBeNull()
    expect(formatBytes(0)).toBeNull()
    expect(formatBytes(-1)).toBeNull()
  })

  it('formats byte, kilobyte, and gigabyte values', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(100 * 1024 * 1024)).toBe('100 MB')
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.5 GB')
  })
})

describe('formatLastPlayed', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats recent timestamps', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-23T12:00:00Z'))

    expect(formatLastPlayed(Date.now() - 20_000)).toBe('Just now')
    expect(formatLastPlayed(Date.now() - 12 * 60_000)).toBe('12m ago')
    expect(formatLastPlayed(Date.now() - 3 * 3_600_000)).toBe('3h ago')
    expect(formatLastPlayed(Date.now() - 2 * 86_400_000)).toBe('2d ago')
  })

  it('returns null without a timestamp', () => {
    expect(formatLastPlayed(undefined)).toBeNull()
  })
})

describe('accentFor', () => {
  it('produces stable HSL accents', () => {
    expect(hashString('steam-730')).toBe(hashString('steam-730'))
    expect(accentFor('steam-730')).toMatch(/^\d{1,3} 78% 58%$/)
    expect(accentFor('steam-730')).not.toBe(accentFor('steam-731'))
  })
})
