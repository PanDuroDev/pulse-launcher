import { create } from 'zustand'
import type {
  MusicFolder,
  MusicLibrarySnapshot,
  MusicOverlaySettings,
  MusicTrack,
} from '@shared/types'

interface MusicState {
  tracks: MusicTrack[]
  folders: MusicFolder[]
  scanning: boolean
  scannedFiles: number
  skippedFiles: number
  scanError: string | null
  scannedAt: number | null
  loading: boolean
  /** Null until the first `initialize()` resolves; the page hides the overlay controls until then. */
  overlay: MusicOverlaySettings | null
  initialize: () => Promise<void>
  addFolder: () => Promise<void>
  rescan: () => Promise<void>
  removeFolder: (folder: string) => Promise<void>
  updateOverlay: (patch: Partial<MusicOverlaySettings>) => Promise<void>
  toggleOverlay: () => Promise<void>
}

let subscribed = false

export const useMusicStore = create<MusicState>()((set) => {
  const receive = (snapshot: MusicLibrarySnapshot): void => {
    set({
      tracks: snapshot.tracks,
      folders: snapshot.folders,
      scanning: snapshot.scanning,
      scannedFiles: snapshot.scannedFiles,
      skippedFiles: snapshot.skippedFiles,
      scanError: snapshot.scanError,
      scannedAt: snapshot.scannedAt,
    })
  }

  return {
    tracks: [],
    folders: [],
    scanning: false,
    scannedFiles: 0,
    skippedFiles: 0,
    scanError: null,
    scannedAt: null,
    loading: true,
    overlay: null,

    initialize: async () => {
      if (subscribed) return
      subscribed = true
      window.launcher.music.onChanged(receive)
      try {
        const [snapshot, overlay] = await Promise.all([
          window.launcher.music.list(),
          window.launcher.music.overlay.get(),
        ])
        receive(snapshot)
        set({ overlay, loading: false })
      } catch {
        set({ loading: false })
      }
    },

    addFolder: async () => {
      const snapshot = await window.launcher.music.addFolder()
      receive(snapshot)
    },

    rescan: async () => {
      const snapshot = await window.launcher.music.rescan()
      receive(snapshot)
    },

    removeFolder: async (folder) => {
      const snapshot = await window.launcher.music.removeFolder(folder)
      receive(snapshot)
    },

    updateOverlay: async (patch) => {
      const overlay = await window.launcher.music.overlay.update(patch)
      set({ overlay })
    },

    toggleOverlay: async () => {
      await window.launcher.music.overlay.toggle()
    },
  }
})
