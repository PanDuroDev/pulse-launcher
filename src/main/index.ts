import {
  app,
  BrowserWindow,
  globalShortcut,
  Menu,
  powerSaveBlocker,
  session,
  Tray,
} from 'electron'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { IPC } from '@shared/ipc'
import type { AppInfo, ScanProgress } from '@shared/types'
import type { MusicOverlayState } from '@shared/contracts/music'
import type { WindowMode } from '@shared/contracts/settings'
import { DEFAULT_SETTINGS } from '@shared/types'
import { log } from './logger'
import {
  APP_HOST,
  resolveRendererRoot,
  getAppPaths,
} from './paths'
import { installAppProtocol, registerAppScheme } from './protocol'
import { AppStore } from './store'
import { CatalogService } from './catalog'
import type { PlaceCandidate } from './library-browser'
import { GameProcessWatcher } from './process-watcher'
import { markHiddenForGame, nextAutoReturn, NO_AUTO_RETURN } from './auto-return'
import type { AutoReturnState } from './auto-return'
import type { GameRunMatch } from './game-processes'
import { MusicLibraryService } from './music/library'
import { registerMusicIpc } from './ipc/music'
import { registerLibraryIpc } from './ipc/library'
import { registerSettingsIpc } from './ipc/settings'
import { registerCatalogIpc } from './ipc/catalog'
import { registerAppIpc } from './ipc/app'
import { registerSelectionIpc } from './ipc/selection'
import { MusicOverlay } from './music/overlay'
import { MusicConfigStore } from './music/config'
import { MusicOnlineService } from './music/online/service'
import { MusicYouTubeService } from './music/youtube/service'
import {
  applyWindowMode,
  resolveWindowMode,
  windowModeConfig,
  windowModeNeedsRecreate,
} from './window-mode'

const userDataOverride = process.env['LAUNCHER_USER_DATA']
if (userDataOverride) app.setPath('userData', path.resolve(userDataOverride))

const RESTORE_SHORTCUT = 'Control+Alt+L'
const forceWindowed = process.env['LAUNCHER_WINDOWED'] === '1'
const capturePath = process.env['LAUNCHER_CAPTURE']

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let displaySleepBlocker: number | null = null
let store: AppStore
let catalog: CatalogService
let music: MusicLibraryService
let musicOnline: MusicOnlineService
let musicYouTube: MusicYouTubeService
let musicConfig: MusicConfigStore
let musicOverlay: MusicOverlay | null = null
let overlayState: MusicOverlayState | null = null
let processWatcher: GameProcessWatcher | null = null
// Replaced during bootstrap once the saved settings are available.
let windowMode: WindowMode = DEFAULT_SETTINGS.windowMode
let autoReturn: AutoReturnState = NO_AUTO_RETURN
let restoreShortcutRegistered = false
let captureScheduled = false

function knownPath(name: 'home' | 'desktop' | 'documents' | 'downloads'): string | undefined {
  try {
    return app.getPath(name)
  } catch {
    return undefined
  }
}

/**
 * The destinations shown at the top of the picker. Missing folders are dropped
 * by resolvePlaces; nothing here is assumed to exist on every machine.
 */
function placeCandidates(): PlaceCandidate[] {
  const candidates: PlaceCandidate[] = []
  const add = (id: string, label: string, folder: string | undefined): void => {
    if (folder) candidates.push({ id, label, path: folder })
  }

  add('home', 'Home', knownPath('home'))
  add('desktop', 'Desktop', knownPath('desktop'))
  add('documents', 'Documents', knownPath('documents'))
  add('downloads', 'Downloads', knownPath('downloads'))

  const programFiles = process.env['ProgramFiles']
  const programFilesX86 = process.env['ProgramFiles(x86)']
  add('program-files', 'Program Files', programFiles)
  add('program-files-x86', 'Program Files (x86)', programFilesX86)
  add(
    'steam-games',
    'Steam games',
    programFilesX86 ? path.join(programFilesX86, 'Steam', 'steamapps', 'common') : undefined,
  )
  add(
    'steam-games-pf',
    'Steam games',
    programFiles ? path.join(programFiles, 'Steam', 'steamapps', 'common') : undefined,
  )
  add(
    'epic-games',
    'Epic Games',
    programFiles ? path.join(programFiles, 'Epic Games') : undefined,
  )
  return candidates
}

function trustedOrigin(): string | null {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!devUrl) return null
  try {
    return new URL(devUrl).origin
  } catch {
    return null
  }
}

function assertTrustedUrl(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): void {
  const senderUrl = event.senderFrame?.url ?? event.sender.getURL()
  const isAppUrl =
    senderUrl.startsWith(`app://${APP_HOST}/`) || senderUrl === `app://${APP_HOST}`
  const devOrigin = trustedOrigin()
  const isDevUrl = Boolean(devOrigin && senderUrl.startsWith(`${devOrigin}/`))
  if (!isAppUrl && !isDevUrl) {
    throw new Error('Untrusted IPC sender')
  }
}

function assertTrustedSender(event: Electron.IpcMainInvokeEvent): void {
  assertTrustedUrl(event)
  if (mainWindow && event.sender !== mainWindow.webContents) {
    throw new Error('IPC sender is not the launcher window')
  }
}

/**
 * Music channels are shared by the launcher window and the overlay window. Both
 * load the same `app://` entry, so the URL check above still applies; the window
 * identity check is widened by exactly one window.
 */
function assertMusicSender(
  event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
): void {
  assertTrustedUrl(event)
  const fromMain = Boolean(mainWindow && event.sender === mainWindow.webContents)
  const fromOverlay = musicOverlay?.ownsWebContents(event.sender.id) ?? false
  if (!fromMain && !fromOverlay) {
    throw new Error('IPC sender is not a music surface')
  }
}

function send(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

function startDisplaySleepBlocker(): void {
  if (displaySleepBlocker !== null) return
  displaySleepBlocker = powerSaveBlocker.start('prevent-display-sleep')
}

function stopDisplaySleepBlocker(): void {
  if (displaySleepBlocker === null) return
  if (powerSaveBlocker.isStarted(displaySleepBlocker)) {
    powerSaveBlocker.stop(displaySleepBlocker)
  }
  displaySleepBlocker = null
}

function createWindow(): BrowserWindow {
  const config = windowModeConfig(windowMode)
  const window = new BrowserWindow({
    width: 1600,
    height: 900,
    show: false,
    frame: config.frame,
    fullscreen: config.fullscreen,
    alwaysOnTop: config.alwaysOnTop,
    skipTaskbar: config.skipTaskbar,
    autoHideMenuBar: true,
    backgroundColor: '#050508',
    ...(config.frame ? {} : { titleBarStyle: 'hidden' as const }),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  })

  window.setMenu(null)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    const allowed =
      url.startsWith(`app://${APP_HOST}/`) ||
      Boolean(trustedOrigin() && url.startsWith(`${trustedOrigin()}/`))
    if (!allowed) event.preventDefault()
  })
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  )
  window.webContents.session.setPermissionCheckHandler(() => false)

  window.once('ready-to-show', () => {
    showWindow()
    if (capturePath && !captureScheduled) {
      captureScheduled = true
      window.setSize(1600, 900)
      setTimeout(() => {
        void captureScreenshot(window)
      }, 8_000)
    }
  })

  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      hideWindow()
    }
  })

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadURL(`app://${APP_HOST}/index.html`)
  }

  mainWindow = window
  return window
}

/**
 * Applies `mode` to the running launcher.
 *
 * Leaving fullscreen or kiosk for `windowed` needs a native frame, which only
 * a new BrowserWindow can provide; the window is recreated and restored to its
 * previous visibility.
 */
function setWindowMode(mode: WindowMode): void {
  if (mode === windowMode) return
  const previous = windowMode
  windowMode = mode
  if (!mainWindow) return

  if (windowModeNeedsRecreate(previous, mode)) {
    const wasVisible = mainWindow.isVisible()
    const oldWindow = mainWindow
    mainWindow = null
    oldWindow.destroy()
    const next = createWindow()
    if (!wasVisible) next.hide()
    return
  }

  applyWindowMode(mainWindow, mode, { fullscreen: mainWindow.isFullScreen() })
  // Leaving kiosk can restore a stale minimized placement; the window is
  // visible whenever this runs, so make sure it stays usable.
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
    mainWindow.focus()
  }
}

function showWindow(): void {
  // Showing the launcher by any route (tray, shortcut, second instance, or the
  // auto-return itself) cancels a pending automatic return.
  autoReturn = NO_AUTO_RETURN
  if (!mainWindow) {
    createWindow()
    return
  }

  applyWindowMode(mainWindow, windowMode, { fullscreen: mainWindow.isFullScreen() })
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  if (!catalog?.demo) processWatcher?.start()
  startDisplaySleepBlocker()
}

/**
 * Hides the launcher without quitting it.
 *
 * The process watcher keeps sampling while hidden so a running game is still
 * tracked and can bring the launcher back. Quitting is only exposed through
 * the tray menu and Settings.
 */
function hideWindow(): void {
  if (!mainWindow) return
  mainWindow.hide()
  stopDisplaySleepBlocker()
  void ensureTray()
}

function hideForGame(gameId: string): void {
  // Seed the observation flag from what the watcher already knows: it only
  // reports changes, so a game detected before this point may otherwise never
  // be reported as running again.
  autoReturn = markHiddenForGame(gameId, Boolean(catalog.getRunningMatch(gameId)))
  log.info('[auto-return] armed', {
    gameId,
    seenRunning: autoReturn.seenRunning,
  })
  hideWindow()
}

/**
 * Applies a process-watcher snapshot and restores the launcher once the game
 * that hid it has been seen running and every tracked game has exited.
 */
function handleRunningChange(matches: GameRunMatch[]): void {
  catalog.setRunningGames(matches)
  const update = nextAutoReturn(
    autoReturn,
    matches.map((match) => match.gameId),
  )
  autoReturn = update.state
  if (update.action !== 'return') return

  if (!store.getSettings().returnAfterGame) {
    log.info('[auto-return] game exited; staying hidden by preference')
    return
  }
  log.info('[auto-return] game exited; showing the launcher')
  showWindow()
}

async function ensureTray(): Promise<void> {
  if (tray) return
  try {
    const icon = await app.getFileIcon(process.execPath, { size: 'small' })
    tray = new Tray(icon)
    tray.setToolTip('Pulse Launcher')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Launcher', click: () => showWindow() },
        { type: 'separator' },
        { label: 'Quit', click: () => quitApp() },
      ]),
    )
    tray.on('click', () => showWindow())
  } catch (error) {
    log.warn('[tray] could not create tray icon', error)
  }
}

function quitApp(): void {
  isQuitting = true
  stopDisplaySleepBlocker()
  app.quit()
}

async function captureScreenshot(window: BrowserWindow): Promise<void> {
  if (!capturePath) return
  if (window.isDestroyed()) return
  try {
    const image = await window.webContents.capturePage()
    await writeFile(capturePath, image.toPNG())
    log.info('[capture] saved', capturePath)
  } catch (error) {
    log.error('[capture] failed', error)
  } finally {
    quitApp()
  }
}

function appInfo(): AppInfo {
  const paths = getAppPaths()
  return {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: `${process.platform} ${process.arch}`,
    isPackaged: app.isPackaged,
    demo: catalog.demo,
    userDataPath: paths.userData,
    logsPath: paths.logs,
    artworkPath: paths.artwork,
    restoreShortcut: {
      accelerator: RESTORE_SHORTCUT,
      registered: restoreShortcutRegistered,
    },
  }
}

/** Wires each IPC domain to the main-process services and trusted-sender policies. */
function registerIpc(): void {
  registerCatalogIpc({
    assertTrustedSender,
    catalog,
    hideForGame,
  })

  registerSettingsIpc({
    assertTrustedSender,
    store,
    catalog,
    send,
    setWindowMode,
  })

  registerLibraryIpc({
    assertTrustedSender,
    catalog,
    placeCandidates,
  })

  registerSelectionIpc({
    assertTrustedSender,
    store,
  })

  registerAppIpc({
    assertTrustedSender,
    assertMusicSender,
    appInfo,
    hideWindow,
    quitApp,
    logsPath: () => getAppPaths().logs,
  })

  registerMusicIpc({
    assertMusicSender,
    getMainWindow: () => mainWindow,
    music,
    musicOnline,
    musicYouTube,
    musicConfig,
    getMusicOverlay: () => musicOverlay,
    getOverlayState: () => overlayState,
    setOverlayState: (state) => {
      overlayState = state
    },
    send,
  })
}

async function bootstrap(): Promise<void> {
  app.setAppUserModelId('com.pulse.launcher')
  Menu.setApplicationMenu(null)

  store = new AppStore()
  await store.load()
  await ensurePaths()
  windowMode = resolveWindowMode({
    windowed: forceWindowed,
    capture: Boolean(capturePath),
    saved: store.getSettings().windowMode,
  })
  log.info('[main] starting', {
    version: app.getVersion(),
    windowMode,
    demo: process.env['LAUNCHER_DEMO'] === '1',
    defaults: DEFAULT_SETTINGS,
  })
  catalog = new CatalogService(store)
  await catalog.loadCache()

  const paths = getAppPaths()
  const demoMode = process.env['LAUNCHER_DEMO'] === '1'
  musicConfig = new MusicConfigStore(paths.musicConfig)
  await musicConfig.load()
  music = new MusicLibraryService({
    libraryFile: paths.musicLibrary,
    artworkDir: paths.musicArtwork,
    demoDir: path.join(paths.music, 'demo'),
    demo: demoMode,
  })
  await music.load()
  musicOnline = new MusicOnlineService()
  musicYouTube = new MusicYouTubeService({
    rootDir: paths.musicYouTube,
    artworkDir: paths.musicArtwork,
    configFile: paths.musicYouTubeConfig,
    binDir: paths.musicBin,
  })
  await musicYouTube.load()

  installAppProtocol({
    rendererRoot: resolveRendererRoot(),
    artworkRoot: paths.artwork,
    musicArtworkRoot: paths.musicArtwork,
    resolveMedia: (trackId) =>
      music.getTrackFile(trackId) ?? musicYouTube.getTrackFile(trackId),
    resolveOnlineMedia: (token) => musicOnline.resolveMedia(token),
    resolveOnlineArt: (token) => musicOnline.resolveArtwork(token),
    resolveYouTubeArt: (videoId) => musicYouTube.getArtworkUrls(videoId),
  })
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  )
  session.defaultSession.setPermissionCheckHandler(() => false)

  registerIpc()
  catalog.setListeners({
    onChanged: (games) => send(IPC.catalogChanged, games),
    onRunningChanged: (games) => send(IPC.catalogRunningChanged, games),
    onProgress: (progress: ScanProgress) => send(IPC.catalogScanProgress, progress),
    onStaleChanged: (sources) => send(IPC.catalogStaleChanged, sources),
  })
  music.onChange((snapshot) => send(IPC.musicChanged, snapshot))

  processWatcher = new GameProcessWatcher({
    getGames: () => catalog.getProcessCandidates(),
    onChange: handleRunningChange,
  })
  if (!catalog.demo) processWatcher.start()

  createWindow()

  musicOverlay = new MusicOverlay(
    {
      preloadPath: path.join(__dirname, '../preload/index.js'),
      appUrl: `app://${APP_HOST}/index.html`,
      onFocusMainWindow: () => showWindow(),
    },
    musicConfig.get(),
  )
  void musicOverlay.start().catch((error) => log.warn('music: overlay failed to start', error))

  void ensureTray()

  restoreShortcutRegistered = globalShortcut.register(RESTORE_SHORTCUT, () => showWindow())
  if (!restoreShortcutRegistered) {
    log.warn('[shortcut] could not register global restore shortcut', RESTORE_SHORTCUT)
  }

  if (!catalog.demo && (catalog.list().length === 0 || catalog.isStale)) {
    void catalog.refresh().catch((error) => log.error('[catalog] startup scan failed', error))
  }

  if (music.needsScan()) {
    void music.rescan().catch((error) => log.error('music: startup scan failed', error))
  }
}

async function ensurePaths(): Promise<void> {
  const { artwork, cache, music, musicArtwork, musicYouTube, musicBin } = getAppPaths()
  const { mkdir } = await import('node:fs/promises')
  await mkdir(artwork, { recursive: true })
  await mkdir(cache, { recursive: true })
  await mkdir(music, { recursive: true })
  await mkdir(musicArtwork, { recursive: true })
  await mkdir(musicYouTube, { recursive: true })
  await mkdir(musicBin, { recursive: true })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  registerAppScheme()

  app.on('second-instance', () => {
    showWindow()
  })

  app.on('before-quit', () => {
    isQuitting = true
    processWatcher?.stop()
    musicOverlay?.dispose()
    stopDisplaySleepBlocker()
    globalShortcut.unregisterAll()
  })

  app.on('window-all-closed', () => {
    if (isQuitting) app.quit()
  })

  app.whenReady().then(bootstrap).catch((error) => {
    log.error('[bootstrap] failed', error)
    app.quit()
  })
}

process.on('uncaughtException', (error) => {
  log.error('[uncaughtException]', error)
})

process.on('unhandledRejection', (reason) => {
  log.error('[unhandledRejection]', reason)
})
