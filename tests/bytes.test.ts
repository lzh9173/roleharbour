import { describe, expect, it, vi } from 'vitest';
import { readBoundedBody, sha256Hex } from '../src/core/bytes';

function stream(chunks: number[][]) {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
      controller.close();
    },
    cancel,
  });
  return { body, cancel };
}

describe('shared byte helpers', () => {
  it('hashes bytes as lowercase hexadecimal SHA-256', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('concatenates chunks up to the exact limit', async () => {
    const { body } = stream([[1, 2], [3], [4, 5]]);
    expect([...(await readBoundedBody(body, 5, () => new Error('large')))]).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('cancels the stream and throws the supplied error once the limit is exceeded', async () => {
    const { body, cancel } = stream([[1, 2, 3], [4, 5, 6], [7]]);
    await expect(readBoundedBody(body, 4, () => new Error('large'))).rejects.toThrow('large');
    expect(cancel).toHaveBeenCalledOnce();
  });
});
