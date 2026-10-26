import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { backupFile, readJsonFile, writeJsonFileAtomic } from './fs-utils'

describe('fs-utils', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'pulse-fs-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  describe('readJsonFile', () => {
    it('returns parsed content for a valid file', async () => {
      const file = path.join(directory, 'value.json')
      await writeFile(file, JSON.stringify({ a: 1 }), 'utf8')

      await expect(readJsonFile(file)).resolves.toEqual({
        status: 'ok',
        value: { a: 1 },
      })
    })

    it('reports a missing file distinctly', async () => {
      await expect(readJsonFile(path.join(directory, 'nope.json'))).resolves.toEqual({
        status: 'missing',
      })
    })

    it('accepts a file that starts with a UTF-8 BOM', async () => {
      const file = path.join(directory, 'bom.json')
      await writeFile(file, '\uFEFF{"a":1}', 'utf8')

      await expect(readJsonFile(file)).resolves.toEqual({
        status: 'ok',
        value: { a: 1 },
      })
    })

    it('reports invalid JSON', async () => {
      const file = path.join(directory, 'broken.json')
      await writeFile(file, '{ not json', 'utf8')

      await expect(readJsonFile(file)).resolves.toEqual({ status: 'invalid' })
    })
  })

  describe('writeJsonFileAtomic', () => {
    it('creates missing directories and writes readable JSON', async () => {
      const file = path.join(directory, 'nested', 'value.json')

      await writeJsonFileAtomic(file, { hello: 'world' })

      expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ hello: 'world' })
    })

    it('serializes concurrent writes to the same file without leftovers', async () => {
      const file = path.join(directory, 'value.json')

      await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          writeJsonFileAtomic(file, { index }),
        ),
      )

      expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ index: 9 })
      const entries = await readdir(directory)
      expect(entries.filter((entry) => entry.endsWith('.tmp'))).toEqual([])
    })

    it('removes the temporary file and rethrows when the rename fails', async () => {
      const target = path.join(directory, 'target')
      await mkdir(target)

      await expect(writeJsonFileAtomic(target, { a: 1 })).rejects.toThrow()

      const entries = await readdir(directory)
      expect(entries.filter((entry) => entry.endsWith('.tmp'))).toEqual([])
    })
  })

  describe('backupFile', () => {
    it('copies the file to a timestamped sibling', async () => {
      const file = path.join(directory, 'data.json')
      await writeFile(file, 'contents', 'utf8')

      const backup = await backupFile(file)

      expect(backup).not.toBeNull()
      expect(path.dirname(backup ?? '')).toBe(directory)
      expect(backup?.endsWith('.bak')).toBe(true)
      expect(await readFile(backup ?? '', 'utf8')).toBe('contents')
    })

    it('returns null when the source does not exist', async () => {
      await expect(backupFile(path.join(directory, 'nope.json'))).resolves.toBeNull()
    })
  })
})
