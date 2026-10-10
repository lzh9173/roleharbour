// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/ui/App';
import { t } from '../src/i18n';
import { applyLanguagePreference, loadLanguagePreference } from '../src/i18n/preference';
import { classConflicts } from './class-conflicts';

vi.mock('../src/ui/EmployerSettings', () => ({
  EmployerSettings: () =>
    createElement('section', { 'data-testid': 'employer-settings' }, t('settings.employerList')),
}));

let container: HTMLDivElement;
let root: Root;
let languageStorage: Record<string, unknown>;
let saveLanguage: ReturnType<typeof vi.fn>;
let runtimeMessage: ReturnType<typeof vi.fn>;
let requestPermission: ReturnType<typeof vi.fn>;
let getURL: ReturnType<typeof vi.fn>;

async function mount() {
  await act(async () => root.render(createElement(App)));
}

function languageSelect() {
  return container.querySelector<HTMLSelectElement>('[data-testid="language-setting"] select')!;
}

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function languageAlert() {
  return container.querySelector('[data-testid="language-settings"] [role="alert"]')!;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  runtimeMessage = vi.fn();
  requestPermission = vi.fn();
  getURL = vi.fn((path: string) => `chrome-extension://abcdefghijklmnopabcdefghijklmnop/${path}`);
  languageStorage = {};
  saveLanguage = vi.fn(async (data: Record<string, unknown>) => {
    Object.assign(languageStorage, data);
  });
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'abcdefghijklmnopabcdefghijklmnop',
      sendMessage: runtimeMessage,
      getManifest: () => ({ version: '0.22.0' }),
      getURL,
    },
    permissions: { request: requestPermission },
    storage: {
      local: { get: vi.fn(async () => ({ ...languageStorage })), set: saveLanguage },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  applyLanguagePreference('auto');
});

describe('on-device settings page', () => {
  it('shows the header, then the employer card first, collected ads, language and privacy', async () => {
    await mount();
    const header = container.querySelector('header')!;
    expect(header.textContent).toContain('RoleHarbour');
    expect(header.textContent).toContain('版本 0.22.0');
    expect(container.querySelector('h1')?.textContent).toBe('设置');
    expect(header.textContent).toContain('所有分析都在本机完成');
    const page = container.querySelector('[data-testid="settings-page"]')!;
    expect(page.tagName).toBe('MAIN');
    expect([...page.children].map((node) => node.getAttribute('data-testid'))).toEqual([
      'employer-settings',
      'language-settings',
      'privacy-settings',
    ]);
    expect(document.title).toBe('设置');
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('styles every control without competing utilities', async () => {
    await mount();
    expect(classConflicts(container)).toEqual([]);
  });

  it('has no API key, consent, automatic-analysis or job backup controls', async () => {
    await mount();
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelectorAll('select')).toHaveLength(1);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('details')).toBeNull();
    expect(container.textContent).not.toMatch(
      /Key|TypeSafe|JEV|同意|自动分析|导出备份|导入备份|清空岗位记录|岗位记录/i,
    );
    expect(container.querySelector('a[href*="typesafe"]')).toBeNull();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(runtimeMessage).not.toHaveBeenCalled();
    expect(saveLanguage).not.toHaveBeenCalled();
  });

  it('links the privacy card to the bundled data source notice', async () => {
    await mount();
    const privacy = container.querySelector('[data-testid="privacy-settings"]')!;
    expect(privacy.querySelector('h2')?.textContent).toBe('隐私与数据来源');
    expect(privacy.textContent).toContain('插件只会联网下载公开的认证雇主名单');
    const link = privacy.querySelector('a')!;
    expect(getURL).toHaveBeenCalledWith('occupation-sources.txt');
    expect(link.href).toBe(
      'chrome-extension://abcdefghijklmnopabcdefghijklmnop/occupation-sources.txt',
    );
    expect(link.textContent).toBe('数据来源与许可 ↗');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
  });

  it('omits the version when the manifest is unavailable', async () => {
    vi.stubGlobal('chrome', { ...chrome, runtime: { ...chrome.runtime, getManifest: undefined } });
    await mount();
    expect(container.querySelector('header')?.textContent).not.toContain('版本');
    expect(container.querySelector('header p')?.textContent).toBe('RoleHarbour');
  });
});

it('renders English settings from the browser UI language', async () => {
  chrome.i18n = { getUILanguage: () => 'en-GB' } as typeof chrome.i18n;
  await mount();
  expect(container.querySelector('h1')?.textContent).toBe('Settings');
  expect(container.textContent).toContain('Version 0.22.0');
  expect(container.textContent).toContain('Accredited employer list');
  expect(container.textContent).toContain('Privacy and data sources');
  const copy = container.cloneNode(true) as HTMLElement;
  copy.querySelector('select')?.remove();
  expect(copy.textContent).not.toMatch(/\p{Script=Han}/u);
  expect(document.documentElement.lang).toBe('en');
});

it('switches among all five languages and saves immediately', async () => {
  chrome.i18n = { getUILanguage: () => 'en-GB' } as typeof chrome.i18n;
  await mount();
  const select = languageSelect();
  expect([...select.options].map((option) => option.value)).toEqual([
    'auto',
    'zh-CN',
    'en',
    'zh-TW',
    'ja',
    'ko',
  ]);
  for (const [locale, title] of [
    ['zh-CN', '设置'],
    ['en', 'Settings'],
    ['zh-TW', '設定'],
    ['ja', '設定'],
    ['ko', '설정'],
  ] as const) {
    await choose(select, locale);
    expect(container.querySelector('h1')?.textContent).toBe(title);
    expect(document.documentElement.lang).toBe(locale);
    expect(document.title).toBe(title);
    expect(languageStorage).toEqual({ uiLanguage: locale });
    expect(languageAlert().textContent).toBe('');
  }
  await act(async () => {
    applyLanguagePreference('auto');
    await loadLanguagePreference();
  });
  expect(select.value).toBe('ko');
  await choose(select, 'auto');
  expect(container.querySelector('h1')?.textContent).toBe('Settings');
  expect(languageStorage).toEqual({ uiLanguage: 'auto' });
  expect(runtimeMessage).not.toHaveBeenCalled();
  expect(requestPermission).not.toHaveBeenCalled();
});

it('disables the language select while saving', async () => {
  await mount();
  let finish!: () => void;
  saveLanguage.mockImplementationOnce(
    (data: Record<string, unknown>) =>
      new Promise<void>((resolve) => {
        finish = () => {
          Object.assign(languageStorage, data);
          resolve();
        };
      }),
  );
  const select = languageSelect();
  await choose(select, 'en');
  expect(select.disabled).toBe(true);
  await act(async () => finish());
  expect(select.disabled).toBe(false);
  expect(container.querySelector('h1')?.textContent).toBe('Settings');
});

it('keeps the current language and shows the failure in the alert when saving fails', async () => {
  await mount();
  expect(languageAlert().textContent).toBe('');
  saveLanguage.mockRejectedValueOnce(new Error('storage unavailable'));
  const select = languageSelect();
  await choose(select, 'ja');
  expect(select.value).toBe('auto');
  expect(container.querySelector('h1')?.textContent).toBe('设置');
  expect(languageAlert().textContent).toBe('语言设置未保存，请重试。');
  expect(select.disabled).toBe(false);
  await choose(select, 'en');
  expect(languageAlert().textContent).toBe('');
  expect(container.querySelector('h1')?.textContent).toBe('Settings');
});
