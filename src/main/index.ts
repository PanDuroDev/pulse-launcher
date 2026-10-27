import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  powerSaveBlocker,
  session,
  shell,
  Tray,
} from 'electron'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { IPC } from '@shared/ipc'
import type {
  AddManualResult,
  AppInfo,
  ArtKind,
  DirectoryListing,
  FavoriteResult,
  GameControlResult,
  GameSource,
  GameSummary,
  LaunchResult,
  MusicOverlayState,
  PickerRoots,
  ScanProgress,
  ScanResult,
  SelectionResult,
  Settings,
  SettingsUpdate,
  UpdateManualResult,
  WindowMode,
} from '@shared/types'
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
import {
  driveLocations,
  isBrowsablePath,
  listDirectory,
  listDrives,
  resolvePlaces,
} from './library-browser'
import type { PlaceCandidate } from './library-browser'
import { GameProcessWatcher } from './process-watcher'
import { launchGame } from './launch'
import { GameControlService, terminateProcess } from './game-control'
import { runWindowAction } from './game-window'
import { markHiddenForGame, nextAutoReturn, NO_AUTO_RETURN } from './auto-return'
import type { AutoReturnState } from './auto-return'
import type { GameRunMatch } from './game-processes'
import { MusicLibraryService } from './music/library'
import { registerMusicIpc } from './ipc/music'
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

const SettingsUpdateSchema = z
  .object({
    showStartMenuApps: z.boolean().optional(),
    steamGridDbApiKey: z.string().max(200).optional(),
    hideCursorAfterMs: z.number().int().min(500).max(60_000).optional(),
    motion: z.enum(['system', 'reduced', 'full']).optional(),
    windowMode: z.enum(['windowed', 'fullscreen', 'kiosk']).optional(),
    returnAfterGame: z.boolean().optional(),
    librarySort: z.enum(['recent', 'title', 'added']).optional(),
    uiSounds: z.boolean().optional(),
  })
  .strict()

const ArtworkRequestSchema = z.object({
  gameId: z.string().min(1).max(200),
  kind: z.enum(['cover', 'hero', 'icon', 'logo']),
})

const GameIdSchema = z.object({
  gameId: z.string().min(1).max(200),
})

const RemoveManualSchema = z.object({
  gameId: z.string().min(1).max(200),
})

const SelectionSchema = z.object({
  gameId: z.string().min(1).max(200).nullable(),
})

const ForceCloseSchema = z.object({
  gameId: z.string().min(1).max(200),
  confirm: z.boolean(),
})

const BrowseSchema = z
  .object({
    path: z.string().min(1).max(1024),
    kind: z.enum(['game', 'image']).optional(),
  })
  .strict()

const UpdateManualSchema = z
  .object({
    gameId: z.string().min(1).max(200),
    name: z.string().max(200).optional(),
    executable: z.string().min(1).max(1024).optional(),
    artwork: z.string().min(1).max(1024).nullable().optional(),
  })
  .strict()

/**
 * Renderer crash reports are untrusted input: the renderer could be compromised,
 * so the strings are capped and the surface is a closed set before they reach
 * the log file.
 */
const RendererErrorSchema = z
  .object({
    surface: z.enum(['launcher', 'overlay']),
    message: z.string().max(2_000),
    stack: z.string().max(20_000),
    componentStack: z.string().max(20_000),
  })
  .strict()

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

function registerIpc(): void {
  const gameControl = new GameControlService({
    getRunningMatch: (gameId) => catalog.getRunningMatch(gameId),
    runWindowAction,
    terminateProcess,
  })

  ipcMain.handle(IPC.catalogList, (event): GameSummary[] => {
    assertTrustedSender(event)
    return catalog.list()
  })

  ipcMain.handle(IPC.catalogStaleSources, (event): GameSource[] => {
    assertTrustedSender(event)
    return catalog.getStaleSources()
  })

  ipcMain.handle(IPC.catalogRefresh, async (event): Promise<ScanResult> => {
    assertTrustedSender(event)
    return catalog.refresh()
  })

  ipcMain.handle(
    IPC.catalogArtwork,
    async (event, payload: unknown) => {
      assertTrustedSender(event)
      const parsed = ArtworkRequestSchema.parse(payload)
      return catalog.artworkFor(parsed.gameId, parsed.kind as ArtKind)
    },
  )

  ipcMain.handle(
    IPC.catalogToggleFavorite,
    async (event, payload: unknown): Promise<FavoriteResult> => {
      assertTrustedSender(event)
      const parsed = GameIdSchema.parse(payload)
      const result = await catalog.toggleFavorite(parsed.gameId)
      log.info('[catalog] toggle favorite', {
        gameId: parsed.gameId,
        ok: result.ok,
        favorite: result.favorite,
      })
      return result
    },
  )

  ipcMain.handle(IPC.launchGame, async (event, payload: unknown): Promise<LaunchResult> => {
    assertTrustedSender(event)
    const parsed = GameIdSchema.parse(payload)
    const game = catalog.getCachedGame(parsed.gameId)
    if (!game) return { ok: false, error: 'Game not found.' }

    if (catalog.demo) {
      return { ok: true }
    }

    const result = await launchGame(game)
    if (result.ok) {
      await catalog.markLaunched(game.id)
      setTimeout(() => hideForGame(game.id), 900)
    }
    return result
  })

  ipcMain.handle(
    IPC.gameFocus,
    async (event, payload: unknown): Promise<GameControlResult> => {
      assertTrustedSender(event)
      const parsed = GameIdSchema.parse(payload)
      const result = await gameControl.focus(parsed.gameId)
      log.info('[game] focus', { gameId: parsed.gameId, ...result })
      return result
    },
  )

  ipcMain.handle(
    IPC.gameClose,
    async (event, payload: unknown): Promise<GameControlResult> => {
      assertTrustedSender(event)
      const parsed = GameIdSchema.parse(payload)
      const result = await gameControl.close(parsed.gameId)
      log.info('[game] close', { gameId: parsed.gameId, ...result })
      return result
    },
  )

  ipcMain.handle(
    IPC.gameForceClose,
    async (event, payload: unknown): Promise<GameControlResult> => {
      assertTrustedSender(event)
      const parsed = ForceCloseSchema.parse(payload)
      const result = await gameControl.forceClose(parsed.gameId, parsed.confirm)
      log.warn('[game] force quit', {
        gameId: parsed.gameId,
        confirm: parsed.confirm,
        ...result,
      })
      return result
    },
  )

  ipcMain.handle(IPC.settingsGet, (event): Settings => {
    assertTrustedSender(event)
    return store.getSettings()
  })

  ipcMain.handle(
    IPC.settingsUpdate,
    async (event, payload: unknown): Promise<Settings> => {
      assertTrustedSender(event)
      const update = SettingsUpdateSchema.parse(payload) as SettingsUpdate
      log.info('[settings] update', {
        ...update,
        steamGridDbApiKey:
          update.steamGridDbApiKey === undefined ? undefined : '[redacted]',
      })
      const before = store.getSettings()
      const next = await store.updateSettings(update)
      send(IPC.settingsChanged, next)
      if (before.showStartMenuApps !== next.showStartMenuApps) {
        void catalog.refresh().catch((error) => log.error('[settings] rescan failed', error))
      }
      if (before.windowMode !== next.windowMode) {
        // Applied after this handler resolves so the renderer receives the
        // updated settings before a mode change can recreate its window.
        setTimeout(() => setWindowMode(next.windowMode), 0)
      }
      return next
    },
  )

  ipcMain.handle(IPC.libraryRoots, async (event): Promise<PickerRoots> => {
    assertTrustedSender(event)
    const [places, drives] = await Promise.all([
      resolvePlaces(placeCandidates()),
      listDrives(),
    ])
    return { places: [...places, ...driveLocations(drives)] }
  })

  ipcMain.handle(
    IPC.libraryList,
    async (event, payload: unknown): Promise<DirectoryListing> => {
      assertTrustedSender(event)
      const parsed = BrowseSchema.parse(payload)
      const listing = await listDirectory(parsed.path, parsed.kind ?? 'game')
      log.info('[library] browse', {
        ok: listing.ok,
        path: listing.path,
        entries: listing.entries?.length,
      })
      return listing
    },
  )

  ipcMain.handle(
    IPC.libraryAdd,
    async (event, payload: unknown): Promise<AddManualResult> => {
      assertTrustedSender(event)
      const parsed = BrowseSchema.parse(payload)
      if (!isBrowsablePath(parsed.path)) {
        return { ok: false, error: 'Choose a game file on a local drive.' }
      }
      const result = await catalog.addManualGame(parsed.path)
      log.info('[library] add manual game', {
        ok: result.ok,
        name: result.game?.name,
        executable: parsed.path,
      })
      return result
    },
  )

  ipcMain.handle(
    IPC.libraryUpdate,
    async (event, payload: unknown): Promise<UpdateManualResult> => {
      assertTrustedSender(event)
      const parsed = UpdateManualSchema.parse(payload)
      if (parsed.executable !== undefined && !isBrowsablePath(parsed.executable)) {
        return { ok: false, error: 'Choose a game file on a local drive.' }
      }
      if (typeof parsed.artwork === 'string' && !isBrowsablePath(parsed.artwork)) {
        return { ok: false, error: 'Choose an image on a local drive.' }
      }
      const result = await catalog.updateManualGame({
        gameId: parsed.gameId,
        name: parsed.name,
        executable: parsed.executable,
        artwork: parsed.artwork,
      })
      log.info('[library] update manual game', {
        ok: result.ok,
        gameId: parsed.gameId,
        previousId: result.previousId,
        error: result.error,
      })
      return result
    },
  )

  ipcMain.handle(
    IPC.settingsRemoveManual,
    async (event, payload: unknown) => {
      assertTrustedSender(event)
      const parsed = RemoveManualSchema.parse(payload)
      return catalog.removeManualGame(parsed.gameId)
    },
  )

  ipcMain.handle(IPC.selectionGet, (event): string | null => {
    assertTrustedSender(event)
    return store.getLastSelectedId()
  })

  ipcMain.handle(
    IPC.selectionSet,
    async (event, payload: unknown): Promise<SelectionResult> => {
      assertTrustedSender(event)
      const parsed = SelectionSchema.parse(payload)
      return store.setLastSelectedId(parsed.gameId)
    },
  )

  ipcMain.handle(IPC.appInfo, (event): AppInfo => {
    assertTrustedSender(event)
    return appInfo()
  })

  ipcMain.handle(IPC.appHide, (event): void => {
    assertTrustedSender(event)
    hideWindow()
  })

  ipcMain.handle(IPC.appQuit, (event): void => {
    assertTrustedSender(event)
    quitApp()
  })

  ipcMain.handle(IPC.appOpenLogs, async (event): Promise<void> => {
    assertTrustedSender(event)
    const errorMessage = await shell.openPath(getAppPaths().logs)
    if (errorMessage) log.warn('[logs] could not open logs', errorMessage)
  })

  /**
   * The renderer has no file access, so a crash there would vanish once the
   * ErrorBoundary replaces the page. Forwarding it here is the only way the
   * failure survives in `logs/main.log` for a later diagnosis.
   */
  ipcMain.on(IPC.appRendererError, (event, payload: unknown) => {
    // Both the launcher and the overlay can crash, and both load `app://`.
    assertMusicSender(event)
    const parsed = RendererErrorSchema.safeParse(payload)
    if (!parsed.success) return
    const { surface, message, stack, componentStack } = parsed.data
    const senderUrl = event.senderFrame?.url ?? 'unknown'
    log.error(
      `[renderer] ${surface} crashed: ${message}\n` +
        `url: ${senderUrl}\n` +
        `stack: ${stack || '(none)'}\n` +
        `componentStack: ${componentStack || '(none)'}`,
    )
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
