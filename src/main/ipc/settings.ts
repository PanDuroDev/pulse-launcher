import { ipcMain } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc'
import type { Settings, SettingsUpdate, WindowMode } from '@shared/types'
import { log } from '../logger'
import type { AppStore } from '../store'
import type { CatalogService } from '../catalog'

const SettingsUpdateSchema = z
  .object({
    showStartMenuApps: z.boolean().optional(),
    steamGridDbApiKey: z.string().max(200).optional(),
    hideCursorAfterMs: z.number().int().min(500).max(60_000).optional(),
    motion: z.enum(['system', 'reduced', 'full']).optional(),
    windowMode: z.enum(['windowed', 'fullscreen', 'kiosk']).optional(),
    returnAfterGame: z.boolean().optional(),
    librarySort: z.enum(['recent', 'title', 'added']).optional(),
    uiSounds: z.boolean().optional(),
  })
  .strict()

interface SettingsIpcDependencies {
  assertTrustedSender: (event: Electron.IpcMainInvokeEvent) => void
  store: AppStore
  catalog: CatalogService
  send: (channel: string, payload: unknown) => void
  setWindowMode: (mode: WindowMode) => void
}

/** Registers settings IPC handlers while preserving settings-change side effects. */
export function registerSettingsIpc({
  assertTrustedSender,
  store,
  catalog,
  send,
  setWindowMode,
}: SettingsIpcDependencies): void {
  ipcMain.handle(IPC.settingsGet, (event): Settings => {
    assertTrustedSender(event)
    return store.getSettings()
  })

  ipcMain.handle(
    IPC.settingsUpdate,
    async (event, payload: unknown): Promise<Settings> => {
      assertTrustedSender(event)
      const update = SettingsUpdateSchema.parse(payload) as SettingsUpdate
      log.info('[settings] update', {
        ...update,
        steamGridDbApiKey:
          update.steamGridDbApiKey === undefined ? undefined : '[redacted]',
      })
      const before = store.getSettings()
      const next = await store.updateSettings(update)
      send(IPC.settingsChanged, next)
      if (before.showStartMenuApps !== next.showStartMenuApps) {
        void catalog.refresh().catch((error) => log.error('[settings] rescan failed', error))
      }
      if (before.windowMode !== next.windowMode) {
        // Applied after this handler resolves so the renderer receives the
        // updated settings before a mode change can recreate its window.
        setTimeout(() => setWindowMode(next.windowMode), 0)
      }
      return next
    },
  )
}
