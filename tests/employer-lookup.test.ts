import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.hoisted(() => vi.fn());
vi.mock('../src/core/page-runtime', () => ({ sendPageMessage: send }));
const { createEmployerLookup } = await import('../src/inpage/employer-lookup');

const found = (names: string[]) => ({
  ok: true,
  employers: names.map((query) => ({
    query,
    status: 'not_found',
    matches: [],
    checkedAt: 1,
  })),
});

describe('employer lookup', () => {
  // Braces: a returned function would run as the hook's teardown.
  beforeEach(() => {
    send.mockReset();
  });

  it('asks in batches of 20 and only once per name', async () => {
    send.mockImplementation(async (message: { names: string[] }) => found(message.names));
    const lookup = createEmployerLookup({ isActive: () => true, onChange: vi.fn() });
    const names = Array.from({ length: 21 }, (_, i) => `Employer ${i}`);
    await lookup.request(names);
    expect(send.mock.calls.map(([message]) => message.names.length)).toEqual([20, 1]);
    await lookup.request(names);
    expect(send).toHaveBeenCalledTimes(2);
    expect(lookup.get(' Employer 20 ')?.status).toBe('not_found');
    expect(lookup.state()).toMatchObject({ busy: false, message: '' });
  });

  it('settles names it cannot ask about instead of leaving them checking', async () => {
    const lookup = createEmployerLookup({ isActive: () => true, onChange: vi.fn() });
    await lookup.request(['Q', 'x'.repeat(241)]);
    expect(send).not.toHaveBeenCalled();
    expect(lookup.get('Q')?.status).toBe('unavailable');
    expect(lookup.get('x'.repeat(241))?.status).toBe('unavailable');
  });

  it('marks a failed batch unavailable and asks again on the next pass', async () => {
    send.mockResolvedValueOnce({ ok: false, error: 'Worker asleep' });
    const lookup = createEmployerLookup({ isActive: () => true, onChange: vi.fn() });
    await lookup.request(['Synthetic Employer']);
    expect(lookup.get('Synthetic Employer')?.status).toBe('unavailable');
    expect(lookup.state().message).toBe('Worker asleep');
    send.mockImplementation(async (message: { names: string[] }) => found(message.names));
    await lookup.request(['Synthetic Employer']);
    expect(lookup.get('Synthetic Employer')?.status).toBe('not_found');
    expect(lookup.state().message).toBe('');
  });

  it('ignores a reply that arrives after a reset', async () => {
    let resolve!: (value: unknown) => void;
    send.mockReturnValueOnce(new Promise((done) => (resolve = done)));
    const lookup = createEmployerLookup({ isActive: () => true, onChange: vi.fn() });
    const pending = lookup.request(['Synthetic Employer']);
    lookup.reset();
    resolve(found(['Synthetic Employer']));
    await pending;
    expect(lookup.get('Synthetic Employer')).toBeUndefined();
    expect(lookup.state().busy).toBe(false);
  });
});
