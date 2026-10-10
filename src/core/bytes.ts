/** Lowercase hexadecimal SHA-256 of raw bytes. */
export async function sha256Hex(bytes: BufferSource): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

/** Read a response stream without buffering more than `limit` bytes. */
export async function readBoundedBody(
  body: ReadableStream<Uint8Array>,
  limit: number,
  tooLarge: () => Error,
): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw tooLarge();
      chunks.push(value);
    }
  } finally {
    // Stops an oversized or failed stream; a no-op after a completed read.
    await reader.cancel().catch(() => undefined);
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
