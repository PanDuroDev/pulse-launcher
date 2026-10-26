import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { StoredMusicTrack } from './types'

interface DemoSeed {
  id: string
  title: string
  artist: string
  album: string
  seconds: number
  /** A simple triad; the exact notes matter less than having distinguishable tracks. */
  notes: [number, number, number]
  colors: [string, string]
}

const DEMO_SEEDS: DemoSeed[] = [
  {
    id: 'demo-neon-drift',
    title: 'Neon Drift',
    artist: 'Pulse Sessions',
    album: 'Night Drive',
    seconds: 32,
    notes: [220, 261.63, 329.63],
    colors: ['#1b2b4b', '#6f8fbf'],
  },
  {
    id: 'demo-glass-horizon',
    title: 'Glass Horizon',
    artist: 'Mira Vale',
    album: 'Slow Light',
    seconds: 28,
    notes: [293.66, 349.23, 440],
    colors: ['#3a2418', '#c08a5e'],
  },
  {
    id: 'demo-afterglow',
    title: 'Afterglow',
    artist: 'The Lumen Set',
    album: 'Static Bloom',
    seconds: 24,
    notes: [174.61, 220, 261.63],
    colors: ['#2c1b33', '#9b6fa8'],
  },
  {
    id: 'demo-low-orbit',
    title: 'Low Orbit',
    artist: 'Kite Theory',
    album: 'Gravity Well',
    seconds: 36,
    notes: [261.63, 329.63, 392],
    colors: ['#132b26', '#5f9e8a'],
  },
]

const SAMPLE_RATE = 22_050

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * A short mono PCM tone. Demo mode has to be audible without shipping audio
 * files or reaching the network, so the fixture writes its own WAV once.
 */
function wavTone(seed: DemoSeed): Buffer {
  const frames = Math.floor(seed.seconds * SAMPLE_RATE)
  const dataSize = frames * 2
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  const fade = 0.7
  for (let index = 0; index < frames; index += 1) {
    const time = index / SAMPLE_RATE
    // Symmetric fades keep the loop free of a click at either end.
    const envelope = Math.min(1, time / fade, (seed.seconds - time) / fade)
    let sample = 0
    for (let voice = 0; voice < seed.notes.length; voice += 1) {
      const frequency = seed.notes[voice] ?? seed.notes[0]
      sample += Math.sin(2 * Math.PI * frequency * time + voice * 0.7) / (voice + 1)
    }
    sample *= 0.26 * Math.max(0, envelope)
    // A slow tremolo makes the demo track feel alive and proves progress works.
    sample *= 0.86 + 0.14 * Math.sin(2 * Math.PI * 0.3 * time)
    const clamped = Math.max(-1, Math.min(1, sample))
    buffer.writeInt16LE(Math.round(clamped * 32_767), 44 + index * 2)
  }

  return buffer
}

function svgCover(seed: DemoSeed): string {
  const [from, to] = seed.colors
  const initials = seed.artist
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
  <defs>
    <radialGradient id="g" cx="30%" cy="20%" r="90%">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </radialGradient>
  </defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <circle cx="470" cy="130" r="190" fill="#ffffff" opacity="0.06"/>
  <circle cx="110" cy="520" r="150" fill="#000000" opacity="0.18"/>
  <text x="60" y="470" fill="#ffffff" opacity="0.92" font-family="Geist, sans-serif" font-size="150" font-weight="600" letter-spacing="-6">${escapeXml(initials)}</text>
  <text x="64" y="530" fill="#ffffff" opacity="0.6" font-family="Geist, sans-serif" font-size="30">${escapeXml(seed.album)}</text>
</svg>`
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Writes the demo fixtures once and returns them as normal stored tracks, so
 * every other code path (scan cache, streaming, artwork) is exercised for real.
 */
export async function ensureDemoLibrary(
  demoDir: string,
  artworkDir: string,
): Promise<StoredMusicTrack[]> {
  await mkdir(demoDir, { recursive: true })
  await mkdir(artworkDir, { recursive: true })

  const tracks: StoredMusicTrack[] = []
  for (const seed of DEMO_SEEDS) {
    const audioPath = path.join(demoDir, `${seed.id}.wav`)
    const artworkFile = `${seed.id}.svg`
    const artworkPath = path.join(artworkDir, artworkFile)

    if (!(await exists(audioPath))) {
      await writeFile(audioPath, wavTone(seed))
    }
    if (!(await exists(artworkPath))) {
      await writeFile(artworkPath, svgCover(seed), 'utf8')
    }

    tracks.push({
      id: seed.id,
      title: seed.title,
      artist: seed.artist,
      album: seed.album,
      durationMs: seed.seconds * 1000,
      filePath: audioPath,
      artworkFile,
      folder: 'Demo',
      addedAt: 0,
    })
  }
  return tracks
}
