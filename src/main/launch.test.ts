import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { shell } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameRecord } from '@shared/types'

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn(), openPath: vi.fn() },
}))

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

vi.mock('./logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { launchGame } from './launch'

function fakeChild(): ChildProcess {
  const child = {
    once: (event: string, handler: () => void) => {
      if (event === 'spawn') queueMicrotask(handler)
      return child
    },
    unref: vi.fn(),
  }
  return child as unknown as ChildProcess
}

function game(overrides: Partial<GameRecord> & Pick<GameRecord, 'launch'>): GameRecord {
  return {
    id: 'test-game',
    source: 'manual',
    name: 'Test Game',
    installed: true,
    accent: '#ffffff',
    ...overrides,
  }
}

const EPIC_TARGET =
  'com.epicgames.launcher://apps/ns%3Aid%3Aname?action=launch&silent=true'

describe('launchGame', () => {
  let directory: string
  let executable: string

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'pulse-launch-'))
    executable = path.join(directory, 'game.exe')
    await writeFile(executable, '')
    vi.mocked(spawn).mockImplementation(() => fakeChild())
    vi.mocked(shell.openExternal).mockResolvedValue(undefined)
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  describe('epic targets', () => {
    it('opens a valid Epic launch URI', async () => {
      const result = await launchGame(
        game({ source: 'epic', launch: { kind: 'epic', target: EPIC_TARGET } }),
      )

      expect(result).toEqual({ ok: true, pendingObservation: true })
      expect(shell.openExternal).toHaveBeenCalledWith(EPIC_TARGET)
    })

    it('rejects a malformed Epic URI without opening it', async () => {
      const result = await launchGame(
        game({
          source: 'epic',
          launch: {
            kind: 'epic',
            target: 'com.epicgames.launcher://apps/ns%3Aid?action=launch&silent=true',
          },
        }),
      )

      expect(result).toEqual({ ok: false, error: 'Invalid Epic launch target.' })
      expect(shell.openExternal).not.toHaveBeenCalled()
    })
  })

  describe('executable working directory', () => {
    it('launches with the validated working directory', async () => {
      const result = await launchGame(
        game({ launch: { kind: 'exe', target: executable, workDir: directory } }),
      )

      expect(result).toEqual({ ok: true, pendingObservation: true })
      expect(spawn).toHaveBeenCalledWith(
        executable,
        [],
        expect.objectContaining({ cwd: directory }),
      )
    })

    it('resolves a relative working directory against the game folder', async () => {
      const subdirectory = path.join(directory, 'bin')
      await mkdir(subdirectory)

      const result = await launchGame(
        game({ launch: { kind: 'exe', target: executable, workDir: 'bin' } }),
      )

      expect(result).toEqual({ ok: true, pendingObservation: true })
      expect(spawn).toHaveBeenCalledWith(
        executable,
        [],
        expect.objectContaining({ cwd: subdirectory }),
      )
    })

    it('fails before spawning when the working directory is missing', async () => {
      const result = await launchGame(
        game({
          launch: {
            kind: 'exe',
            target: executable,
            workDir: path.join(directory, 'missing'),
          },
        }),
      )

      expect(result).toEqual({
        ok: false,
        error: 'The game folder no longer exists.',
      })
      expect(spawn).not.toHaveBeenCalled()
    })

    it('fails before spawning when the working directory is a file', async () => {
      const result = await launchGame(
        game({ launch: { kind: 'exe', target: executable, workDir: executable } }),
      )

      expect(result).toEqual({
        ok: false,
        error: 'The game folder is not a folder.',
      })
      expect(spawn).not.toHaveBeenCalled()
    })

    it('spawns without a cwd when no working directory is configured', async () => {
      const result = await launchGame(
        game({ launch: { kind: 'exe', target: executable } }),
      )

      expect(result).toEqual({ ok: true, pendingObservation: true })
      expect(spawn).toHaveBeenCalledWith(
        executable,
        [],
        expect.objectContaining({ cwd: undefined }),
      )
    })
  })
})
