import type { Dispatch, SetStateAction } from 'react'
import type { GameSummary } from '@shared/contracts/games'
import type { Settings } from '@shared/contracts/settings'
import type { GameDetailsDraft } from '@/components/launcher/GameDetailsPage'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { SearchPage } from '@/components/launcher/SearchPage'
import { AddGamePage } from '@/components/launcher/AddGamePage'
import { GameDetailsPage } from '@/components/launcher/GameDetailsPage'
import { MusicPage } from '@/components/launcher/MusicPage'
import { SettingsPage } from '@/components/launcher/SettingsPage'
import { LibraryLoading } from '@/components/launcher/LibraryLoading'
import { EmptyLibrary } from '@/components/launcher/EmptyLibrary'
import { LibraryHome } from '@/components/launcher/LibraryHome'
import type { GameActionState } from '@/lib/game-actions'

type AddMode = 'game' | 'path' | 'image'
type LauncherStatus = 'loading' | 'ready' | 'error'

interface LibraryRow {
  id: string
  title: string
  games: GameSummary[]
}

interface PendingLaunch {
  id: string
  name: string
}

interface LauncherPageState {
  searchOpen: boolean
  searchQuery: string
  addOpen: boolean
  addMode: AddMode
  detailsGame: GameSummary | null
  musicOpen: boolean
  settingsOpen: boolean
  showLoading: boolean
  showEmpty: boolean
  showError: boolean
  error: string | null
  status: LauncherStatus
  refreshing: boolean
  manualDraft: GameDetailsDraft | null
  detailsSaving: boolean
  detailsRemoving: boolean
}

interface LauncherLibraryState {
  games: GameSummary[]
  selected: GameSummary | undefined
  rows: LibraryRow[]
  settings: Settings
  pendingLaunch: PendingLaunch | null
  selectedAction: GameActionState
  selectedForceRemaining: number
}

interface LauncherPageActions {
  closeSearch: () => void
  closeAddGame: () => void
  handleSelect: (game: GameSummary, focusKey: string) => void
  handleLaunch: (game: GameSummary) => void | Promise<void>
  handleGameAdded: (game: GameSummary) => void
  handlePickedArtwork: (path: string) => void
  handlePickedPath: (path: string) => void
  setSearchQuery: (query: string) => void
  setManualDraft: Dispatch<SetStateAction<GameDetailsDraft | null>>
  handleSaveDetails: () => void | Promise<void>
  handleRemoveDetails: () => void | Promise<void>
  closeDetails: () => void
  openDetails: (game: GameSummary) => void
  handleToggleFavorite: (game: GameSummary) => void | Promise<void>
  openDetailsPicker: (mode: 'path' | 'image') => void
  closeMusic: () => void
  closeSettings: () => void
  handleAddFromSettings: () => void
  handleRefresh: () => void | Promise<void>
  handleAddGame: () => void
  handleFocusGame: (game: GameSummary) => void | Promise<void>
  handleCloseGame: (game: GameSummary) => void | Promise<void>
  handleForceQuit: (game: GameSummary) => void | Promise<void>
  handleCancelForceQuit: (game?: GameSummary) => void
  handleCycleSort: () => void
}

interface LauncherPageContentProps {
  page: LauncherPageState
  library: LauncherLibraryState
  actions: LauncherPageActions
}

/** Renders the active page or the library's loading, empty, and populated states. */
export function LauncherPageContent({
  page,
  library,
  actions,
}: LauncherPageContentProps) {
  return page.searchOpen ? (
    <ErrorBoundary
      surface="launcher"
      onBack={{ label: 'Back to library', onClick: actions.closeSearch }}
    >
      <SearchPage
        games={library.games}
        query={page.searchQuery}
        onQueryChange={actions.setSearchQuery}
        onBack={actions.closeSearch}
        onSelect={actions.handleSelect}
        onLaunch={(game) => void actions.handleLaunch(game)}
      />
    </ErrorBoundary>
  ) : page.addOpen ? (
    <ErrorBoundary
      surface="launcher"
      onBack={{ label: 'Back to library', onClick: actions.closeAddGame }}
    >
      <AddGamePage
        mode={page.addMode}
        onBack={actions.closeAddGame}
        onAdded={page.addMode === 'game' ? actions.handleGameAdded : undefined}
        onPicked={
          page.addMode === 'image'
            ? actions.handlePickedArtwork
            : page.addMode === 'path'
              ? actions.handlePickedPath
              : undefined
        }
      />
    </ErrorBoundary>
  ) : page.detailsGame ? (
    <ErrorBoundary
      surface="launcher"
      onBack={{ label: 'Back to library', onClick: actions.closeDetails }}
    >
      <GameDetailsPage
        key={page.detailsGame.id}
        game={page.detailsGame}
        pending={Boolean(
          library.pendingLaunch && library.pendingLaunch.id === page.detailsGame.id,
        )}
        action={library.selectedAction}
        draft={
          page.manualDraft && page.manualDraft.gameId === page.detailsGame.id
            ? page.manualDraft
            : null
        }
        saving={page.detailsSaving}
        removing={page.detailsRemoving}
        onDraftChange={(patch) =>
          actions.setManualDraft((current) =>
            current ? { ...current, ...patch } : current,
          )
        }
        onSave={() => void actions.handleSaveDetails()}
        onRemove={() => void actions.handleRemoveDetails()}
        onBack={actions.closeDetails}
        onLaunch={(game) => void actions.handleLaunch(game)}
        onToggleFavorite={(game) => void actions.handleToggleFavorite(game)}
        onPickExecutable={() => actions.openDetailsPicker('path')}
        onPickArtwork={() => actions.openDetailsPicker('image')}
      />
    </ErrorBoundary>
  ) : page.musicOpen ? (
    <ErrorBoundary
      surface="launcher"
      onBack={{ label: 'Back to library', onClick: actions.closeMusic }}
    >
      <MusicPage onBack={actions.closeMusic} />
    </ErrorBoundary>
  ) : page.settingsOpen ? (
    <ErrorBoundary
      surface="launcher"
      onBack={{ label: 'Back to library', onClick: actions.closeSettings }}
    >
      <SettingsPage
        onBack={actions.closeSettings}
        onAddGame={actions.handleAddFromSettings}
      />
    </ErrorBoundary>
  ) : page.showLoading ? (
    <LibraryLoading scanning={page.refreshing || page.status === 'loading'} />
  ) : page.showEmpty ? (
    <EmptyLibrary
      error={page.showError ? page.error : null}
      onRefresh={() => void actions.handleRefresh()}
      onAddGame={actions.handleAddGame}
    />
  ) : (
    <LibraryHome
      game={library.selected}
      pending={Boolean(
        library.pendingLaunch &&
          library.selected &&
          library.pendingLaunch.id === library.selected.id,
      )}
      reducedMotion={library.settings.motion === 'reduced'}
      action={library.selectedAction}
      forceQuitRemainingMs={library.selectedForceRemaining}
      rows={library.rows}
      librarySort={library.settings.librarySort}
      onLaunch={(game) => void actions.handleLaunch(game)}
      onFocus={(game) => void actions.handleFocusGame(game)}
      onClose={(game) => void actions.handleCloseGame(game)}
      onForceQuit={(game) => void actions.handleForceQuit(game)}
      onCancelForce={actions.handleCancelForceQuit}
      onToggleFavorite={(game) => void actions.handleToggleFavorite(game)}
      onDetails={actions.openDetails}
      onSelect={actions.handleSelect}
      onCycleSort={actions.handleCycleSort}
    />
  )
}
