/** Internal renderer types for page-state transitions and route selection. */
export type LauncherStatus = 'loading' | 'ready' | 'error'

export type AddMode = 'game' | 'path' | 'image'

export type LauncherRoute =
  | 'search'
  | 'add'
  | 'details'
  | 'music'
  | 'settings'
  | 'loading'
  | 'empty'
  | 'library'
