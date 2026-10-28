import { describe, expect, it } from 'vitest'
import type { GameSummary } from '@shared/contracts/games'
import { FORCE_QUIT_GRACE_MS } from '@shared/game-control'
import { IDLE_GAME_ACTION } from '@/lib/game-actions'
import type { GameActionState } from '@/lib/game-actions'
import { deriveLauncherViewModel, type LauncherViewModelInput } from './launcher-view-model'

const selectedGame: GameSummary = {
  id: 'game-1',
  source: 'manual',
  name: 'Test Game',
  installed: true,
  running: false,
  favorite: false,
  accent: '#123456',
}

const defaults: LauncherViewModelInput = {
  status: 'ready',
  games: [],
  refreshing: false,
  pendingLaunch: null,
  selected: undefined,
  gameAction: IDLE_GAME_ACTION,
  actionClock: 0,
  searchOpen: false,
  addOpen: false,
  addMode: 'game',
  detailsGame: null,
  musicOpen: false,
  settingsOpen: false,
  powerOpen: false,
}

describe('deriveLauncherViewModel', () => {
  it('distinguishes loading, empty, and empty-error library states', () => {
    const loading = deriveLauncherViewModel({ ...defaults, status: 'loading' })
    expect(loading).toMatchObject({ activePage: 'loading', showLoading: true, showError: false, showEmpty: false })

    const empty = deriveLauncherViewModel(defaults)
    expect(empty).toMatchObject({ activePage: 'empty', showLoading: false, showError: false, showEmpty: true })

    const error = deriveLauncherViewModel({ ...defaults, status: 'error' })
    expect(error).toMatchObject({ activePage: 'empty', showLoading: false, showError: true, showEmpty: true })
  })

  it('keeps the search route ahead of other open-page flags', () => {
    const view = deriveLauncherViewModel({
      ...defaults,
      searchOpen: true,
      addOpen: true,
      addMode: 'image',
      detailsGame: selectedGame,
      musicOpen: true,
      settingsOpen: true,
    })

    expect(view.activePage).toBe('search')
    expect(view.title).toBe('Search')
    expect(view.showTools).toBe(false)
    expect(view.showHintBar).toBe(false)
  })

  it('uses the right title for picker mode and later pages', () => {
    expect(deriveLauncherViewModel({ ...defaults, addOpen: true, addMode: 'path' }))
      .toMatchObject({ activePage: 'add', title: 'Game file' })
    expect(deriveLauncherViewModel({ ...defaults, addOpen: true, addMode: 'image' }))
      .toMatchObject({ activePage: 'add', title: 'Cover art' })
    expect(deriveLauncherViewModel({ ...defaults, detailsGame: selectedGame }))
      .toMatchObject({ activePage: 'details', title: 'Game details' })
    expect(deriveLauncherViewModel({ ...defaults, musicOpen: true }))
      .toMatchObject({ activePage: 'music', title: 'Music' })
    expect(deriveLauncherViewModel({ ...defaults, settingsOpen: true }))
      .toMatchObject({ activePage: 'settings', title: 'Settings' })
  })

  it('does not hide library tools behind the power overlay, but hides the hint bar', () => {
    const view = deriveLauncherViewModel({ ...defaults, powerOpen: true })
    expect(view.activePage).toBe('library')
    expect(view.title).toBe('Library')
    expect(view.showTools).toBe(true)
    expect(view.showHintBar).toBe(false)
  })

  it('marks a selected game as launching only when the pending id matches', () => {
    const matching = deriveLauncherViewModel({
      ...defaults,
      games: [selectedGame],
      selected: selectedGame,
      pendingLaunch: { id: selectedGame.id },
    })
    expect(matching.markMood.state).toBe('burst')
  })

  it('shows the force-quit grace countdown only for the selected game action', () => {
    const action: GameActionState = {
      kind: 'close-requested',
      gameId: selectedGame.id,
      at: 10_000,
    }
    const beforeFirstTick = deriveLauncherViewModel({
      ...defaults,
      games: [selectedGame],
      selected: selectedGame,
      gameAction: action,
    })
    expect(beforeFirstTick.selectedForceRemaining).toBe(FORCE_QUIT_GRACE_MS)

    const ticking = deriveLauncherViewModel({
      ...defaults,
      games: [selectedGame],
      selected: selectedGame,
      gameAction: action,
      actionClock: 12_000,
    })
    expect(ticking.selectedAction).toEqual(action)
    expect(ticking.selectedForceRemaining).toBe(FORCE_QUIT_GRACE_MS - 2_000)

    const anotherGame = deriveLauncherViewModel({
      ...defaults,
      games: [selectedGame],
      selected: { ...selectedGame, id: 'game-2' },
      gameAction: action,
      actionClock: 12_000,
    })
    expect(anotherGame.selectedAction).toBe(IDLE_GAME_ACTION)
    expect(anotherGame.selectedForceRemaining).toBe(0)
  })

  it('falls through to the next available page if details has no game snapshot', () => {
    const view = deriveLauncherViewModel({
      ...defaults,
      musicOpen: true,
      settingsOpen: true,
      detailsGame: null,
    })

    expect(view.activePage).toBe('music')
    expect(view.title).toBe('Music')
  })

  it('keeps the populated library route when no page overlay is active', () => {
    const view = deriveLauncherViewModel({
      ...defaults,
      games: [selectedGame],
      selected: selectedGame,
    })

    expect(view.activePage).toBe('library')
    expect(view.showTools).toBe(true)
    expect(view.showHintBar).toBe(true)
  })

})
