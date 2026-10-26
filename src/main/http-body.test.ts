import { describe, expect, it, vi } from 'vitest'
import { readBodyWithLimit } from './http-body'

function closedStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

describe('readBodyWithLimit', () => {
  it('concatenates chunks and ignores empty ones when under the limit', async () => {
    const body = closedStream([
      new Uint8Array([1, 2]),
      new Uint8Array(0),
      new Uint8Array([3]),
    ])

    const buffer = await readBodyWithLimit(body, 10)

    expect(buffer).not.toBeNull()
    expect([...(buffer ?? [])]).toEqual([1, 2, 3])
  })

  it('accepts a body that is exactly at the limit', async () => {
    const body = closedStream([new Uint8Array([1, 2, 3, 4])])

    const buffer = await readBodyWithLimit(body, 4)

    expect(buffer?.byteLength).toBe(4)
  })

  it('returns null and cancels the stream when the limit is exceeded', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.enqueue(new Uint8Array([4, 5, 6]))
      },
      cancel,
    })

    const buffer = await readBodyWithLimit(body, 4)

    expect(buffer).toBeNull()
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('propagates stream errors to the caller', async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('connection reset'))
      },
    })

    await expect(readBodyWithLimit(body, 10)).rejects.toThrow('connection reset')
  })

  it('returns an empty buffer for an empty body', async () => {
    const buffer = await readBodyWithLimit(closedStream([]), 10)

    expect(buffer?.byteLength).toBe(0)
  })
})
