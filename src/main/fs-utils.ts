import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'

export type JsonFileRead =
  | { status: 'ok'; value: unknown }
  | { status: 'missing' }
  | { status: 'invalid' }

/**
 * Reads a JSON file and distinguishes a missing file from unreadable or
 * corrupt content, so callers can back up corrupt data instead of silently
 * treating it as absent.
 */
export async function readJsonFile(filePath: string): Promise<JsonFileRead> {
  let content: string
  try {
    content = await readFile(filePath, 'utf8')
  } catch (error) {
    return {
      status:
        (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'invalid',
    }
  }

  try {
    // Files edited with older Windows tools may start with a UTF-8 BOM, which
    // JSON.parse rejects even though the payload is valid.
    const normalized =
      content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
    return { status: 'ok', value: JSON.parse(normalized) as unknown }
  } catch {
    return { status: 'invalid' }
  }
}

/**
 * Writes are serialized per target file (last write wins) and each one uses a
 * unique temporary name, so two concurrent saves of the same file can never
 * share a temp file or interleave their rename step.
 */
const writeQueues = new Map<string, Promise<void>>()

async function writeJsonFile(filePath: string, payload: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, payload, 'utf8')
    await rename(temporary, filePath)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}

export function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  // Serialize now so a later in-memory mutation cannot change what an already
  // queued write persists.
  const payload = JSON.stringify(value, null, 2)
  const previous = writeQueues.get(filePath) ?? Promise.resolve()

  const task = previous.then(
    () => writeJsonFile(filePath, payload),
    () => writeJsonFile(filePath, payload),
  )
  const settled = task.then(
    () => {
      if (writeQueues.get(filePath) === settled) writeQueues.delete(filePath)
    },
    () => {
      if (writeQueues.get(filePath) === settled) writeQueues.delete(filePath)
    },
  )
  writeQueues.set(filePath, settled)

  return task
}

/**
 * Copies a file that needed recovery to a timestamped sibling path. Returns
 * the backup path, or null when the copy failed (for example on permissions).
 */
export async function backupFile(
  filePath: string,
  tag = 'corrupt',
): Promise<string | null> {
  const backupPath = `${filePath}.${tag}-${Date.now()}-${randomUUID().slice(0, 8)}.bak`
  try {
    await copyFile(filePath, backupPath)
    return backupPath
  } catch {
    return null
  }
}
