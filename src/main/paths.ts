import { app } from 'electron'
import path from 'node:path'

export const APP_SCHEME = 'app'
export const APP_HOST = 'launcher'

export interface AppPaths {
  userData: string
  logs: string
  artwork: string
  cache: string
  settings: string
  history: string
  catalog: string
  /** Root of the local music cache (demo fixtures, config, library index). */
  music: string
  /** Extracted embedded covers, served under `app://launcher/music-art/`. */
  musicArtwork: string
  musicLibrary: string
  musicConfig: string
  /** Extracted YouTube MP3 files and their metadata index. */
  musicYouTube: string
  musicYouTubeConfig: string
  /** Auto-downloaded yt-dlp and optional tools, kept out of the app bundle. */
  musicBin: string
}

export function getAppPaths(): AppPaths {
  const userData = app.getPath('userData')
  return {
    userData,
    logs: app.getPath('logs'),
    artwork: path.join(userData, 'artwork'),
    cache: path.join(userData, 'cache'),
    settings: path.join(userData, 'settings.json'),
    history: path.join(userData, 'history.json'),
    catalog: path.join(userData, 'cache', 'catalog.json'),
    music: path.join(userData, 'music'),
    musicArtwork: path.join(userData, 'music', 'artwork'),
    musicLibrary: path.join(userData, 'music', 'library.json'),
    musicConfig: path.join(userData, 'music', 'config.json'),
    musicYouTube: path.join(userData, 'music', 'youtube'),
    musicYouTubeConfig: path.join(userData, 'music', 'youtube.json'),
    musicBin: path.join(userData, 'music', 'bin'),
  }
}

export function resolveRendererRoot(): string {
  return path.join(__dirname, '../renderer')
}

export function resolveResourcePath(...segments: string[]): string {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, 'resources')
    : path.join(app.getAppPath(), 'resources')
  return path.join(root, ...segments)
}

export function sanitizeFileToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120)
}
