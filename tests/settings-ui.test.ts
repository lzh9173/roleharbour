// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/ui/App';
import { t } from '../src/i18n';
import { applyLanguagePreference, loadLanguagePreference } from '../src/i18n/preference';

const settings = vi.hoisted(() => ({
  getKeyState: vi.fn(),
  getPagePreferences: vi.fn(),
  saveApiKey: vi.fn(),
  clearApiKey: vi.fn(),
  setAutoAnalyze: vi.fn(),
}));
const database = vi.hoisted(() => ({
  listJobs: vi.fn(),
  listTasks: vi.fn(),
  clearAllJobs: vi.fn(),
  importJobs: vi.fn(),
  serializeJobs: vi.fn(),
}));
vi.mock('../src/storage/settings', () => settings);
vi.mock('../src/storage/db', () => database);
vi.mock('../src/ui/EmployerSettings', () => ({
  EmployerSettings: () =>
    createElement('section', { 'data-testid': 'employer-settings' }, t('settings.employerList')),
}));

let container: HTMLDivElement;
let root: Root;
let requestPermission: ReturnType<typeof vi.fn>;
let languageStorage: Record<string, unknown>;
let saveLanguage: ReturnType<typeof vi.fn>;
let runtimeMessage: ReturnType<typeof vi.fn>;

function button(label: string) {
  const result = [...container.querySelectorAll('button')].find(
    (element) => element.textContent === label,
  );
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}

function checkbox(label: string) {
  const result = [...container.querySelectorAll('label')]
    .find((element) => element.textContent?.includes(label))
    ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!result) throw new Error(`Missing checkbox: ${label}`);
  return result;
}

async function mount() {
  await act(async () => root.render(createElement(App)));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  location.hash = '#settings';
  database.listJobs.mockResolvedValue([]);
  database.listTasks.mockResolvedValue([
    { id: 'old-task', status: 'outcome_unknown', startedAt: 1, message: '上次分析结果未知' },
  ]);
  settings.getKeyState.mockResolvedValue({ configured: false, remembered: false, consent: false });
  settings.getPagePreferences.mockResolvedValue({
    provider: 'jev',
    ready: false,
    autoAnalyze: false,
  });
  settings.setAutoAnalyze.mockImplementation(async (autoAnalyze: boolean, provider = 'jev') => ({
    provider,
    ready: true,
    autoAnalyze,
  }));
  settings.saveApiKey.mockImplementation(async () => {
    settings.getKeyState.mockResolvedValue({ configured: true, remembered: true, consent: true });
    settings.getPagePreferences.mockResolvedValue({
      provider: 'jev',
      ready: true,
      autoAnalyze: false,
    });
  });
  settings.clearApiKey.mockImplementation(async () => {
    settings.getKeyState.mockResolvedValue({
      configured: false,
      remembered: false,
      consent: false,
    });
    settings.getPagePreferences.mockResolvedValue({
      provider: 'jev',
      ready: false,
      autoAnalyze: false,
    });
  });
  requestPermission = vi.fn().mockResolvedValue(true);
  runtimeMessage = vi
    .fn()
    .mockResolvedValue({ ok: true, status: { state: 'idle' }, enabled: false });
  languageStorage = {};
  saveLanguage = vi.fn(async (data: Record<string, unknown>) => {
    Object.assign(languageStorage, data);
  });
  vi.stubGlobal('chrome', {
    runtime: { id: 'abcdefghijklmnopabcdefghijklmnop', sendMessage: runtimeMessage },
    tabs: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    permissions: { request: requestPermission },
    storage: { local: { get: vi.fn(async () => ({ ...languageStorage })), set: saveLanguage } },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  location.hash = '';
  if (vi.isFakeTimers()) {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('compact settings and TypeSafe setup', () => {
  it.each(['', '#settings'])(
    'opens only settings at %s while backup tools stay collapsed',
    async (hash) => {
      location.hash = hash;
      await mount();
      const steps = container.querySelector('ol[aria-label="开始使用 TypeSafe"]')!;
      expect(steps.querySelectorAll('li')).toHaveLength(3);
      expect([...steps.querySelectorAll('a')].map((link) => link.href)).toEqual([
        'https://console.typesafe.ai/',
        'https://console.typesafe.ai/keys',
      ]);
      expect(container.textContent).not.toMatch(/简历|匹配度|AI 评估/);
      expect(container.querySelector('input[accept*=".pdf"]')).toBeNull();
      expect(container.querySelector('[data-testid="basic-settings"]')?.parentElement).toBe(
        container.querySelector('[data-testid="settings-page"]'),
      );
      const details = container.querySelectorAll('details');
      expect(details).toHaveLength(1);
      expect(details[0]?.open).toBe(false);
      expect(details[0]?.querySelector('summary')?.textContent).toBe('更多设置');
      expect(details[0]?.querySelector('[data-testid="employer-settings"]')).not.toBeNull();
      for (const label of ['导出备份', '导入备份', '清空岗位记录']) {
        expect(button(label).closest('details')).toBe(details[0]);
      }
      expect(checkbox('打开 SEEK 职位时自动分析').disabled).toBe(true);
      expect(container.querySelector('.hero, .page-heading, .beta')).toBeNull();
      expect(container.textContent).not.toMatch(
        /能力范围|JOB COMPANION|控制权，在你手里|上次分析结果未知/,
      );
      expect(requestPermission).not.toHaveBeenCalled();

      expect(container.querySelector('h1')?.textContent).toBe('设置');
      expect(container.querySelector('header, nav, footer')).toBeNull();
      expect(container.textContent).not.toMatch(/SEEK\s*FILTER|分析职位|岗位库|查找助手/);
    },
  );

  it('preserves explicit authorization and save behavior without hiding current settings errors', async () => {
    await mount();
    await act(async () => button('保存 Key').click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('请填写 Key');
    expect(settings.saveApiKey).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();

    const input = container.querySelector<HTMLInputElement>('input[type="password"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'synthetic-test-key',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
      checkbox('在此浏览器记住 Key').click();
      checkbox('我同意将用于分析的职位内容').click();
    });
    await act(async () => button('保存 Key').click());
    expect(requestPermission).toHaveBeenCalledExactlyOnceWith({
      origins: ['https://api.typesafe.ai/*'],
    });
    expect(settings.saveApiKey).toHaveBeenCalledExactlyOnceWith('synthetic-test-key', true, true);
    expect(input.value).toBe('');
    expect(container.querySelector('ol[aria-label="开始使用 TypeSafe"]')).toBeNull();
    expect(checkbox('打开 SEEK 职位时自动分析').disabled).toBe(false);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Key 已保存');
  });

  it('keeps the automatic-analysis switch and clearing a configured key usable', async () => {
    settings.getKeyState.mockResolvedValue({ configured: true, remembered: true, consent: true });
    settings.getPagePreferences.mockResolvedValue({
      provider: 'jev',
      ready: true,
      autoAnalyze: false,
    });
    await mount();
    expect(container.querySelector('ol[aria-label="开始使用 TypeSafe"]')).toBeNull();
    await act(async () => checkbox('打开 SEEK 职位时自动分析').click());
    expect(settings.setAutoAnalyze).toHaveBeenCalledExactlyOnceWith(true, 'jev');
    expect(checkbox('打开 SEEK 职位时自动分析').checked).toBe(true);
    await act(async () => button('清除 Key').click());
    expect(settings.clearApiKey).toHaveBeenCalledExactlyOnceWith();
    expect(checkbox('打开 SEEK 职位时自动分析').checked).toBe(false);
    expect(checkbox('打开 SEEK 职位时自动分析').disabled).toBe(true);
    expect(container.querySelector('ol[aria-label="开始使用 TypeSafe"]')).not.toBeNull();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('serializes Key writes while a permission request is pending', async () => {
    settings.getKeyState.mockResolvedValue({ configured: true, remembered: true, consent: true });
    settings.getPagePreferences.mockResolvedValue({
      provider: 'jev',
      ready: true,
      autoAnalyze: false,
    });
    let allow!: (value: boolean) => void;
    requestPermission.mockImplementation(
      () => new Promise<boolean>((resolve) => (allow = resolve)),
    );
    await mount();
    const input = container.querySelector<HTMLInputElement>('input[type="password"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'replacement-test-key',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
      checkbox('我同意将用于分析的职位内容').click();
    });
    await act(async () => {
      button('保存 Key').click();
      button('保存 Key').click();
      button('清除 Key').click();
    });
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(settings.clearApiKey).not.toHaveBeenCalled();
    expect(button('保存 Key').disabled).toBe(true);
    expect(button('清除 Key').disabled).toBe(true);
    expect(input.disabled).toBe(true);
    expect(checkbox('打开 SEEK 职位时自动分析').disabled).toBe(true);
    await act(async () => allow(true));
    expect(settings.saveApiKey).toHaveBeenCalledExactlyOnceWith(
      'replacement-test-key',
      false,
      true,
    );
    expect(button('清除 Key').disabled).toBe(false);
    await act(async () => button('清除 Key').click());
    expect(settings.clearApiKey).toHaveBeenCalledExactlyOnceWith();
    expect(checkbox('打开 SEEK 职位时自动分析').disabled).toBe(true);
  });

  it('does not restore stale Key and auto-analysis state after a focus read races with clearing', async () => {
    const oldKeyState = { configured: true, remembered: true, consent: true };
    settings.getKeyState.mockResolvedValue(oldKeyState);
    settings.getPagePreferences.mockResolvedValue({
      provider: 'jev',
      ready: true,
      autoAnalyze: true,
    });
    await mount();
    let finishRead!: (value: typeof oldKeyState) => void;
    settings.getKeyState.mockImplementationOnce(
      () => new Promise((resolve) => (finishRead = resolve)),
    );
    await act(async () => window.dispatchEvent(new Event('focus')));
    await act(async () => button('清除 Key').click());
    await act(async () => finishRead(oldKeyState));
    expect(button('清除 Key').disabled).toBe(true);
    expect(checkbox('打开 SEEK 职位时自动分析').checked).toBe(false);
    expect(checkbox('打开 SEEK 职位时自动分析').disabled).toBe(true);
    expect(container.querySelector('ol[aria-label="开始使用 TypeSafe"]')).not.toBeNull();
  });

  it('restores settings controls when saving the Key fails', async () => {
    await mount();
    const input = container.querySelector<HTMLInputElement>('input[type="password"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'synthetic-test-key',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
      checkbox('我同意将用于分析的职位内容').click();
    });
    settings.saveApiKey.mockRejectedValueOnce(new Error('storage unavailable'));
    await act(async () => button('保存 Key').click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('storage unavailable');
    expect(button('保存 Key').disabled).toBe(false);
    expect(input.disabled).toBe(false);
    expect(input.value).toBe('synthetic-test-key');
  });
});

it('renders English settings from the browser UI language and preserves consent controls', async () => {
  chrome.i18n = { getUILanguage: () => 'en-GB' } as typeof chrome.i18n;
  await mount();
  expect(container.querySelector('h1')?.textContent).toBe('Settings');
  expect(container.textContent).toContain('Basic settings');
  expect(container.textContent).toContain('More settings');
  const copy = container.cloneNode(true) as HTMLElement;
  copy.querySelector('select')?.remove();
  expect(copy.textContent).not.toMatch(/\p{Script=Han}/u);
  expect(container.querySelector('details')?.open).toBe(false);
  expect(button('Save Key')).toBeDefined();
  await act(async () => button('Save Key').click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Enter your Key');
  expect(settings.saveApiKey).not.toHaveBeenCalled();
  expect(requestPermission).not.toHaveBeenCalled();
});

it('switches among all five languages, saves immediately, and preserves unsaved Key input', async () => {
  chrome.i18n = { getUILanguage: () => 'en-GB' } as typeof chrome.i18n;
  await mount();
  const select = container.querySelector<HTMLSelectElement>(
    '[data-testid="language-setting"] select',
  )!;
  expect([...select.options].map((option) => option.value)).toEqual([
    'auto',
    'zh-CN',
    'en',
    'zh-TW',
    'ja',
    'ko',
  ]);
  const input = container.querySelector<HTMLInputElement>('input[type="password"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'unsaved-test-key',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  for (const [locale, title] of [
    ['zh-CN', '设置'],
    ['en', 'Settings'],
    ['zh-TW', '設定'],
    ['ja', '設定'],
    ['ko', '설정'],
  ]) {
    await act(async () => {
      select.value = locale!;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('h1')?.textContent).toBe(title);
    expect(document.documentElement.lang).toBe(locale);
    expect(document.title).toBe(title);
    expect(languageStorage).toEqual({ uiLanguage: locale });
    expect(input.value).toBe('unsaved-test-key');
  }
  expect(settings.saveApiKey).not.toHaveBeenCalled();
  expect(settings.setAutoAnalyze).not.toHaveBeenCalled();
  expect(database.listJobs).toHaveBeenCalledTimes(1);
  expect(requestPermission).not.toHaveBeenCalled();
  await act(async () => {
    applyLanguagePreference('auto');
    await loadLanguagePreference();
  });
  expect(select.value).toBe('ko');
  await act(async () => {
    select.value = 'auto';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(container.querySelector('h1')?.textContent).toBe('Settings');
  expect(languageStorage).toEqual({ uiLanguage: 'auto' });
});

it('keeps the current language and shows an error when saving fails', async () => {
  await mount();
  saveLanguage.mockRejectedValueOnce(new Error('storage unavailable'));
  const select = container.querySelector<HTMLSelectElement>(
    '[data-testid="language-setting"] select',
  )!;
  await act(async () => {
    select.value = 'ja';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(select.value).toBe('auto');
  expect(container.querySelector('h1')?.textContent).toBe('设置');
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('语言设置未保存');
  expect(select.disabled).toBe(false);
});

it.each(['zh-CN', 'en', 'zh-TW', 'ja', 'ko'] as const)(
  'exposes only JEV configuration in %s',
  async (locale) => {
    applyLanguagePreference(locale);
    await mount();
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    expect(container.querySelectorAll('select')).toHaveLength(1);
    expect(container.querySelector('[data-testid="analysis-provider-setting"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Codex|Qwen|WebGPU/);
    expect(container.querySelector('a[href="./qwen.html"]')).toBeNull();
    expect(requestPermission).not.toHaveBeenCalled();
  },
);
