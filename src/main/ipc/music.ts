import { dialog, ipcMain, shell } from 'electron'
import type { BrowserWindow } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc'
import type {
  MusicCommand,
  MusicLibrarySnapshot,
  MusicOnlineSearchResult,
  MusicOverlayAction,
  MusicOverlaySettings,
  MusicOverlayState,
  MusicYouTubeResolveResult,
  MusicYouTubeSearchResult,
  MusicYouTubeStatus,
} from '@shared/types'
import { log } from '../logger'
import type { MusicLibraryService } from '../music/library'
import type { MusicOverlay } from '../music/overlay'
import type { MusicConfigStore } from '../music/config'
import type { MusicOnlineService } from '../music/online/service'
import type { MusicYouTubeService } from '../music/youtube/service'
import { youtubeWatchUrl } from '../music/youtube/parse'

const MusicFolderSchema = z.object({ path: z.string().min(1).max(1024) }).strict()

const MusicOverlayUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    alwaysOnTop: z.boolean().optional(),
    position: z
      .enum([
        'top-left',
        'top-center',
        'top-right',
        'bottom-left',
        'bottom-center',
        'bottom-right',
      ])
      .optional(),
    shortcut: z.string().max(64).optional(),
  })
  .strict()

const OnlineSearchSchema = z
  .object({ query: z.string().trim().min(2).max(120) })
  .strict()

const YouTubeSearchSchema = z
  .object({ query: z.string().trim().min(2).max(120) })
  .strict()

const YouTubeVideoSchema = z
  .object({ videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/) })
  .strict()

const YouTubeUpdateSchema = z
  .object({
    apiKey: z.string().max(200).optional(),
    ytDlpPath: z.string().max(1024).optional(),
    ffmpegPath: z.string().max(1024).optional(),
    cacheLimitMb: z.number().int().min(100).max(20_000).optional(),
  })
  .strict()

const MusicOverlayStateSchema = z
  .object({
    status: z.enum(['idle', 'loading', 'playing', 'paused', 'error']),
    track: z
      .object({
        id: z.string().max(200),
        title: z.string().max(400),
        artist: z.string().max(400),
        album: z.string().max(400),
        artworkUrl: z.string().max(2048).nullable(),
        provider: z
          .enum(['itunes', 'deezer', 'audius', 'openverse', 'archive', 'youtube'])
          .optional(),
        publisher: z.string().max(200).optional(),
        streamKind: z.enum(['preview', 'full']).optional(),
        license: z.string().max(200).nullable().optional(),
      })
      .strict()
      .nullable(),
    positionMs: z.number().min(0).max(86_400_000),
    durationMs: z.number().min(0).max(86_400_000),
    volume: z.number().min(0).max(1),
    muted: z.boolean(),
    repeat: z.enum(['off', 'all', 'one']),
    shuffle: z.boolean(),
  })
  .strict()

type MusicIpcEvent = Electron.IpcMainInvokeEvent | Electron.IpcMainEvent

interface MusicIpcDependencies {
  assertMusicSender: (event: MusicIpcEvent) => void
  getMainWindow: () => BrowserWindow | null
  music: MusicLibraryService
  musicOnline: MusicOnlineService
  musicYouTube: MusicYouTubeService
  musicConfig: MusicConfigStore
  getMusicOverlay: () => MusicOverlay | null
  getOverlayState: () => MusicOverlayState | null
  setOverlayState: (state: MusicOverlayState) => void
  send: (channel: string, payload: unknown) => void
}

/** Registers music, YouTube, and overlay IPC handlers with injected application dependencies. */
export function registerMusicIpc({
  assertMusicSender,
  getMainWindow,
  music,
  musicOnline,
  musicYouTube,
  musicConfig,
  getMusicOverlay,
  getOverlayState,
  setOverlayState,
  send,
}: MusicIpcDependencies): void {
  const getOverlay = getMusicOverlay

  ipcMain.handle(IPC.musicList, (event): MusicLibrarySnapshot => {
    assertMusicSender(event)
    return music.snapshot
  })

  ipcMain.handle(
    IPC.musicOnlineSearch,
    async (event, payload: unknown): Promise<MusicOnlineSearchResult> => {
      assertMusicSender(event)
      const { query } = OnlineSearchSchema.parse(payload)
      return musicOnline.search(query)
    },
  )

  ipcMain.handle(
    IPC.musicYouTubeSearch,
    async (event, payload: unknown): Promise<MusicYouTubeSearchResult> => {
      assertMusicSender(event)
      const { query } = YouTubeSearchSchema.parse(payload)
      return musicYouTube.search(query)
    },
  )

  ipcMain.handle(
    IPC.musicYouTubeResolve,
    async (event, payload: unknown): Promise<MusicYouTubeResolveResult> => {
      assertMusicSender(event)
      const { videoId } = YouTubeVideoSchema.parse(payload)
      return musicYouTube.resolve(videoId)
    },
  )

  ipcMain.handle(IPC.musicYouTubeCancel, async (event, payload: unknown): Promise<boolean> => {
    assertMusicSender(event)
    const { videoId } = YouTubeVideoSchema.parse(payload)
    return musicYouTube.cancel(videoId)
  })

  ipcMain.handle(
    IPC.musicYouTubeRemove,
    async (event, payload: unknown): Promise<MusicYouTubeStatus> => {
      assertMusicSender(event)
      const { videoId } = YouTubeVideoSchema.parse(payload)
      return musicYouTube.removeCached(videoId)
    },
  )

  ipcMain.handle(IPC.musicYouTubeClear, async (event): Promise<MusicYouTubeStatus> => {
    assertMusicSender(event)
    return musicYouTube.clearCache()
  })

  ipcMain.handle(IPC.musicYouTubeStatus, async (event): Promise<MusicYouTubeStatus> => {
    assertMusicSender(event)
    return musicYouTube.status()
  })

  ipcMain.handle(
    IPC.musicYouTubeUpdate,
    async (event, payload: unknown): Promise<MusicYouTubeStatus> => {
      assertMusicSender(event)
      return musicYouTube.updateSettings(YouTubeUpdateSchema.parse(payload))
    },
  )

  ipcMain.handle(IPC.musicYouTubeOpen, async (event, payload: unknown): Promise<void> => {
    assertMusicSender(event)
    const { videoId } = YouTubeVideoSchema.parse(payload)
    await shell.openExternal(youtubeWatchUrl(videoId))
  })

  ipcMain.handle(IPC.musicRescan, async (event): Promise<MusicLibrarySnapshot> => {
    assertMusicSender(event)
    return music.rescan()
  })

  ipcMain.handle(IPC.musicCancelScan, (event): MusicLibrarySnapshot => {
    assertMusicSender(event)
    return music.cancelScan()
  })

  ipcMain.handle(IPC.musicAddFolder, async (event): Promise<MusicLibrarySnapshot> => {
    assertMusicSender(event)
    const window = getMainWindow()
    const result = window
      ? await dialog.showOpenDialog(window, {
          title: 'Add a music folder',
          buttonLabel: 'Add folder',
          properties: ['openDirectory', 'multiSelections'],
        })
      : await dialog.showOpenDialog({
          title: 'Add a music folder',
          buttonLabel: 'Add folder',
          properties: ['openDirectory', 'multiSelections'],
        })

    if (result.canceled || result.filePaths.length === 0) return music.snapshot
    let snapshot = music.snapshot
    for (const folder of result.filePaths) {
      snapshot = await music.addFolder(folder)
    }
    return snapshot
  })

  ipcMain.handle(
    IPC.musicRemoveFolder,
    async (event, payload: unknown): Promise<MusicLibrarySnapshot> => {
      assertMusicSender(event)
      const parsed = MusicFolderSchema.parse(payload)
      return music.removeFolder(parsed.path)
    },
  )

  ipcMain.handle(IPC.musicOverlayGet, (event): MusicOverlaySettings => {
    assertMusicSender(event)
    return musicConfig.get()
  })

  ipcMain.handle(
    IPC.musicOverlayUpdate,
    async (event, payload: unknown): Promise<MusicOverlaySettings> => {
      assertMusicSender(event)
      const parsed = MusicOverlayUpdateSchema.parse(payload)
      const updated = await musicConfig.update(parsed)
      await getOverlay()?.applySettings(updated)
      return updated
    },
  )

  ipcMain.handle(IPC.musicOverlayToggle, async (event): Promise<boolean> => {
    assertMusicSender(event)
    const overlay = getOverlay()
    if (!overlay) return false
    return overlay.toggle()
  })

  ipcMain.handle(IPC.musicOverlayStateGet, (event): MusicOverlayState | null => {
    assertMusicSender(event)
    return getOverlayState()
  })

  ipcMain.on(IPC.musicOverlayState, (event, payload: unknown) => {
    assertMusicSender(event)
    const parsed = MusicOverlayStateSchema.safeParse(payload)
    if (!parsed.success) {
      log.warn('music: rejected overlay state', parsed.error.issues[0]?.message)
      return
    }
    setOverlayState(parsed.data)
    getOverlay()?.updateState(parsed.data)
  })

  ipcMain.on(IPC.musicOverlayAction, (event, payload: unknown) => {
    assertMusicSender(event)
    const action = payload as MusicOverlayAction | undefined
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') return

    const overlay = getOverlay()
    if (action.type === 'close') {
      overlay?.dismiss()
      return
    }
    if (action.type === 'focus') {
      overlay?.focusMainWindow()
      return
    }
    if (action.type === 'seek') {
      const positionMs = Number(action.positionMs)
      if (!Number.isFinite(positionMs) || positionMs < 0) return
      send(IPC.musicOverlayCommand, { type: 'seek', positionMs } satisfies MusicCommand)
      return
    }
    send(IPC.musicOverlayCommand, { type: action.type } satisfies MusicCommand)
  })
}
