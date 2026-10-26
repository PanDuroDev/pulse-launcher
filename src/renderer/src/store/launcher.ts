import { create } from 'zustand'
import type {
  GameRunState,
  GameSource,
  GameSummary,
  RunningGameInfo,
  ScanProgress,
  ScanResult,
  Settings,
  SettingsUpdate,
} from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

type Status = 'loading' | 'ready' | 'error'

interface LauncherState {
  games: GameSummary[]
  settings: Settings
  selectedId: string | null
  status: Status
  error: string | null
  refreshing: boolean
  staleSources: GameSource[]
  scanProgress: Partial<Record<GameSource, ScanProgress>>
  initialize: () => Promise<void>
  refresh: () => Promise<ScanResult | null>
  select: (gameId: string) => void
  receiveGames: (games: GameSummary[]) => void
  receiveRunning: (games: RunningGameInfo[]) => void
  receiveScanProgress: (progress: ScanProgress) => void
  receiveStaleSources: (sources: GameSource[]) => void
  setSettings: (settings: Settings) => void
  updateSettings: (update: SettingsUpdate) => Promise<Settings>
}

function pickSelection(games: GameSummary[], current: string | null): string | null {
  if (current && games.some((game) => game.id === current)) return current
  const running = games.find((game) => game.running)
  if (running) return running.id
  const recent = [...games]
    .filter((game) => game.lastPlayedAt)
    .sort((left, right) => (right.lastPlayedAt ?? 0) - (left.lastPlayedAt ?? 0))[0]
  return recent?.id ?? games[0]?.id ?? null
}

/**
 * Selection changes on every focus move, so the write is coalesced. A hidden
 * launcher can be quit from the tray without another render, hence the flush on
 * `pagehide`.
 */
const SELECTION_SAVE_DELAY_MS = 400

let pendingSelection: { id: string | null } | null = null
let selectionTimer: number | null = null
let selectionFlushBound = false

function flushSelection(): void {
  if (selectionTimer !== null) {
    window.clearTimeout(selectionTimer)
    selectionTimer = null
  }
  const pending = pendingSelection
  pendingSelection = null
  if (!pending) return
  void window.launcher.selection.set(pending.id).catch(() => undefined)
}

function saveSelectionSoon(id: string | null): void {
  pendingSelection = { id }
  if (selectionTimer !== null) window.clearTimeout(selectionTimer)
  selectionTimer = window.setTimeout(flushSelection, SELECTION_SAVE_DELAY_MS)
}

function bindSelectionFlush(): void {
  if (selectionFlushBound || typeof window === 'undefined') return
  selectionFlushBound = true
  window.addEventListener('pagehide', flushSelection)
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sameRunState(
  left: GameRunState | undefined,
  right: GameRunState | undefined,
): boolean {
  if (!left || !right) return left === right
  return (
    left.confidence === right.confidence &&
    left.ambiguous === right.ambiguous &&
    left.processCount === right.processCount
  )
}

export const useLauncherStore = create<LauncherState>((set, get) => ({
  games: [],
  settings: DEFAULT_SETTINGS,
  selectedId: null,
  status: 'loading',
  error: null,
  refreshing: false,
  staleSources: [],
  scanProgress: {},

  initialize: async () => {
    set({ status: 'loading', error: null })
    bindSelectionFlush()
    try {
      const [settings, games, staleSources, storedSelection] = await Promise.all([
        window.launcher.settings.get(),
        window.launcher.catalog.list(),
        window.launcher.catalog.staleSources(),
        window.launcher.selection.get(),
      ])
      set((state) => ({
        settings,
        games,
        status: 'ready',
        selectedId: pickSelection(games, state.selectedId ?? storedSelection),
        staleSources,
      }))
      if (games.length === 0) {
        set({ refreshing: true })
        void get()
          .refresh()
          .catch(() => undefined)
      }
    } catch (error) {
      set({ status: 'error', error: messageFrom(error) })
    }
  },

  refresh: async () => {
    set({ refreshing: true, scanProgress: {}, error: null })
    try {
      const result = await window.launcher.catalog.refresh()
      set((state) => ({
        games: result.games,
        refreshing: false,
        selectedId: pickSelection(result.games, state.selectedId),
        staleSources: result.staleSources,
      }))
      return result
    } catch (error) {
      set({ refreshing: false, error: messageFrom(error) })
      return null
    }
  },

  select: (gameId) => {
    if (get().selectedId === gameId) return
    set({ selectedId: gameId })
    saveSelectionSoon(gameId)
  },

  receiveGames: (games) =>
    set((state) => ({
      games,
      status: 'ready',
      selectedId: pickSelection(games, state.selectedId),
    })),

  receiveRunning: (infos) =>
    set((state) => {
      const byId = new Map(infos.map((info) => [info.gameId, info]))
      let changed = false
      const games = state.games.map((game) => {
        const info = byId.get(game.id)
        const running = Boolean(info)
        const runState: GameRunState | undefined = info
          ? {
              confidence: info.confidence,
              ambiguous: info.ambiguous,
              processCount: info.processCount,
            }
          : undefined
        if (game.running === running && sameRunState(game.runState, runState)) {
          return game
        }
        changed = true
        return { ...game, running, runState }
      })
      return changed ? { games } : state
    }),

  receiveScanProgress: (progress) =>
    set((state) => ({
      scanProgress: { ...state.scanProgress, [progress.source]: progress },
    })),

  receiveStaleSources: (sources) => set({ staleSources: sources }),

  setSettings: (settings) => set({ settings }),

  updateSettings: async (update) => {
    const settings = await window.launcher.settings.update(update)
    set({ settings })
    return settings
  },
}))
