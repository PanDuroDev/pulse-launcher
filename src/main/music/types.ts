/**
 * Main-process shape of a track after a scan. The renderer never sees this: it
 * receives the sanitised `MusicTrack` from `shared/types`, where `filePath` is
 * replaced by an `app://` stream URL so a compromised renderer cannot read
 * arbitrary paths.
 */
export interface StoredMusicTrack {
  id: string
  title: string
  artist: string
  album: string
  durationMs: number
  filePath: string
  /** File name inside the music artwork root, or null when the tag had no cover. */
  artworkFile: string | null
  /** Human label for the folder the track came from ("Demo", the folder name…). */
  folder: string
  /** Root that owns this track; null for the built-in demo fixtures. */
  folderPath?: string
  /** Epoch ms. `0` for demo fixtures so they never look like recent imports. */
  addedAt: number
}

export interface MusicLibraryFile {
  version: number
  folders: string[]
  tracks: StoredMusicTrack[]
  scannedAt: number
}
