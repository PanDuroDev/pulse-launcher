/**
 * Reads a response body while enforcing a hard byte ceiling.
 *
 * Unlike `arrayBuffer()`, this consumes the stream chunk by chunk and cancels
 * as soon as the accumulated size passes `maxBytes`, so an oversized or
 * mislabeled response cannot grow memory without a bound.
 */
export async function readBodyWithLimit(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Buffer | null> {
  const reader = body.getReader()
  const chunks: Buffer[] = []
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value || value.byteLength === 0) continue

      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel('Response exceeded the size limit')
        return null
      }

      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }

  return Buffer.concat(chunks, total)
}
