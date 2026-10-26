import { BrowserWindow, globalShortcut, screen } from 'electron'
import type { MusicOverlaySettings, MusicOverlayState } from '@shared/types'
import { log } from '../logger'

/**
 * The card is 376×80 and sits 8 px inside the window so the CSS shadow is not
 * clipped by the transparent frame.
 */
const OVERLAY_WIDTH = 392
const OVERLAY_HEIGHT = 96
const OVERLAY_MARGIN = 24
/** Electron silently drops always-on-top when a fullscreen app takes over. */
const TOP_REASSERT_MS = 1_500

export interface MusicOverlayOptions {
  preloadPath: string
  /** `app://launcher/index.html`; the hash selects the overlay view. */
  appUrl: string
  /** "Open the launcher" from the overlay's own UI. */
  onFocusMainWindow: () => void
}

/**
 * A frameless, transparent, always-on-top window that shows the current track
 * over other applications. It never takes focus unless the user clicks it.
 */
export class MusicOverlay {
  private readonly options: MusicOverlayOptions
  private window: BrowserWindow | null = null
  private settings: MusicOverlaySettings
  private latestState: MusicOverlayState | null = null
  private dismissedTrackId: string | null = null
  private topTimer: NodeJS.Timeout | null = null
  private disposed = false
  private shortcutRegistered = false

  constructor(options: MusicOverlayOptions, settings: MusicOverlaySettings) {
    this.options = options
    this.settings = settings
  }

  get isOpen(): boolean {
    return Boolean(this.window && !this.window.isDestroyed() && this.window.isVisible())
  }

  /** IPC guard: only the overlay window may publish actions or read its state. */
  ownsWebContents(id: number): boolean {
    return Boolean(this.window && !this.window.isDestroyed() && this.window.webContents.id === id)
  }

  async start(): Promise<void> {
    if (this.disposed) return
    this.registerShortcut()
    if (this.settings.enabled) await this.ensureWindow()
  }

  async applySettings(settings: MusicOverlaySettings): Promise<void> {
    const previousShortcut = this.settings.shortcut
    this.settings = settings

    if (previousShortcut !== settings.shortcut) {
      this.unregisterShortcut()
      this.registerShortcut()
    }

    if (!settings.enabled) {
      this.hide()
      return
    }

    await this.ensureWindow()
    this.window?.setAlwaysOnTop(settings.alwaysOnTop, 'screen-saver')
    this.position()
  }

  updateState(state: MusicOverlayState): void {
    this.latestState = state
    if (!this.settings.enabled) return

    const nextTrackId = state.track?.id ?? null
    if (nextTrackId && nextTrackId !== this.dismissedTrackId) {
      this.dismissedTrackId = null
    }
    const shouldShow = Boolean(nextTrackId) && state.status !== 'idle'

    void this.ensureWindow().then(() => {
      this.pushState()
      if (shouldShow && !this.dismissedTrackId) {
        if (!this.isOpen) void this.show()
      } else if (state.status === 'idle') {
        this.hide()
      }
    })
  }

  /** The overlay's own close button: stays closed until the track changes. */
  dismiss(): void {
    this.dismissedTrackId = this.latestState?.track?.id ?? null
    this.hide()
  }

  async toggle(): Promise<boolean> {
    if (this.isOpen) {
      this.dismiss()
      return false
    }
    if (!this.settings.enabled) return false
    this.dismissedTrackId = null
    await this.show()
    return this.isOpen
  }

  async show(): Promise<void> {
    if (!this.settings.enabled) return
    await this.ensureWindow()
    const window = this.window
    if (!window || window.isDestroyed()) return

    this.position()
    // `showInactive` keeps the game or the launcher focused; the overlay is a
    // passive surface unless the user clicks it.
    window.showInactive()
    window.moveTop()
    this.pushState()
    this.startTopWatch()
  }

  hide(): void {
    this.stopTopWatch()
    if (this.window && !this.window.isDestroyed()) this.window.hide()
  }

  focusMainWindow(): void {
    this.hide()
    this.options.onFocusMainWindow()
  }

  dispose(): void {
    this.disposed = true
    this.stopTopWatch()
    this.unregisterShortcut()
    if (this.window && !this.window.isDestroyed()) this.window.destroy()
    this.window = null
  }

  private async ensureWindow(): Promise<void> {
    if (this.disposed) return
    if (this.window && !this.window.isDestroyed()) return

    const window = new BrowserWindow({
      width: OVERLAY_WIDTH,
      height: OVERLAY_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: true,
      alwaysOnTop: this.settings.alwaysOnTop,
      webPreferences: {
        preload: this.options.preloadPath,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: false,
        spellcheck: false,
        devTools: Boolean(process.env.ELECTRON_RENDERER_URL),
      },
    })

    window.setMenuBarVisibility(false)
    window.setAlwaysOnTop(this.settings.alwaysOnTop, 'screen-saver')
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    window.setSkipTaskbar(true)

    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.webContents.on('render-process-gone', (_event, details) => {
      log.warn(`music overlay renderer gone: ${details.reason}`)
      window.destroy()
    })

    window.on('closed', () => {
      this.window = null
      this.stopTopWatch()
    })

    this.window = window
    this.position()

    window.once('ready-to-show', () => this.pushState())

    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl) {
      await window.loadURL(`${devUrl}#/overlay`)
    } else {
      // `loadFile` would give the window a `file://` origin, which the IPC
      // sender guard (and the CSP) correctly reject. The custom scheme keeps
      // both windows on `app://launcher`.
      await window.loadURL(`${this.options.appUrl}#/overlay`)
    }

    this.pushState()
  }

  private pushState(): void {
    if (!this.window || this.window.isDestroyed() || !this.latestState) return
    this.window.webContents.send('music:overlay-state', this.latestState)
  }

  private position(): void {
    const window = this.window
    if (!window || window.isDestroyed()) return

    const area = screen.getPrimaryDisplay().workArea
    const left = this.settings.position.endsWith('left')
      ? area.x + OVERLAY_MARGIN
      : this.settings.position.endsWith('right')
        ? area.x + area.width - OVERLAY_WIDTH - OVERLAY_MARGIN
        : area.x + Math.round((area.width - OVERLAY_WIDTH) / 2)
    const top = this.settings.position.startsWith('top')
      ? area.y + OVERLAY_MARGIN
      : area.y + area.height - OVERLAY_HEIGHT - OVERLAY_MARGIN

    window.setBounds({
      x: Math.round(left),
      y: Math.round(top),
      width: OVERLAY_WIDTH,
      height: OVERLAY_HEIGHT,
    })
  }

  private startTopWatch(): void {
    if (this.topTimer) return
    this.topTimer = setInterval(() => {
      if (!this.window || this.window.isDestroyed()) return
      if (!this.settings.alwaysOnTop || !this.window.isVisible()) return
      this.window.setAlwaysOnTop(true, 'screen-saver')
      this.window.moveTop()
    }, TOP_REASSERT_MS)
  }

  private stopTopWatch(): void {
    if (!this.topTimer) return
    clearInterval(this.topTimer)
    this.topTimer = null
  }

  private registerShortcut(): void {
    if (!this.settings.shortcut) return
    try {
      this.shortcutRegistered = globalShortcut.register(this.settings.shortcut, () => {
        void this.toggle()
      })
      if (!this.shortcutRegistered) {
        log.warn(`music: overlay shortcut ${this.settings.shortcut} is already taken`)
      }
    } catch (error) {
      log.warn('music: could not register overlay shortcut', error)
      this.shortcutRegistered = false
    }
  }

  private unregisterShortcut(): void {
    if (!this.settings.shortcut || !this.shortcutRegistered) return
    globalShortcut.unregister(this.settings.shortcut)
    this.shortcutRegistered = false
  }
}
