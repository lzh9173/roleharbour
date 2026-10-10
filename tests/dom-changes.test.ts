// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce, isOwnMutation } from '../src/inpage/dom-changes';

describe('reconcile debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('collapses a burst into one trailing pass', () => {
    const run = vi.fn();
    const pass = debounce(run, 200, 1000);
    for (let i = 0; i < 5; i++) {
      pass.schedule();
      vi.advanceTimersByTime(50);
    }
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('still runs every maxWait under continuous churn', () => {
    const run = vi.fn();
    const pass = debounce(run, 200, 1000);
    for (let i = 0; i < 30; i++) {
      pass.schedule();
      vi.advanceTimersByTime(100);
    }
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('cancels a pending pass', () => {
    const run = vi.fn();
    const pass = debounce(run, 200, 1000);
    pass.schedule();
    pass.cancel();
    vi.advanceTimersByTime(2000);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('own mutations', () => {
  const record = (init: Partial<MutationRecord>) =>
    ({
      type: 'childList',
      addedNodes: [] as unknown as NodeList,
      removedNodes: [] as unknown as NodeList,
      ...init,
    }) as MutationRecord;

  it('ignores inserting or updating RoleHarbour hosts only', () => {
    const host = document.createElement('div');
    host.dataset.seekFilter = 'card';
    const child = host.appendChild(document.createElement('span'));
    const page = document.createElement('article');
    expect(isOwnMutation(record({ target: page, addedNodes: [host] as unknown as NodeList }))).toBe(
      true,
    );
    expect(isOwnMutation(record({ type: 'attributes', target: child }))).toBe(true);
    expect(
      isOwnMutation(
        record({
          target: page,
          addedNodes: [host, document.createElement('p')] as unknown as NodeList,
        }),
      ),
    ).toBe(false);
    expect(isOwnMutation(record({ type: 'attributes', target: page }))).toBe(false);
  });
});
