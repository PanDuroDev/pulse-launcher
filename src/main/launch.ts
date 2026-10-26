import { spawn } from 'node:child_process'
import { access, stat } from 'node:fs/promises'
import path from 'node:path'
import { shell } from 'electron'
import type { GameRecord, LaunchResult } from '@shared/types'
import { isValidEpicLaunchUri } from './epic-uri'
import { log } from './logger'

async function isFile(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath)
    return info.isFile()
  } catch {
    return false
  }
}

function spawnDetached(
  executable: string,
  args: string[],
  workDir: string | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: workDir,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

export async function launchGame(game: GameRecord): Promise<LaunchResult> {
  try {
    if (game.launch.kind === 'steam') {
      const match = game.launch.target.match(/^steam:\/\/rungameid\/(\d+)$/)
      if (!match) return { ok: false, error: 'Invalid Steam launch target.' }
      await shell.openExternal(game.launch.target)
      log.info('[launch] steam', game.id)
      return { ok: true, pendingObservation: true }
    }

    if (game.launch.kind === 'epic') {
      if (!isValidEpicLaunchUri(game.launch.target)) {
        return { ok: false, error: 'Invalid Epic launch target.' }
      }
      await shell.openExternal(game.launch.target)
      log.info('[launch] epic', game.id)
      return { ok: true, pendingObservation: true }
    }

    if (game.launch.kind === 'shortcut') {
      if (!game.launch.target.toLowerCase().endsWith('.lnk')) {
        return { ok: false, error: 'Invalid shortcut target.' }
      }
      if (!(await isFile(game.launch.target))) {
        return { ok: false, error: 'The shortcut no longer exists.' }
      }
      const errorMessage = await shell.openPath(game.launch.target)
      if (errorMessage) return { ok: false, error: errorMessage }
      log.info('[launch] shortcut', game.id)
      return { ok: true, pendingObservation: true }
    }

    if (game.launch.kind === 'exe') {
      const target = path.resolve(game.launch.target)
      if (path.extname(target).toLowerCase() !== '.exe') {
        return { ok: false, error: 'Invalid executable target.' }
      }
      if (!(await isFile(target))) {
        return { ok: false, error: 'The executable no longer exists.' }
      }

      const rawWorkDir = game.launch.workDir?.trim()
      let workDir: string | undefined
      if (rawWorkDir) {
        // A relative work directory is resolved against the game's own folder,
        // not the launcher's current working directory.
        workDir = path.isAbsolute(rawWorkDir)
          ? path.normalize(rawWorkDir)
          : path.resolve(path.dirname(target), rawWorkDir)

        let info: Awaited<ReturnType<typeof stat>> | null
        try {
          info = await stat(workDir)
        } catch {
          info = null
        }
        if (!info) return { ok: false, error: 'The game folder no longer exists.' }
        if (!info.isDirectory()) {
          return { ok: false, error: 'The game folder is not a folder.' }
        }
      }

      await access(target)
      await spawnDetached(target, game.launch.args ?? [], workDir)
      log.info('[launch] exe', game.id, target)
      return { ok: true, pendingObservation: true }
    }

    return { ok: false, error: 'Unsupported launch target.' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('[launch] failed', game.id, error)
    return { ok: false, error: message }
  }
}
