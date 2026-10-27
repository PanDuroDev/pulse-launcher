import { ipcMain } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc'
import type { SelectionResult } from '@shared/types'
import type { AppStore } from '../store'

const SelectionSchema = z.object({
  gameId: z.string().min(1).max(200).nullable(),
})

interface SelectionIpcDependencies {
  assertTrustedSender: (event: Electron.IpcMainInvokeEvent) => void
  store: AppStore
}

export function registerSelectionIpc({
  assertTrustedSender,
  store,
}: SelectionIpcDependencies): void {
  ipcMain.handle(IPC.selectionGet, (event): string | null => {
    assertTrustedSender(event)
    return store.getLastSelectedId()
  })

  ipcMain.handle(
    IPC.selectionSet,
    async (event, payload: unknown): Promise<SelectionResult> => {
      assertTrustedSender(event)
      const parsed = SelectionSchema.parse(payload)
      return store.setLastSelectedId(parsed.gameId)
    },
  )
}
