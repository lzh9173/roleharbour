// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmployerCacheStatus } from '../src/employers';
import { EmployerSettings } from '../src/ui/EmployerSettings';
import { applyLanguagePreference } from '../src/i18n/preference';

const api = vi.hoisted(() => ({
  getEmployerCacheStatus: vi.fn(),
  exportEmployerBackup: vi.fn(),
  importEmployerBackup: vi.fn(),
}));
const maxBytes = 12 * 1024 * 1024;
vi.mock('../src/employers', () => ({ ...api, EMPLOYER_BACKUP_MAX_BYTES: 12 * 1024 * 1024 }));
const original: EmployerCacheStatus = {
  snapshotDate: '2026-09-18',
  downloadedAt: Date.parse('2026-09-19T00:00:00Z'),
  recordCount: 3,
  snapshotSourceUrl: 'https://data.nzaei.zemo.bio/snapshots/2026-09-18/employers.csv',
  lastAttemptAt: null,
};
const updated: EmployerCacheStatus = { ...original, snapshotDate: '2026-09-21', recordCount: 9 };
let container: HTMLDivElement;
let root: Root;
let requestPermission: ReturnType<typeof vi.fn>;
let sendMessage: ReturnType<typeof vi.fn>;
const messageListeners = new Set<(message: unknown) => void>();
let fetchOnline: ReturnType<typeof vi.fn>;
let createUrl: ReturnType<typeof vi.fn>;
let revokeUrl: ReturnType<typeof vi.fn>;

function button(label: string): HTMLButtonElement {
  const result = [...container.querySelectorAll('button')].find(
    (node) => node.textContent === label,
  );
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}
async function mount() {
  await act(async () => {
    root.render(createElement(EmployerSettings));
  });
}
async function click(label: string) {
  await act(async () => {
    button(label).click();
  });
}
async function select(file?: File) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
function backupFile(content = '{"format":"employer-backup"}', size?: number) {
  const file = new File([content], 'employers.json', { type: 'application/json' });
  const read = vi.fn().mockResolvedValue(content);
  Object.defineProperty(file, 'text', { value: read });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  return { file, read };
}

beforeEach(() => {
  vi.clearAllMocks();
  applyLanguagePreference('zh-CN');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  api.getEmployerCacheStatus.mockResolvedValue(original);
  api.importEmployerBackup.mockResolvedValue(updated);
  api.exportEmployerBackup.mockResolvedValue('{"format":"employer-backup","records":[]}');
  requestPermission = vi.fn();
  sendMessage = vi.fn().mockResolvedValue({ ok: true, cache: updated });
  messageListeners.clear();
  fetchOnline = vi.fn();
  vi.stubGlobal('fetch', fetchOnline);
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage,
      onMessage: {
        addListener: (listener: (message: unknown) => void) => messageListeners.add(listener),
        removeListener: (listener: (message: unknown) => void) => messageListeners.delete(listener),
      },
    },
    permissions: { request: requestPermission },
  });
  createUrl = vi.fn().mockReturnValue('blob:employer-backup');
  revokeUrl = vi.fn();
  vi.stubGlobal(
    'URL',
    Object.assign(class extends URL {}, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }),
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  applyLanguagePreference('auto');
});

describe('local employer list settings', () => {
  it('reads only local status on mount and shows the weekly list date and count', async () => {
    await mount();
    expect(container.textContent).toContain('本地雇主名单');
    expect(container.textContent).toContain('名单日期：2026-09-18 · 3 条');
    expect(container.textContent).toContain('每周自动更新');
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.textContent).not.toContain('查询记录');
    expect(container.textContent).toContain('JSON 名单备份');
    expect(requestPermission).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('requests a worker refresh once and disables all list actions until it settles', async () => {
    let finish!: (value: unknown) => void;
    sendMessage.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await mount();
    await act(async () => {
      const refresh = button('立即更新');
      refresh.click();
      refresh.click();
      window.dispatchEvent(new Event('focus'));
    });
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith({ type: 'employers:refresh' });
    expect(api.getEmployerCacheStatus).toHaveBeenCalledTimes(1);
    expect([...container.querySelectorAll('button')].every((node) => node.disabled)).toBe(true);
    expect(button('正在更新…').disabled).toBe(true);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(fetchOnline).not.toHaveBeenCalled();
    await act(async () => {
      finish({ ok: true, cache: updated });
    });
    expect(container.textContent).toContain('名单日期：2026-09-21 · 9 条');
    expect(container.textContent).toContain('返回 SEEK 即可查看');
    expect(button('立即更新').disabled).toBe(false);
  });

  it.each(['rejected', 'status_error', 'worker_error', 'empty_reply', 'synchronous'] as const)(
    'retains the original status after a %s update failure',
    async (kind) => {
      if (kind === 'rejected')
        sendMessage.mockRejectedValue(new Error('Synthetic download failure'));
      else if (kind === 'status_error')
        sendMessage.mockResolvedValue({
          ok: true,
          cache: { ...original, error: 'Synthetic validation failure' },
        });
      else if (kind === 'worker_error')
        sendMessage.mockResolvedValue({ ok: false, error: 'Synthetic worker failure' });
      else if (kind === 'synchronous')
        sendMessage.mockImplementation(() => {
          throw new Error('Synthetic runtime failure');
        });
      else sendMessage.mockResolvedValue(undefined);
      await mount();
      await click('立即更新');
      expect(container.textContent).toContain('更新失败');
      expect(container.textContent).toContain('本地名单未更改');
      expect(container.textContent).toContain('名单日期：2026-09-18 · 3 条');
      expect(button('立即更新').disabled).toBe(false);
    },
  );

  it('cancelling the file picker does not change or import data', async () => {
    await mount();
    await select();
    expect(api.importEmployerBackup).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(container.textContent).toContain('名单日期：2026-09-18 · 3 条');
  });

  it('rejects an oversized backup before reading it', async () => {
    const { file, read } = backupFile('{}', maxBytes + 1);
    await mount();
    await select(file);
    expect(read).not.toHaveBeenCalled();
    expect(api.importEmployerBackup).not.toHaveBeenCalled();
    expect(container.textContent).toContain('文件不能超过 12 MiB');
    expect(container.textContent).toContain('名单日期：2026-09-18 · 3 条');
  });

  it('keeps the original list and reports an invalid backup', async () => {
    api.importEmployerBackup.mockRejectedValue(new Error('备份格式无效'));
    await mount();
    await select(backupFile('not json').file);
    expect(container.textContent).toContain('备份格式无效');
    expect(container.textContent).toContain('本地名单未更改');
    expect(container.textContent).toContain('名单日期：2026-09-18 · 3 条');
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('imports an accepted JSON backup locally and displays its returned status', async () => {
    const content = '{"format":"employer-backup","records":[]}';
    api.importEmployerBackup.mockResolvedValue({
      ...updated,
      snapshotSourceUrl: 'https://example.org/employer-source.json',
    });
    await mount();
    await select(backupFile(content).file);
    expect(api.importEmployerBackup).toHaveBeenCalledExactlyOnceWith(content);
    expect(container.textContent).toContain('名单日期：2026-09-21 · 9 条');
    expect(container.textContent).toContain('返回 SEEK 即可查看');
    expect(requestPermission).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    const source = [...container.querySelectorAll('a')].find(
      (link) => link.textContent === '当前名单来源 ↗',
    );
    expect(source?.href).toBe('https://example.org/employer-source.json');
    expect(container.textContent).not.toContain('在线更新来源');
    expect(container.textContent).not.toContain('NZ Accredited Employer Inspector');
  });

  it.each(['javascript:alert(1)', 'https://user:pass@example.org/data', 'invalid'])(
    'does not link an unsafe stored source: %s',
    async (snapshotSourceUrl) => {
      api.getEmployerCacheStatus.mockResolvedValue({ ...original, snapshotSourceUrl });
      await mount();
      expect(container.textContent).not.toContain('当前名单来源');
      expect(container.querySelector('a')).toBeNull();
    },
  );

  it('downloads only the employer backup through a local Blob URL', async () => {
    await mount();
    vi.useFakeTimers();
    let download = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      download = this.download;
      expect(this.href).toBe('blob:employer-backup');
    });
    await click('导出名单');
    expect(api.exportEmployerBackup).toHaveBeenCalledExactlyOnceWith();
    expect(createUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(download).toMatch(/^roleharbour-employers-\d{4}-\d{2}-\d{2}\.json$/);
    expect(container.textContent).toContain('不含岗位记录或 API Key');
    expect(requestPermission).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(revokeUrl).toHaveBeenCalledWith('blob:employer-backup');
  });

  it('reports export failure without creating a download', async () => {
    api.exportEmployerBackup.mockRejectedValue(new Error('名单备份超过 12 MiB'));
    await mount();
    await click('导出名单');
    expect(createUrl).not.toHaveBeenCalled();
    expect(container.textContent).toContain('名单备份超过 12 MiB');
  });
});

describe('employer list status updates', () => {
  it('updates a completed action notice when the interface language changes', async () => {
    await mount();
    await click('立即更新');
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      '已更新本地名单，返回 SEEK 即可查看。',
    );
    applyLanguagePreference('en');
    await act(async () => {
      root.render(createElement(EmployerSettings));
    });
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'Local list updated. Return to SEEK to see the results.',
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('reads refreshed local status on focus and worker broadcasts without downloading', async () => {
    await mount();
    api.getEmployerCacheStatus.mockResolvedValue(updated);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(container.textContent).toContain('名单日期：2026-09-21 · 9 条');
    api.getEmployerCacheStatus.mockResolvedValue({ ...updated, recordCount: 10 });
    await act(async () => {
      for (const listener of messageListeners) listener({ type: 'employers:updated' });
    });
    expect(container.textContent).toContain('名单日期：2026-09-21 · 10 条');
    expect(api.getEmployerCacheStatus).toHaveBeenCalledTimes(3);
    await act(async () => {
      for (const listener of messageListeners) listener({ type: 'unrelated' });
    });
    expect(api.getEmployerCacheStatus).toHaveBeenCalledTimes(3);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(fetchOnline).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it.each(['refresh', 'import'] as const)(
    'ignores a delayed initial read after %s',
    async (action) => {
      let finishRead!: (value: EmployerCacheStatus) => void;
      api.getEmployerCacheStatus.mockReturnValueOnce(
        new Promise((resolve) => {
          finishRead = resolve;
        }),
      );
      await mount();
      if (action === 'refresh') await click('立即更新');
      else await select(backupFile().file);
      await act(async () => {
        finishRead(original);
      });
      expect(container.textContent).toContain('名单日期：2026-09-21 · 9 条');
      expect(container.textContent).not.toContain('名单日期：2026-09-18');
    },
  );

  it('does not replace a newer focus read with an older one', async () => {
    await mount();
    let finishRead!: (value: EmployerCacheStatus) => void;
    api.getEmployerCacheStatus.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRead = resolve;
      }),
    );
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    api.getEmployerCacheStatus.mockResolvedValue(updated);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await act(async () => {
      finishRead(original);
    });
    expect(container.textContent).toContain('名单日期：2026-09-21 · 9 条');
  });

  it('recovers from a local status read failure on focus', async () => {
    api.getEmployerCacheStatus.mockRejectedValueOnce(new Error('Synthetic local read failure'));
    await mount();
    expect(container.textContent).toContain('无法读取本地名单状态');
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(container.textContent).toContain('名单日期：2026-09-18 · 3 条');
    expect(container.textContent).not.toContain('无法读取本地名单状态');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it.each(['read', 'refresh', 'import', 'export'] as const)(
    'ignores a late %s completion after unmount and removes status listeners',
    async (operation) => {
      let finish!: (value: unknown) => void;
      const pending = new Promise((resolve) => {
        finish = resolve;
      });
      if (operation === 'read') api.getEmployerCacheStatus.mockReturnValueOnce(pending);
      if (operation === 'refresh') sendMessage.mockReturnValueOnce(pending);
      if (operation === 'import') api.importEmployerBackup.mockReturnValueOnce(pending);
      if (operation === 'export') api.exportEmployerBackup.mockReturnValueOnce(pending);
      await mount();
      if (operation === 'refresh') await click('立即更新');
      if (operation === 'import') await select(backupFile().file);
      if (operation === 'export') await click('导出名单');
      await act(async () => {
        root.unmount();
      });
      const reads = api.getEmployerCacheStatus.mock.calls.length;
      await act(async () => {
        finish(
          operation === 'refresh'
            ? { ok: true, cache: updated }
            : operation === 'export'
              ? '{}'
              : updated,
        );
        window.dispatchEvent(new Event('focus'));
      });
      expect(messageListeners.size).toBe(0);
      expect(container.childElementCount).toBe(0);
      expect(api.getEmployerCacheStatus).toHaveBeenCalledTimes(reads);
      expect(createUrl).not.toHaveBeenCalled();
      expect(fetchOnline).not.toHaveBeenCalled();
    },
  );
});
