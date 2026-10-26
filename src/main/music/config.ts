import type { MusicOverlayPosition, MusicOverlaySettings } from '@shared/types'
import { backupFile, readJsonFile, writeJsonFileAtomic } from '../fs-utils'

export const DEFAULT_OVERLAY_SETTINGS: MusicOverlaySettings = {
  // The overlay is the point of the feature, so it starts available. It still
  // stays hidden until the user plays something or presses the shortcut.
  enabled: true,
  alwaysOnTop: true,
  // Bottom-right clears both the launcher's chrome and most game HUDs.
  position: 'bottom-right',
  shortcut: 'Alt+Shift+M',
}

const POSITIONS: ReadonlySet<string> = new Set<MusicOverlayPosition>([
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
])

const CONFIG_VERSION = 1

interface StoredConfig {
  version: number
  overlay: MusicOverlaySettings
}

function sanitize(value: unknown): MusicOverlaySettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_OVERLAY_SETTINGS }
  const candidate = value as Partial<MusicOverlaySettings>
  return {
    enabled:
      typeof candidate.enabled === 'boolean'
        ? candidate.enabled
        : DEFAULT_OVERLAY_SETTINGS.enabled,
    alwaysOnTop:
      typeof candidate.alwaysOnTop === 'boolean'
        ? candidate.alwaysOnTop
        : DEFAULT_OVERLAY_SETTINGS.alwaysOnTop,
    position:
      typeof candidate.position === 'string' && POSITIONS.has(candidate.position)
        ? candidate.position
        : DEFAULT_OVERLAY_SETTINGS.position,
    // An empty string is meaningful: the user turned the shortcut off.
    shortcut:
      typeof candidate.shortcut === 'string' && candidate.shortcut.length <= 64
        ? candidate.shortcut
        : DEFAULT_OVERLAY_SETTINGS.shortcut,
  }
}

/**
 * Music overlay preferences live next to the music cache rather than inside
 * `Settings`: they are only relevant to this feature, and keeping them separate
 * avoids another field that has to be added in three places.
 */
export class MusicConfigStore {
  private readonly filePath: string
  private settings: MusicOverlaySettings = { ...DEFAULT_OVERLAY_SETTINGS }

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
    this.settings = sanitize(stored?.overlay)
  }

  get(): MusicOverlaySettings {
    return { ...this.settings }
  }

  async update(patch: Partial<MusicOverlaySettings>): Promise<MusicOverlaySettings> {
    this.settings = sanitize({ ...this.settings, ...patch })
    await this.save()
    return this.get()
  }

  private async save(): Promise<void> {
    const payload: StoredConfig = { version: CONFIG_VERSION, overlay: this.settings }
    await writeJsonFileAtomic(this.filePath, payload)
  }
}
