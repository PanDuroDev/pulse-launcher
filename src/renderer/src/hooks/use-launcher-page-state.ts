import { useCallback, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { GameSummary } from '@shared/contracts/games'
import type { GameDetailsDraft } from '@/components/launcher/GameDetailsPage'
import type { AddMode } from '@/lib/launcher-page-types'


export interface LauncherPageState {
  settingsOpen: boolean
  setSettingsOpen: Dispatch<SetStateAction<boolean>>
  addOpen: boolean
  setAddOpen: Dispatch<SetStateAction<boolean>>
  addMode: AddMode
  setAddMode: Dispatch<SetStateAction<AddMode>>
  detailsOpen: boolean
  setDetailsOpen: Dispatch<SetStateAction<boolean>>
  detailsSnapshot: GameSummary | null
  setDetailsSnapshot: Dispatch<SetStateAction<GameSummary | null>>
  manualDraft: GameDetailsDraft | null
  setManualDraft: Dispatch<SetStateAction<GameDetailsDraft | null>>
  detailsSaving: boolean
  setDetailsSaving: Dispatch<SetStateAction<boolean>>
  detailsRemoving: boolean
  setDetailsRemoving: Dispatch<SetStateAction<boolean>>
  searchOpen: boolean
  setSearchOpen: Dispatch<SetStateAction<boolean>>
  searchQuery: string
  setSearchQuery: Dispatch<SetStateAction<string>>
  powerOpen: boolean
  setPowerOpen: Dispatch<SetStateAction<boolean>>
  musicOpen: boolean
  setMusicOpen: Dispatch<SetStateAction<boolean>>
  lastFocusKey: { current: string | null }
  rememberFocusKey: (focusKey: string) => void
}

/** Holds the launcher's page state separately from navigation side effects. */
export function useLauncherPageState(): LauncherPageState {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addMode, setAddMode] = useState<AddMode>('game')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsSnapshot, setDetailsSnapshot] = useState<GameSummary | null>(null)
  const [manualDraft, setManualDraft] = useState<GameDetailsDraft | null>(null)
  const [detailsSaving, setDetailsSaving] = useState(false)
  const [detailsRemoving, setDetailsRemoving] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [powerOpen, setPowerOpen] = useState(false)
  const [musicOpen, setMusicOpen] = useState(false)
  const lastFocusKey = useRef<string | null>(null)

  const rememberFocusKey = useCallback((focusKey: string) => {
    lastFocusKey.current = focusKey
  }, [])

  return {
    settingsOpen,
    setSettingsOpen,
    addOpen,
    setAddOpen,
    addMode,
    setAddMode,
    detailsOpen,
    setDetailsOpen,
    detailsSnapshot,
    setDetailsSnapshot,
    manualDraft,
    setManualDraft,
    detailsSaving,
    setDetailsSaving,
    detailsRemoving,
    setDetailsRemoving,
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    powerOpen,
    setPowerOpen,
    musicOpen,
    setMusicOpen,
    lastFocusKey,
    rememberFocusKey,
  }
}
