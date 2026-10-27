import { ipcMain, shell } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc'
import type { AppInfo } from '@shared/types'
import { log } from '../logger'

const RendererErrorSchema = z
  .object({
    surface: z.enum(['launcher', 'overlay']),
    message: z.string().max(2_000),
    stack: z.string().max(20_000),
    componentStack: z.string().max(20_000),
  })
  .strict()

interface AppIpcDependencies {
  assertTrustedSender: (event: Electron.IpcMainInvokeEvent) => void
  assertMusicSender: (event: Electron.IpcMainEvent) => void
  appInfo: () => AppInfo
  hideWindow: () => void
  quitApp: () => void
  logsPath: () => string
}

export function registerAppIpc({
  assertTrustedSender,
  assertMusicSender,
  appInfo,
  hideWindow,
  quitApp,
  logsPath,
}: AppIpcDependencies): void {
  ipcMain.handle(IPC.appInfo, (event): AppInfo => {
    assertTrustedSender(event)
    return appInfo()
  })

  ipcMain.handle(IPC.appHide, (event): void => {
    assertTrustedSender(event)
    hideWindow()
  })

  ipcMain.handle(IPC.appQuit, (event): void => {
    assertTrustedSender(event)
    quitApp()
  })

  ipcMain.handle(IPC.appOpenLogs, async (event): Promise<void> => {
    assertTrustedSender(event)
    const errorMessage = await shell.openPath(logsPath())
    if (errorMessage) log.warn('[logs] could not open logs', errorMessage)
  })

  /**
   * Renderer crash reports are untrusted input: the renderer could be compromised,
   * so the strings are capped and the surface is a closed set before they reach
   * the log file.
   */
  ipcMain.on(IPC.appRendererError, (event, payload: unknown) => {
    // Both the launcher and the overlay can crash, and both load app://.
    assertMusicSender(event)
    const parsed = RendererErrorSchema.safeParse(payload)
    if (!parsed.success) return
    const { surface, message, stack, componentStack } = parsed.data
    const senderUrl = event.senderFrame?.url ?? 'unknown'
    log.error(
      `[renderer] ${surface} crashed: ${message}\n` +
        `url: ${senderUrl}\n` +
        `stack: ${stack || '(none)'}\n` +
        `componentStack: ${componentStack || '(none)'}`,
    )
  })
}
