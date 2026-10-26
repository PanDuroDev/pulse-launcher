import { describe, expect, it } from 'vitest'
import { ytDlpError } from './ytdlp'

/**
 * yt-dlp prints the user-facing reason on an `ERROR:` line. These cases are the
 * ones users actually hit, and each must map to a short actionable sentence.
 */
describe('yt-dlp error mapping', () => {
  it('explains an unavailable video', () => {
    expect(ytDlpError('[youtube] aaaaaaaaaaa: ERROR: Video unavailable', 'fallback')).toBe(
      'This video is unavailable on YouTube.',
    )
    expect(ytDlpError('ERROR: This video is unavailable', 'fallback')).toBe(
      'This video is unavailable on YouTube.',
    )
  })

  it('explains private and age-restricted videos', () => {
    expect(ytDlpError('ERROR: Private video. Sign in if you have access', 'fallback')).toBe(
      'This video is private.',
    )
    expect(
      ytDlpError('ERROR: Sign in to confirm your age. This video may be inappropriate', 'fallback'),
    ).toBe('This video is age-restricted and cannot be extracted without an account.')
  })

  it('explains a bot check without blaming the user', () => {
    expect(
      ytDlpError('ERROR: Sign in to confirm you are not a bot. Use --cookies', 'fallback'),
    ).toContain('sign in')
  })

  it('explains a broken FFmpeg path', () => {
    expect(
      ytDlpError('ERROR: ffmpeg not found. Please install or provide the path', 'fallback'),
    ).toBe('FFmpeg could not be started. Check the FFmpeg path in YouTube setup.')
  })

  it('explains a missing audio format', () => {
    expect(
      ytDlpError('ERROR: Requested format is not available', 'fallback'),
    ).toBe('YouTube did not offer an audio format that yt-dlp can extract.')
  })

  it('uses the last ERROR line and falls back when there is none', () => {
    expect(ytDlpError('WARNING: nothing\nERROR: Video unavailable\n', 'fallback')).toBe(
      'This video is unavailable on YouTube.',
    )
    expect(ytDlpError('WARNING: nothing useful', 'fallback')).toBe('fallback')
    expect(ytDlpError('', 'fallback')).toBe('fallback')
  })

  it('never leaks a key from an unrelated message', () => {
    const key = ['AIza', 'SyTestKeyValue1234567890'].join('')
    const message = ytDlpError(`ERROR: download failed for key=${key}`, 'fallback')
    expect(message).not.toContain(key)
    expect(message).toContain('[redacted]')
  })
})
