import { describe, expect, it } from 'vitest'
import { mapApiItems } from './api'

describe('YouTube API mapping', () => {
  it('joins search snippets to duration details and preserves order', () => {
    const candidates = mapApiItems(
      [
        {
          id: { videoId: 'dQw4w9WgXcQ' },
          snippet: {
            title: 'Rick Astley - Never Gonna Give You Up (Official Video)',
            channelTitle: 'Rick Astley',
            liveBroadcastContent: 'none',
          },
        },
        {
          id: { videoId: '9bZkp7q19f0' },
          snippet: {
            title: 'PSY - GANGNAM STYLE (Official Video)',
            channelTitle: 'officialpsy',
            liveBroadcastContent: 'none',
          },
        },
      ],
      [
        {
          id: 'dQw4w9WgXcQ',
          contentDetails: { duration: 'PT3M33S' },
          snippet: {
            title: 'Rick Astley - Never Gonna Give You Up (Official Video)',
            channelTitle: 'Rick Astley',
          },
        },
        {
          id: '9bZkp7q19f0',
          contentDetails: { duration: 'PT4M12S' },
          snippet: {
            title: 'PSY - GANGNAM STYLE (Official Video)',
            channelTitle: 'officialpsy',
          },
        },
      ],
    )

    expect(candidates.map((item) => item.videoId)).toEqual([
      'dQw4w9WgXcQ',
      '9bZkp7q19f0',
    ])
    expect(candidates[0]).toMatchObject({
      title: 'Never Gonna Give You Up',
      videoTitle: 'Rick Astley - Never Gonna Give You Up (Official Video)',
      artist: 'Rick Astley',
      channel: 'Rick Astley',
      durationMs: 213_000,
    })
    expect(candidates[1]).toMatchObject({
      title: 'GANGNAM STYLE',
      videoTitle: 'PSY - GANGNAM STYLE (Official Video)',
      artist: 'PSY',
      channel: 'officialpsy',
      durationMs: 252_000,
    })
  })

  it('uses the largest valid API thumbnail and ignores unsafe hosts', () => {
    const candidates = mapApiItems(
      [
        {
          id: { videoId: 'dQw4w9WgXcQ' },
          snippet: {
            title: 'Artist - Song',
            channelTitle: 'Artist - Topic',
            thumbnails: {
              default: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg', width: 120, height: 90 },
              high: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', width: 480, height: 360 },
            },
          },
        },
      ],
      [
        {
          id: 'dQw4w9WgXcQ',
          contentDetails: { duration: 'PT2M5S' },
          snippet: {
            title: 'Artist - Song',
            channelTitle: 'Artist - Topic',
            thumbnails: {
              medium: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg', width: 320, height: 180 },
              maxres: { url: 'https://i9.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', width: 1280, height: 720 },
              spoofed: { url: 'https://evil.example.com/cover.jpg', width: 4000, height: 4000 },
              plain: { url: 'http://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', width: 480, height: 360 },
            },
          },
        },
      ],
    )

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      videoTitle: 'Artist - Song',
      channel: 'Artist',
      artist: 'Artist',
      durationMs: 125_000,
      thumbnailUrl: 'https://i9.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
    })
  })

  it('falls back to the search thumbnail when details have none', () => {
    const candidates = mapApiItems(
      [
        {
          id: { videoId: '9bZkp7q19f0' },
          snippet: {
            title: 'PSY - GANGNAM STYLE',
            channelTitle: 'officialpsy',
            thumbnails: {
              high: { url: 'https://img.youtube.com/vi/9bZkp7q19f0/hqdefault.jpg', width: 480, height: 360 },
            },
          },
        },
      ],
      [{ id: '9bZkp7q19f0', contentDetails: { duration: 'PT4M12S' } }],
    )

    expect(candidates[0]?.thumbnailUrl).toBe(
      'https://img.youtube.com/vi/9bZkp7q19f0/hqdefault.jpg',
    )
  })

  it('leaves the thumbnail empty when the API sends no usable image', () => {
    const candidates = mapApiItems(
      [
        {
          id: { videoId: 'dQw4w9WgXcQ' },
          snippet: {
            title: 'Artist - Song',
            channelTitle: 'Artist',
            thumbnails: {
              bad: { url: 'https://example.com/cover.jpg', width: 1280, height: 720 },
            },
          },
        },
      ],
      [{ id: 'dQw4w9WgXcQ', contentDetails: { duration: 'PT1M' } }],
    )

    expect(candidates[0]?.thumbnailUrl).toBeNull()
  })

  it('skips live items and rows with no matching duration', () => {
    const candidates = mapApiItems(
      [
        {
          id: { videoId: 'dQw4w9WgXcQ' },
          snippet: { title: 'Live now', channelTitle: 'Streamer', liveBroadcastContent: 'live' },
        },
        {
          id: { videoId: '9bZkp7q19f0' },
          snippet: { title: 'No detail row', channelTitle: 'Artist' },
        },
      ],
      [
        { id: 'dQw4w9WgXcQ', contentDetails: { duration: 'PT1H' } },
      ],
    )

    expect(candidates).toEqual([])
  })

  it('keeps search rows with unknown duration when the detail call failed', () => {
    const candidates = mapApiItems(
      [
        {
          id: { videoId: 'dQw4w9WgXcQ' },
          snippet: { title: 'Artist - Song', channelTitle: 'Artist' },
        },
      ],
      [],
    )

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.durationMs).toBe(0)
  })
})
