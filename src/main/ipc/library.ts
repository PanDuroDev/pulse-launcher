import { ipcMain } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc'
import type {
  AddManualResult,
  DirectoryListing,
  PickerRoots,
  UpdateManualResult,
} from '@shared/types'
import { log } from '../logger'
import type { CatalogService } from '../catalog'
import {
  driveLocations,
  isBrowsablePath,
  listDirectory,
  listDrives,
  resolvePlaces,
} from '../library-browser'
import type { PlaceCandidate } from '../library-browser'

const BrowseSchema = z
  .object({
    path: z.string().min(1).max(1024),
    kind: z.enum(['game', 'image']).optional(),
  })
  .strict()

const RemoveManualSchema = z.object({ gameId: z.string().min(1).max(200) })

const UpdateManualSchema = z
  .object({
    gameId: z.string().min(1).max(200),
    name: z.string().max(200).optional(),
    executable: z.string().min(1).max(1024).optional(),
    artwork: z.string().min(1).max(1024).nullable().optional(),
  })
  .strict()

interface LibraryIpcDependencies {
  assertTrustedSender: (event: Electron.IpcMainInvokeEvent) => void
  catalog: CatalogService
  placeCandidates: () => PlaceCandidate[]
}

export function registerLibraryIpc({
  assertTrustedSender,
  catalog,
  placeCandidates,
}: LibraryIpcDependencies): void {
  ipcMain.handle(IPC.libraryRoots, async (event): Promise<PickerRoots> => {
    assertTrustedSender(event)
    const [places, drives] = await Promise.all([
      resolvePlaces(placeCandidates()),
      listDrives(),
    ])
    return { places: [...places, ...driveLocations(drives)] }
  })

  ipcMain.handle(
    IPC.libraryList,
    async (event, payload: unknown): Promise<DirectoryListing> => {
      assertTrustedSender(event)
      const parsed = BrowseSchema.parse(payload)
      const listing = await listDirectory(parsed.path, parsed.kind ?? 'game')
      log.info('[library] browse', {
        ok: listing.ok,
        path: listing.path,
        entries: listing.entries?.length,
      })
      return listing
    },
  )

  ipcMain.handle(
    IPC.libraryAdd,
    async (event, payload: unknown): Promise<AddManualResult> => {
      assertTrustedSender(event)
      const parsed = BrowseSchema.parse(payload)
      if (!isBrowsablePath(parsed.path)) {
        return { ok: false, error: 'Choose a game file on a local drive.' }
      }
      const result = await catalog.addManualGame(parsed.path)
      log.info('[library] add manual game', {
        ok: result.ok,
        name: result.game?.name,
        executable: parsed.path,
      })
      return result
    },
  )

  ipcMain.handle(
    IPC.settingsRemoveManual,
    async (event, payload: unknown) => {
      assertTrustedSender(event)
      const parsed = RemoveManualSchema.parse(payload)
      return catalog.removeManualGame(parsed.gameId)
    },
  )

  ipcMain.handle(
    IPC.libraryUpdate,
    async (event, payload: unknown): Promise<UpdateManualResult> => {
      assertTrustedSender(event)
      const parsed = UpdateManualSchema.parse(payload)
      if (parsed.executable !== undefined && !isBrowsablePath(parsed.executable)) {
        return { ok: false, error: 'Choose a game file on a local drive.' }
      }
      if (typeof parsed.artwork === 'string' && !isBrowsablePath(parsed.artwork)) {
        return { ok: false, error: 'Choose an image on a local drive.' }
      }
      const result = await catalog.updateManualGame({
        gameId: parsed.gameId,
        name: parsed.name,
        executable: parsed.executable,
        artwork: parsed.artwork,
      })
      log.info('[library] update manual game', {
        ok: result.ok,
        gameId: parsed.gameId,
        previousId: result.previousId,
        error: result.error,
      })
      return result
    },
  )
}
