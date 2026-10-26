import type { MusicOnlineProvider } from '@shared/types'
import type { ProviderTrack } from './providers'

/**
 * Ranking is deliberately independent of the providers. Every catalog is
 * normalised into one `ProviderTrack` shape first, so a remix penalty or a
 * title match means the same thing for iTunes and Internet Archive.
 */

const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'feat',
  'featuring',
  'for',
  'from',
  'ft',
  'in',
  'into',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'the',
  'to',
  'versus',
  'vs',
  'with',
])

/**
 * Words that describe a different version of the same song. They are removed
 * from the dedupe key, and penalised unless the user asked for that version.
 */
const VERSION_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ['karaoke', 0.45],
  ['instrumental', 0.4],
  ['tribute', 0.32],
  ['cover', 0.22],
  ['nightcore', 0.22],
  ['8d', 0.2],
  ['bass boosted', 0.2],
  ['sped up', 0.18],
  ['slowed', 0.18],
  ['live', 0.15],
  ['rehearsal', 0.15],
  ['remix', 0.13],
  ['demo', 0.12],
  ['acoustic', 0.1],
  ['extended', 0.08],
  ['session', 0.06],
  ['edit', 0.06],
  ['remaster', 0.02],
]

const VERSION_WORDS = new Set(
  VERSION_WEIGHTS.flatMap(([phrase]) => phrase.split(' ')).concat(['remastered', 'remixed', 'cover']),
)

/**
 * Results that are usually not the recording the user asked for. The check is
 * skipped when the user included the phrase themselves, so a search for
 * "karaoke" still returns karaoke.
 */
const JUNK_PHRASES = [
  'in the style of',
  'made famous',
  'as made famous',
  'originally performed',
  'sound alike',
  'tribute',
  'karaoke',
  'backing track',
  'instrumental',
  'acapella',
  'a cappella',
  'ringtone',
  'reaction',
  'tutorial',
  'lesson',
  'sheet music',
  'midi',
  '8d audio',
  'bass boosted',
  'nightcore',
  'lullaby version',
  'music box',
  'onlymp3',
  'y2mate',
  'ytmp3',
  'mp3 converter',
  'mp3 download',
  'download mp3',
  'full album',
]

const PROVIDER_TRUST: Record<MusicOnlineProvider, number> = {
  itunes: 0.95,
  deezer: 0.9,
  audius: 0.82,
  openverse: 0.65,
  archive: 0.6,
}

const PREVIEW_PENALTY = 0.035

/** Below this a result is unrelated, not merely a different version. */
const MIN_MATCH = 0.34

export function stripDiacritics(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}+/gu, '')
}

export function normalizeText(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function tokenize(value: string): string[] {
  return normalizeText(value).match(TOKEN_PATTERN) ?? []
}

export function contentTokens(value: string): string[] {
  return tokenize(value).filter((token) => !STOPWORDS.has(token))
}

export function uniqueTokens(value: string): string[] {
  return [...new Set(contentTokens(value))]
}

/** Dice coefficient over character bigrams. Short tokens fall back to equality. */
export function similarity(left: string, right: string): number {
  if (left === right) return 1
  if (left.length < 3 || right.length < 3) return 0
  if (left.startsWith(right) || right.startsWith(left)) {
    return Math.min(left.length, right.length) >= 4 ? 0.9 : 0
  }

  const pairs = (value: string): Map<string, number> => {
    const result = new Map<string, number>()
    for (let index = 0; index < value.length - 1; index += 1) {
      const pair = value.slice(index, index + 2)
      result.set(pair, (result.get(pair) ?? 0) + 1)
    }
    return result
  }

  const leftPairs = pairs(left)
  const rightPairs = pairs(right)
  let overlap = 0
  for (const [pair, count] of leftPairs) {
    overlap += Math.min(count, rightPairs.get(pair) ?? 0)
  }
  const total = left.length - 1 + (right.length - 1)
  return total > 0 ? (2 * overlap) / total : 0
}

function coverage(tokens: string[], candidates: string[]): number {
  if (tokens.length === 0 || candidates.length === 0) return 0
  let total = 0
  for (const token of tokens) {
    let best = 0
    for (const candidate of candidates) {
      const value = similarity(token, candidate)
      if (value > best) best = value
    }
    total += best
  }
  return total / tokens.length
}

/**
 * True when every field token already appears in the query. An exact song title
 * or artist is a much stronger signal than a long upload title that happens to
 * contain the query among extra words.
 */
function fullyContained(tokens: string[], queryTokens: string[]): boolean {
  if (tokens.length === 0) return false
  return tokens.every((token) =>
    queryTokens.some((queryToken) => similarity(token, queryToken) >= 0.8),
  )
}

function hasLatinScript(value: string): boolean {
  return /[a-z]/.test(normalizeText(value))
}

/**
 * How well a candidate title/artist pair matches the query. Title coverage is
 * weighted highest, but an artist match still keeps a song by the right artist
 * above an unrelated result with a lucky title.
 */
export function matchScore(query: string, title: string, artist: string): number {
  const queryTokens = uniqueTokens(query)
  if (queryTokens.length === 0) return 0

  const titleTokens = contentTokens(title)
  const artistTokens = contentTokens(artist)
  const titleCoverage = coverage(queryTokens, titleTokens)
  const artistCoverage = coverage(queryTokens, artistTokens)
  const combinedCoverage = coverage(queryTokens, [...new Set([...titleTokens, ...artistTokens])])
  const titleContained = fullyContained(titleTokens, queryTokens)
  const artistContained = fullyContained(artistTokens, queryTokens)
  // A localized artist name is still a valid original; the script mismatch is a
  // metadata problem, not evidence that the uploader invented a cover.
  const artistScriptMismatch =
    hasLatinScript(query) && !hasLatinScript(artist) && artistTokens.length > 0

  let score =
    titleCoverage * 0.62 + artistCoverage * 0.28 + combinedCoverage * 0.1

  // Reward a clean "title by artist" pairing, and penalise titles padded with
  // uploader names, "plays", remix labels, and other words the query never had.
  if (titleContained) score += 0.22
  else score -= (1 - coverage(titleTokens, queryTokens)) * 0.14
  if (artistContained) score += 0.16
  else if (!artistScriptMismatch) score -= (1 - coverage(artistTokens, queryTokens)) * 0.16
  if (titleContained && artistContained) score += 0.06

  const normalizedTitle = titleTokens.join(' ')
  const normalizedArtist = artistTokens.join(' ')
  const normalizedQuery = queryTokens.join(' ')
  if (normalizedTitle === normalizedQuery) score += 0.2
  else if (normalizedTitle.startsWith(normalizedQuery)) score += 0.1
  else if (normalizedTitle.includes(normalizedQuery)) score += 0.05
  else if (normalizedArtist === normalizedQuery) score += 0.08

  return Math.max(0, Math.min(1, score))
}

/** Longer songs are ordinary songs; very short and very long files are less likely. */
export function durationFit(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0.4
  if (durationMs < 20_000) return 0.25
  if (durationMs < 45_000) return 0.5
  if (durationMs < 75_000) return 0.8
  if (durationMs <= 20 * 60_000) return 1
  return 0.6
}

export function versionPenalty(title: string, query: string): number {
  const titleText = normalizeText(title)
  const queryText = normalizeText(query)
  let penalty = 0
  for (const [phrase, weight] of VERSION_WEIGHTS) {
    if (!titleText.includes(phrase)) continue
    if (queryText.includes(phrase)) continue
    penalty += weight
  }
  return Math.min(0.6, penalty)
}

export function isJunkResult(title: string, artist: string, query: string): boolean {
  const haystack = normalizeText(`${title} ${artist}`)
  const queryText = normalizeText(query)
  return JUNK_PHRASES.some(
    (phrase) => haystack.includes(phrase) && !queryText.includes(phrase),
  )
}

export function scoreTrack(track: ProviderTrack, query: string): number {
  const match = matchScore(query, track.title, track.artist)
  const duration = durationFit(track.durationMs)
  const version = versionPenalty(track.title, query)
  const preview = track.streamKind === 'preview' ? PREVIEW_PENALTY : 0
  const trust = PROVIDER_TRUST[track.provider] ?? 0.5
  return match * 0.86 + duration * 0.08 + trust * 0.06 - version - preview
}

function primaryArtist(artist: string): string {
  const tokens = contentTokens(artist)
  return tokens.slice(0, 2).join(' ') || 'unknown'
}

function titleCore(title: string): string {
  const withoutBrackets = title.replace(/[([{][^)\]}]*[)\]}]/g, ' ')
  const tokens = contentTokens(withoutBrackets).filter((token) => !VERSION_WORDS.has(token))
  return tokens.slice(0, 4).join(' ') || contentTokens(title).slice(0, 4).join(' ') || normalizeText(title)
}

export function dedupeKey(track: ProviderTrack): string {
  return `${primaryArtist(track.artist)}|${titleCore(track.title)}`
}

interface ScoredTrack {
  track: ProviderTrack
  score: number
}

function preferCandidate(candidate: ScoredTrack, current: ScoredTrack): boolean {
  if (candidate.track.streamKind !== current.track.streamKind) {
    const difference = candidate.score - current.score
    // A full track within a hair of a preview is the better listening result.
    if (candidate.track.streamKind === 'full' && difference >= -0.05) return true
    if (current.track.streamKind === 'full' && difference <= 0.05) return false
  }
  return candidate.score > current.score
}

/**
 * Filters unrelated and junk results, scores the rest, then keeps one version
 * of each song. The returned array is already in display order.
 */
export function rankTracks(tracks: ProviderTrack[], query: string): ProviderTrack[] {
  const scored: ScoredTrack[] = []
  for (const track of tracks) {
    if (!track.title.trim() || !track.artist.trim()) continue
    if (isJunkResult(track.title, track.artist, query)) continue
    const score = scoreTrack(track, query)
    if (matchScore(query, track.title, track.artist) < MIN_MATCH) continue
    scored.push({ track, score })
  }

  scored.sort(
    (left, right) =>
      right.score - left.score ||
      right.track.durationMs - left.track.durationMs ||
      left.track.id.localeCompare(right.track.id),
  )

  const bySong = new Map<string, ScoredTrack>()
  for (const entry of scored) {
    const key = dedupeKey(entry.track)
    const current = bySong.get(key)
    if (!current || preferCandidate(entry, current)) {
      bySong.set(key, entry)
    }
  }

  return [...bySong.values()]
    .sort((left, right) => right.score - left.score || left.track.id.localeCompare(right.track.id))
    .map((entry) => entry.track)
}
