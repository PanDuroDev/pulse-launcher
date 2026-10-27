import { ipcMain } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc'
import type {
  ArtKind,
  FavoriteResult,
  GameControlResult,
  GameSource,
  GameSummary,
  LaunchResult,
  ScanResult,
} from '@shared/types'
import { log } from '../logger'
import type { CatalogService } from '../catalog'
import { GameControlService, terminateProcess } from '../game-control'
import { launchGame } from '../launch'
import { runWindowAction } from '../game-window'

const ArtworkRequestSchema = z.object({
  gameId: z.string().min(1).max(200),
  kind: z.enum(['cover', 'hero', 'icon', 'logo']),
})

const GameIdSchema = z.object({
  gameId: z.string().min(1).max(200),
})

const ForceCloseSchema = z.object({
  gameId: z.string().min(1).max(200),
  confirm: z.boolean(),
})

interface CatalogIpcDependencies {
  assertTrustedSender: (event: Electron.IpcMainInvokeEvent) => void
  catalog: CatalogService
  hideForGame: (gameId: string) => void
}

export function registerCatalogIpc({
  assertTrustedSender,
  catalog,
  hideForGame,
}: CatalogIpcDependencies): void {
  const gameControl = new GameControlService({
    getRunningMatch: (gameId) => catalog.getRunningMatch(gameId),
    runWindowAction,
    terminateProcess,
  })

  ipcMain.handle(IPC.catalogList, (event): GameSummary[] => {
    assertTrustedSender(event)
    return catalog.list()
  })

  ipcMain.handle(IPC.catalogStaleSources, (event): GameSource[] => {
    assertTrustedSender(event)
    return catalog.getStaleSources()
  })

  ipcMain.handle(IPC.catalogRefresh, async (event): Promise<ScanResult> => {
    assertTrustedSender(event)
    return catalog.refresh()
  })

  ipcMain.handle(
    IPC.catalogArtwork,
    async (event, payload: unknown) => {
      assertTrustedSender(event)
      const parsed = ArtworkRequestSchema.parse(payload)
      return catalog.artworkFor(parsed.gameId, parsed.kind as ArtKind)
    },
  )

  ipcMain.handle(
    IPC.catalogToggleFavorite,
    async (event, payload: unknown): Promise<FavoriteResult> => {
      assertTrustedSender(event)
      const parsed = GameIdSchema.parse(payload)
      const result = await catalog.toggleFavorite(parsed.gameId)
      log.info('[catalog] toggle favorite', {
        gameId: parsed.gameId,
        ok: result.ok,
        favorite: result.favorite,
      })
      return result
    },
  )

  ipcMain.handle(IPC.launchGame, async (event, payload: unknown): Promise<LaunchResult> => {
    assertTrustedSender(event)
    const parsed = GameIdSchema.parse(payload)
    const game = catalog.getCachedGame(parsed.gameId)
    if (!game) return { ok: false, error: 'Game not found.' }

    if (catalog.demo) return { ok: true }

    const result = await launchGame(game)
    if (result.ok) {
      await catalog.markLaunched(game.id)
      setTimeout(() => hideForGame(game.id), 900)
    }
    return result
  })

  ipcMain.handle(
    IPC.gameFocus,
    async (event, payload: unknown): Promise<GameControlResult> => {
      assertTrustedSender(event)
      const parsed = GameIdSchema.parse(payload)
      const result = await gameControl.focus(parsed.gameId)
      log.info('[game] focus', { gameId: parsed.gameId, ...result })
      return result
    },
  )

  ipcMain.handle(
    IPC.gameClose,
    async (event, payload: unknown): Promise<GameControlResult> => {
      assertTrustedSender(event)
      const parsed = GameIdSchema.parse(payload)
      const result = await gameControl.close(parsed.gameId)
      log.info('[game] close', { gameId: parsed.gameId, ...result })
      return result
    },
  )

  ipcMain.handle(
    IPC.gameForceClose,
    async (event, payload: unknown): Promise<GameControlResult> => {
      assertTrustedSender(event)
      const parsed = ForceCloseSchema.parse(payload)
      const result = await gameControl.forceClose(parsed.gameId, parsed.confirm)
      log.warn('[game] force quit', {
        gameId: parsed.gameId,
        confirm: parsed.confirm,
        ...result,
      })
      return result
    },
  )
}
