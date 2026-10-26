import type { MusicYouTubeSettings } from '@shared/types'
import { backupFile, readJsonFile, writeJsonFileAtomic } from '../../fs-utils'

export const DEFAULT_YOUTUBE_SETTINGS: MusicYouTubeSettings = {
  // Search still works through yt-dlp when this is empty.
  apiKey: '',
  ytDlpPath: '',
  ffmpegPath: '',
}

const CONFIG_VERSION = 1
const MAX_API_KEY_LENGTH = 200
const MAX_PATH_LENGTH = 1024

interface StoredConfig {
  version: number
  settings: MusicYouTubeSettings
}

function stringValue(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function sanitize(value: unknown): MusicYouTubeSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_YOUTUBE_SETTINGS }
  const candidate = value as Partial<MusicYouTubeSettings>
  return {
    apiKey: stringValue(candidate.apiKey, MAX_API_KEY_LENGTH),
    ytDlpPath: stringValue(candidate.ytDlpPath, MAX_PATH_LENGTH),
    ffmpegPath: stringValue(candidate.ffmpegPath, MAX_PATH_LENGTH),
  }
}

/**
 * YouTube credentials live beside the music cache instead of in the general
 * Settings file: they are optional, feature-specific, and often changed while
 * troubleshooting. The key is never logged or sent anywhere except Google.
 */
export class YouTubeConfigStore {
  private readonly filePath: string
  private settings: MusicYouTubeSettings = { ...DEFAULT_YOUTUBE_SETTINGS }

  constructor(filePath: string) {
    this.filePath = filePath
  }

  async load(): Promise<void> {
    const read = await readJsonFile(this.filePath)
    if (read.status === 'missing') return
    if (read.status === 'invalid') {
      await backupFile(this.filePath)
      return
    }
    const stored = read.value as Partial<StoredConfig> | null
    this.settings = sanitize(stored?.settings)
  }

  get(): MusicYouTubeSettings {
    return { ...this.settings }
  }

  async update(patch: Partial<MusicYouTubeSettings>): Promise<MusicYouTubeSettings> {
    this.settings = sanitize({ ...this.settings, ...patch })
    await this.save()
    return this.get()
  }

  private async save(): Promise<void> {
    const payload: StoredConfig = { version: CONFIG_VERSION, settings: this.settings }
    await writeJsonFileAtomic(this.filePath, payload)
  }
}
