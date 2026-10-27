import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AddManualResult,
  AppInfo,
  ArtKind,
  ArtworkResult,
  DirectoryListing,
  FavoriteResult,
  GameControlResult,
  GameSource,
  GameSummary,
  LaunchResult,
  LauncherApi,
  MusicCommand,
  MusicLibrarySnapshot,
  MusicOnlineSearchResult,
  MusicOverlayAction,
  MusicOverlaySettings,
  MusicOverlayState,
  MusicYouTubeResolveResult,
  MusicYouTubeSearchResult,
  MusicYouTubeStatus,
  MusicYouTubeUpdate,
  PickerKind,
  PickerRoots,
  RemoveManualResult,
  RunningGameInfo,
  ScanProgress,
  ScanResult,
  SelectionResult,
  Settings,
  SettingsUpdate,
  UpdateManualGameInput,
  UpdateManualResult,
} from '@shared/types'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

const api: LauncherApi = {
  catalog: {
    list: () => ipcRenderer.invoke(IPC.catalogList) as Promise<GameSummary[]>,
    staleSources: () =>
      ipcRenderer.invoke(IPC.catalogStaleSources) as Promise<GameSource[]>,
    refresh: () => ipcRenderer.invoke(IPC.catalogRefresh) as Promise<ScanResult>,
    artwork: (gameId: string, kind: ArtKind) =>
      ipcRenderer.invoke(IPC.catalogArtwork, { gameId, kind }) as Promise<ArtworkResult>,
    toggleFavorite: (gameId: string) =>
      ipcRenderer.invoke(IPC.catalogToggleFavorite, { gameId }) as Promise<FavoriteResult>,
    onChanged: (listener: (games: GameSummary[]) => void) =>
      subscribe<GameSummary[]>(IPC.catalogChanged, listener),
    onRunningChanged: (listener: (games: RunningGameInfo[]) => void) =>
      subscribe<RunningGameInfo[]>(IPC.catalogRunningChanged, listener),
    onScanProgress: (listener: (progress: ScanProgress) => void) =>
      subscribe<ScanProgress>(IPC.catalogScanProgress, listener),
    onStaleChanged: (listener: (sources: GameSource[]) => void) =>
      subscribe<GameSource[]>(IPC.catalogStaleChanged, listener),
  },
  launch: (gameId: string) =>
    ipcRenderer.invoke(IPC.launchGame, { gameId }) as Promise<LaunchResult>,
  game: {
    focus: (gameId: string) =>
      ipcRenderer.invoke(IPC.gameFocus, { gameId }) as Promise<GameControlResult>,
    close: (gameId: string) =>
      ipcRenderer.invoke(IPC.gameClose, { gameId }) as Promise<GameControlResult>,
    forceClose: (gameId: string, confirm: boolean) =>
      ipcRenderer.invoke(IPC.gameForceClose, {
        gameId,
        confirm,
      }) as Promise<GameControlResult>,
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet) as Promise<Settings>,
    update: (update: SettingsUpdate) =>
      ipcRenderer.invoke(IPC.settingsUpdate, update) as Promise<Settings>,
    removeManual: (gameId: string) =>
      ipcRenderer.invoke(IPC.settingsRemoveManual, { gameId }) as Promise<RemoveManualResult>,
    onChanged: (listener: (settings: Settings) => void) =>
      subscribe<Settings>(IPC.settingsChanged, listener),
  },
  selection: {
    get: () => ipcRenderer.invoke(IPC.selectionGet) as Promise<string | null>,
    set: (gameId: string | null) =>
      ipcRenderer.invoke(IPC.selectionSet, { gameId }) as Promise<SelectionResult>,
  },
  library: {
    roots: () => ipcRenderer.invoke(IPC.libraryRoots) as Promise<PickerRoots>,
    list: (directory: string, kind: PickerKind = 'game') =>
      ipcRenderer.invoke(IPC.libraryList, { path: directory, kind }) as Promise<DirectoryListing>,
    add: (filePath: string) =>
      ipcRenderer.invoke(IPC.libraryAdd, { path: filePath }) as Promise<AddManualResult>,
    update: (input: UpdateManualGameInput) =>
      ipcRenderer.invoke(IPC.libraryUpdate, input) as Promise<UpdateManualResult>,
  },
  music: {
    list: () => ipcRenderer.invoke(IPC.musicList) as Promise<MusicLibrarySnapshot>,
    rescan: () => ipcRenderer.invoke(IPC.musicRescan) as Promise<MusicLibrarySnapshot>,
    cancelScan: () => ipcRenderer.invoke(IPC.musicCancelScan) as Promise<MusicLibrarySnapshot>,
    addFolder: () => ipcRenderer.invoke(IPC.musicAddFolder) as Promise<MusicLibrarySnapshot>,
    removeFolder: (folder: string) =>
      ipcRenderer.invoke(IPC.musicRemoveFolder, { folder }) as Promise<MusicLibrarySnapshot>,
    onChanged: (listener: (snapshot: MusicLibrarySnapshot) => void) =>
      subscribe<MusicLibrarySnapshot>(IPC.musicChanged, listener),
    online: {
      search: (query: string) =>
        ipcRenderer.invoke(IPC.musicOnlineSearch, { query }) as Promise<MusicOnlineSearchResult>,
    },
    youtube: {
      search: (query: string) =>
        ipcRenderer.invoke(IPC.musicYouTubeSearch, { query }) as Promise<MusicYouTubeSearchResult>,
      resolve: (videoId: string) =>
        ipcRenderer.invoke(IPC.musicYouTubeResolve, { videoId }) as Promise<MusicYouTubeResolveResult>,
      cancel: (videoId: string) =>
        ipcRenderer.invoke(IPC.musicYouTubeCancel, { videoId }) as Promise<boolean>,
      status: () => ipcRenderer.invoke(IPC.musicYouTubeStatus) as Promise<MusicYouTubeStatus>,
      updateSettings: (update: MusicYouTubeUpdate) =>
        ipcRenderer.invoke(IPC.musicYouTubeUpdate, update) as Promise<MusicYouTubeStatus>,
      removeCached: (videoId: string) =>
        ipcRenderer.invoke(IPC.musicYouTubeRemove, { videoId }) as Promise<MusicYouTubeStatus>,
      clearCache: () => ipcRenderer.invoke(IPC.musicYouTubeClear) as Promise<MusicYouTubeStatus>,
      open: (videoId: string) =>
        ipcRenderer.invoke(IPC.musicYouTubeOpen, { videoId }) as Promise<void>,
    },
    overlay: {
      get: () => ipcRenderer.invoke(IPC.musicOverlayGet) as Promise<MusicOverlaySettings>,
      update: (update: Partial<MusicOverlaySettings>) =>
        ipcRenderer.invoke(IPC.musicOverlayUpdate, update) as Promise<MusicOverlaySettings>,
      toggle: () => ipcRenderer.invoke(IPC.musicOverlayToggle) as Promise<boolean>,
      state: () => ipcRenderer.invoke(IPC.musicOverlayStateGet) as Promise<MusicOverlayState | null>,
      publish: (state: MusicOverlayState) => ipcRenderer.send(IPC.musicOverlayState, state),
      onCommand: (listener: (command: MusicCommand) => void) =>
        subscribe<MusicCommand>(IPC.musicOverlayCommand, listener),
      onState: (listener: (state: MusicOverlayState) => void) =>
        subscribe<MusicOverlayState>(IPC.musicOverlayState, listener),
    },
    action: (action: MusicOverlayAction) => ipcRenderer.send(IPC.musicOverlayAction, action),
  },
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo) as Promise<AppInfo>,
    hide: () => ipcRenderer.invoke(IPC.appHide) as Promise<void>,
    quit: () => ipcRenderer.invoke(IPC.appQuit) as Promise<void>,
    openLogs: () => ipcRenderer.invoke(IPC.appOpenLogs) as Promise<void>,
    reportRendererError: (report) => ipcRenderer.send(IPC.appRendererError, report),
  },
}

contextBridge.exposeInMainWorld('launcher', api)
