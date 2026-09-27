// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://nz.seek.com/jobs?selectedjob=11"}
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountSeekIntegration } from '../src/inpage/mount';
import type { SavedJob } from '../src/core/schema';
import type { PagePreferences } from '../src/storage/settings';
import type { EmployerCheck } from '../src/employers';
import { applyLanguagePreference } from '../src/i18n/preference';
import { t } from '../src/i18n';

const description =
  'Design and maintain software systems, review application changes and diagnose production incidents with the engineering team.';
const fixture =
  () => `<article data-testid="job-card"><h3><a data-automation="jobTitle" href="/job/11">Software Engineer</a></h3><span data-automation="jobCompany">Synthetic Employer</span></article>
  <main><section data-testid="job-detail" data-job-id="11">
    <h1 data-automation="job-detail-title">Software Engineer</h1>
    <span data-automation="advertiser-name">Synthetic Employer</span>
    <span data-automation="job-detail-location">Auckland</span>
    <div data-automation="jobAdDetails"><p>${description}</p></div>
    <a data-automation="job-detail-apply" href="/job/11/apply">Apply</a>
  </section></main>`;

let cleanup: (() => void) | undefined;
let shadows: Map<HTMLElement, ShadowRoot>;
let send: ReturnType<typeof vi.fn>;
let preferences: PagePreferences;
let visibility: DocumentVisibilityState;
const calls = (type: string) => send.mock.calls.filter(([message]) => message.type === type);
function savedJob(): SavedJob {
  const decision = <T extends string>(choice: T) => ({
    choice,
    probabilities: { [choice]: 1 },
    confidence: 1,
    evidence: [],
  });
  return {
    id: 'analysis-11',
    title: 'Software Engineer',
    employer: 'Synthetic Employer',
    location: 'Auckland',
    sourceUrl: 'https://nz.seek.com/job/11',
    contentHash: 'synthetic-hash',
    salary: { min: null, max: null, currency: 'NZD', period: 'annual', hoursPerWeek: null },
    createdAt: 1,
    updatedAt: 1,
    bookmarked: false,
    candidateIds: [],
    mode: 'jev',
    dataVersion: 'test-version',
    evidence: [],
    jev: {
      model: 'synthetic-model',
      occupation: decision('none'),
      sponsorship: decision('not_mentioned'),
      workRights: decision('not_mentioned'),
      residency: decision('not_mentioned'),
      requirements: { skills: [], experience: [], truncated: false },
      usage: { inputTokens: 10, outputTokens: 0 },
    },
  };
}
function reply(message: { type: string }) {
  switch (message.type) {
    case 'page:preferences':
      return { ok: true, preferences: { ...preferences } };
    case 'page:employers':
      return { ok: true, employers: [] };
    case 'page:analyze':
      return { ok: true, job: savedJob(), cached: true };
    default:
      return { ok: true };
  }
}
function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

const hosts = (kind?: string) =>
  Array.from(
    document.querySelectorAll<HTMLElement>(
      kind ? `[data-seek-filter="${kind}"]` : '[data-seek-filter]',
    ),
  );
function shadow(kind: string): ShadowRoot {
  const root = shadows.get(hosts(kind)[0]!);
  if (!root) throw new Error(`Missing ${kind} mount`);
  return root;
}
function button(root: ShadowRoot, label: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find(
    (node) => node.textContent === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function flush(ms = 800) {
  await act(async () => {
    // Deliver real MutationObserver microtasks before advancing its debounce.
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function mount() {
  await act(async () => {
    cleanup = mountSeekIntegration();
  });
}
function changeCard(id: string, title = 'Systems Administrator') {
  const link = document.querySelector<HTMLAnchorElement>('article a')!;
  link.href = `/job/${id}`;
  link.textContent = title;
}
function changeDetail(id: string, title = 'Systems Administrator') {
  document.querySelector('[data-testid="job-detail"]')!.setAttribute('data-job-id', id);
  document.querySelector('[data-automation="job-detail-title"]')!.textContent = title;
  document
    .querySelector('[data-automation="job-detail-apply"]')!
    .setAttribute('href', `/job/${id}/apply`);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  preferences = { provider: 'jev', autoAnalyze: false, ready: true };
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  send = vi.fn().mockImplementation(async (message) => reply(message));
  vi.stubGlobal('chrome', { runtime: { id: 'test-extension-id', sendMessage: send } });
  history.replaceState(null, '', '/jobs?selectedjob=11');
  document.body.innerHTML = fixture();
  shadows = new Map();
  const attachShadow = HTMLElement.prototype.attachShadow;
  // Observe closed roots in this test only; production remains closed.
  vi.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(function (
    this: HTMLElement,
    init,
  ) {
    const root = attachShadow.call(this, init);
    shadows.set(this, root);
    return root;
  });
});

afterEach(async () => {
  await act(async () => {
    cleanup?.();
    cleanup = undefined;
  });
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('mounted SEEK integration on synthetic public DOM', () => {
  it.each([false, true])(
    'shows basic requirements without a Key even with stale auto=%s',
    async (autoAnalyze) => {
      preferences = { provider: 'jev', autoAnalyze, ready: false };
      document.querySelector('[data-automation="jobAdDetails"]')!.textContent =
        'Requirements:\nPython skills required.\nThree years of engineering experience required.';
      await mount();
      await flush(2_000);
      const panel = shadow('detail');
      expect(panel.textContent).toContain(t('page.basicOverview'));
      expect(panel.textContent).toContain('Python skills required.');
      expect(panel.textContent).toContain('Three years of engineering experience required.');
      expect(button(panel, t('page.configureAi')).disabled).toBe(false);
      expect(panel.textContent).not.toContain(t('page.analysisConsent'));
      expect(panel.querySelector('.occupation-visa')).toBeNull();
      expect(calls('page:analyze')).toHaveLength(0);
      expect(calls('page:employers').length).toBeGreaterThan(0);
    },
  );

  it('renders basic excerpts while the settings response is still pending', async () => {
    send.mockImplementation((message) =>
      message.type === 'page:preferences' ? new Promise(() => {}) : Promise.resolve(reply(message)),
    );
    document.querySelector('[data-automation="jobAdDetails"]')!.textContent =
      'Must have Python skills and experience developing production software.';
    await mount();
    await flush();
    expect(shadow('detail').textContent).toContain('Must have Python skills');
    expect(calls('page:analyze')).toHaveLength(0);
  });

  it('retains basic excerpts when an optional AI request fails', async () => {
    preferences.autoAnalyze = true;
    send.mockImplementation(async (message) =>
      message.type === 'page:analyze'
        ? { ok: false, error: 'Synthetic provider unavailable' }
        : reply(message),
    );
    await mount();
    await flush();
    expect(shadow('detail').querySelector('.basic-overview')).not.toBeNull();
    expect(shadow('detail').textContent).toContain('Synthetic provider unavailable');
    expect(calls('page:analyze')).toHaveLength(1);
  });

  it.each(['enabled', 'error'])(
    'ignores an older %s preference response after a newer focus read',
    async (older) => {
      let finishOld!: (response: unknown) => void;
      let reads = 0;
      send.mockImplementation((message) => {
        if (message.type === 'page:preferences' && reads++ === 0)
          return new Promise((resolve) => (finishOld = resolve));
        return Promise.resolve(reply(message));
      });
      await mount();
      await act(async () => window.dispatchEvent(new Event('focus')));
      await act(async () => {
        finishOld(
          older === 'enabled'
            ? { ok: true, preferences: { provider: 'jev', autoAnalyze: true, ready: true } }
            : { ok: false, error: 'Outdated settings read failed' },
        );
      });
      await flush(1_000);
      expect(calls('page:preferences')).toHaveLength(2);
      expect(calls('page:analyze')).toHaveLength(0);
      expect(button(shadow('detail'), '分析岗位').disabled).toBe(true);
      expect(shadow('detail').querySelector('[role="alert"]')).toBeNull();
    },
  );

  it('shows retry progress only for the current request and clears it on success', async () => {
    preferences.autoAnalyze = true;
    const listeners = new Set<(message: unknown, sender: chrome.runtime.MessageSender) => void>();
    Object.assign(chrome.runtime, {
      onMessage: {
        addListener: (listener: (message: unknown, sender: chrome.runtime.MessageSender) => void) =>
          listeners.add(listener),
        removeListener: (
          listener: (message: unknown, sender: chrome.runtime.MessageSender) => void,
        ) => listeners.delete(listener),
      },
    });
    let complete!: (response: unknown) => void;
    send.mockImplementation((message) =>
      message.type === 'page:analyze'
        ? new Promise((resolve) => {
            complete = resolve;
          })
        : Promise.resolve(reply(message)),
    );
    await mount();
    await flush(700);
    const requestId = calls('page:analyze')[0]![0].requestId;
    const progress = { type: 'page:analysis-retry', requestId, attempt: 1 };
    const emit = async (message: unknown, senderId = chrome.runtime.id) => {
      await act(async () => {
        for (const listener of listeners) listener(message, { id: senderId });
      });
    };
    await emit({ ...progress, requestId: crypto.randomUUID() });
    await emit({ ...progress, attempt: 3 });
    await emit(progress, 'other-extension');
    expect(shadow('detail').querySelector('[role="status"]')?.textContent).toContain(
      t('page.analysing'),
    );
    await emit(progress);
    expect(shadow('detail').querySelector('[role="status"]')?.textContent).toContain(
      t('page.retrying', { attempt: 1 }),
    );
    expect(shadow('detail').querySelector('[role="alert"]')).toBeNull();
    await emit({ ...progress, attempt: 2 });
    expect(shadow('detail').querySelector('[role="status"]')?.textContent).toContain(
      t('page.retrying', { attempt: 2 }),
    );
    await act(async () => complete({ ok: true, job: savedJob() }));
    await emit(progress);
    expect(shadow('detail').textContent).not.toContain(t('page.retrying', { attempt: 1 }));
    expect(calls('page:analyze')).toHaveLength(1);
  });

  it('queries two-letter employer names from both cards and details', async () => {
    document.body.innerHTML = fixture().replaceAll('Synthetic Employer', 'QX');
    await mount();
    await flush();
    expect(calls('page:employers').map(([message]) => message.names)).toEqual([['QX']]);
  });

  it('keeps the analysis control focusable while busy so a host dialog does not reclaim focus', async () => {
    preferences.autoAnalyze = true;
    let complete!: (response: unknown) => void;
    send.mockImplementation((message) =>
      message.type === 'page:analyze'
        ? new Promise((resolve) => {
            complete = resolve;
          })
        : Promise.resolve(reply(message)),
    );
    await mount();
    await flush(0);
    const panel = shadow('detail');
    const control = button(panel, '分析岗位');
    control.focus();
    await flush(700);
    expect(calls('page:analyze')).toHaveLength(1);
    expect(control.disabled).toBe(false);
    expect(control.getAttribute('aria-disabled')).toBe('true');
    expect(control.type).toBe('button');
    expect(panel.activeElement).toBe(control);
    await act(async () => complete({ ok: true, job: savedJob() }));
    expect(button(panel, '重新分析')).toBe(control);
    expect(control.getAttribute('aria-disabled')).toBe('false');
    expect(panel.activeElement).toBe(control);
  });

  it('does not start observers or messages for an already invalidated WXT context', async () => {
    const unsubscribe = vi.fn();
    const onInvalidated = vi.fn(() => unsubscribe);
    await act(async () => {
      cleanup = mountSeekIntegration({ isInvalid: true, onInvalidated });
    });
    expect(onInvalidated).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(hosts()).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up on WXT invalidation even while Chrome still exposes its runtime ID', async () => {
    const controller = new AbortController();
    await act(async () => {
      cleanup = mountSeekIntegration({
        get isInvalid() {
          return controller.signal.aborted;
        },
        onInvalidated(listener) {
          controller.signal.addEventListener('abort', listener);
          return () => controller.signal.removeEventListener('abort', listener);
        },
      });
    });
    expect(hosts()).toHaveLength(3);
    await act(async () => controller.abort());
    const sent = send.mock.calls.length;
    window.dispatchEvent(new Event('focus'));
    await flush(1_000);
    expect(hosts()).toHaveLength(0);
    expect(send).toHaveBeenCalledTimes(sent);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('handles a synchronous cancel failure during normal component teardown', async () => {
    preferences.autoAnalyze = true;
    send.mockImplementation((message) => {
      if (message.type === 'page:analyze') return new Promise(() => {});
      if (message.type === 'page:cancel') throw new Error('Extension context invalidated.');
      return Promise.resolve(reply(message));
    });
    await mount();
    await flush(700);
    expect(calls('page:analyze')).toHaveLength(1);
    await act(async () => cleanup!());
    expect(calls('page:cancel')).toHaveLength(1);
    expect(hosts()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps recommended-card time and absolute save/hide controls below its label', async () => {
    history.replaceState(null, '', '/');
    document.body.innerHTML = `<ul><li><div id="feed-card" style="position:relative">
      <a data-automation="recommendedJobLink_11" href="/job/11" aria-label="Software Engineer"></a>
      <div id="feed-content"><div><h3><span data-automation="jobTitle">Software Engineer</span></h3></div>
        <span id="feed-time">3d ago</span></div>
      <div id="feed-actions" style="position:absolute;bottom:0;right:0"><button>Save</button><button>Hide</button></div>
    </div></li></ul>`;
    const actions = document.querySelector('#feed-actions')!;
    await mount();
    const host = hosts('card')[0]!;
    expect(host.parentElement?.id).toBe('feed-content');
    expect(host.nextElementSibling?.id).toBe('feed-time');
    expect(host.dataset.seekFilterPlacement).toBe('feed');
    expect(document.querySelector('#feed-actions')).toBe(actions);
    expect(actions.parentElement?.id).toBe('feed-card');
    await flush(2_000);
    expect(hosts('card')).toEqual([host]);
    expect(calls('page:analyze')).toHaveLength(0);
  });

  it('decorates cards and visible details without analysis or observer self-loops', async () => {
    await mount();
    const originalHosts = hosts();
    expect(hosts('card')).toHaveLength(1);
    expect(hosts('toolbar')).toHaveLength(1);
    expect(hosts('detail')).toHaveLength(1);
    expect(originalHosts.every((host) => host.shadowRoot === null)).toBe(true);
    expect(shadow('card').textContent).toContain('查询中');
    expect(shadow('detail').textContent).toContain('岗位速览');
    expect(shadow('detail').textContent).not.toMatch(/简历匹配|检查简历|重新匹配|AI 评估/);
    await flush(2_000);
    expect(hosts()).toEqual(originalHosts);
    expect(calls('page:badges')).toHaveLength(0);
    expect(calls('page:preferences')).toHaveLength(1);
    expect(calls('page:analyze')).toHaveLength(0);
    expect(send.mock.calls.some(([message]) => message.type.includes('resume'))).toBe(false);
  });

  it('reconciles a reused card and rejects old details while the SPA URL advances', async () => {
    await mount();
    const card = document.querySelector('article')!;
    const oldCardHost = hosts('card')[0]!;
    const oldDetailHost = hosts('detail')[0]!;
    changeCard('22');
    history.replaceState(null, '', '/jobs?selectedjob=22');
    await flush();
    expect(document.querySelector('article')).toBe(card);
    expect(card.querySelectorAll('[data-seek-filter="card"]')).toHaveLength(1);
    expect(oldCardHost.isConnected).toBe(false);
    expect(oldDetailHost.isConnected).toBe(false);
    expect(hosts('detail')).toHaveLength(0);
    expect(shadow('card').querySelector('a')?.href).toBe('https://nz.seek.com/job/22#seek-filter');

    changeDetail('22');
    await flush();
    expect(hosts('detail')).toHaveLength(1);
    expect(hosts()).toHaveLength(3);
    expect(calls('page:analyze')).toHaveLength(0);
  });

  it('removes stale card and detail mounts when the host page removes their source DOM', async () => {
    await mount();
    document.querySelector('article')!.remove();
    await flush();
    expect(hosts('card')).toHaveLength(0);
    expect(hosts('toolbar')).toHaveLength(0);
    expect(hosts('detail')).toHaveLength(1);
    document.querySelector('main')!.remove();
    await flush();
    expect(hosts()).toHaveLength(0);
    expect(calls('page:analyze')).toHaveLength(0);
  });

  it('does not submit analysis, grant cloud consent or open settings from synthetic clicks', async () => {
    await mount();
    const panel = shadow('detail');
    const consent = panel.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    const jev = button(panel, '分析岗位');
    await act(async () => {
      consent.click();
      jev.click();
      button(panel, '同意并开启').click();
      button(shadow('toolbar'), '更新名单').click();
      button(panel, '设置').click();
      button(shadow('toolbar'), '设置').click();
    });
    expect(consent.checked).toBe(false);
    expect(jev.disabled).toBe(true);
    expect(calls('page:auto')).toHaveLength(0);
    expect(calls('page:analyze')).toHaveLength(0);
    expect(calls('page:open-workspace')).toHaveLength(0);
    expect(calls('page:employers').some(([message]) => message.force)).toBe(false);
  });

  it('reconciles visibility changes without requiring a route or text mutation', async () => {
    await mount();
    const detail = document.querySelector<HTMLElement>('[data-testid="job-detail"]')!;
    detail.style.display = 'none';
    await flush();
    expect(hosts('detail')).toHaveLength(0);
    detail.style.display = '';
    await flush();
    expect(hosts('detail')).toHaveLength(1);
    const card = document.querySelector<HTMLElement>('article')!;
    card.style.visibility = 'hidden';
    await flush();
    expect(hosts('card')).toHaveLength(0);
    expect(hosts('toolbar')).toHaveLength(0);
  });

  it('fully disconnects cleanup so future mutations, route changes and focus cannot remount', async () => {
    await mount();
    const allMountedHosts = hosts();
    await act(async () => {
      cleanup!();
      cleanup = undefined;
    });
    const callsAtCleanup = send.mock.calls.length;
    expect(allMountedHosts.every((host) => !host.isConnected)).toBe(true);
    expect(hosts()).toHaveLength(0);
    document.body.innerHTML = fixture();
    history.replaceState(null, '', '/jobs?selectedjob=22');
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('popstate'));
    await flush(2_000);
    expect(hosts()).toHaveLength(0);
    expect(send).toHaveBeenCalledTimes(callsAtCleanup);
  });

  it('handles a synchronous preferences send failure before the runtime poll runs', async () => {
    preferences = { provider: 'jev', autoAnalyze: true, ready: true };
    send.mockImplementation((message) => {
      if (message.type === 'page:preferences') throw new Error('Extension context invalidated.');
      return Promise.resolve(reply(message));
    });

    await mount();
    expect(chrome.runtime.id).toBe('test-extension-id');
    expect(shadow('detail').querySelector('[role="alert"]')?.textContent).toContain(
      'Extension context invalidated.',
    );
    expect(button(shadow('detail'), t('page.analyse')).disabled).toBe(true);
    expect(calls('page:preferences')).toHaveLength(1);
    await flush(499);
    expect(calls('page:analyze')).toHaveLength(0);
  });

  it('tears down an invalidated runtime and never remounts after focus, routes or mutations', async () => {
    await mount();
    const allMountedHosts = hosts();
    Object.defineProperty(chrome.runtime, 'id', { configurable: true, value: undefined });

    await flush(500);
    expect(allMountedHosts.every((host) => !host.isConnected)).toBe(true);
    expect(hosts()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    const callsAtInvalidation = send.mock.calls.length;

    document.body.innerHTML = fixture();
    history.replaceState(null, '', '/jobs?selectedjob=22');
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('popstate'));
      setVisibility('hidden');
      setVisibility('visible');
      applyLanguagePreference('en');
      cleanup!();
      cleanup!();
    });
    await flush(2_000);
    expect(hosts()).toHaveLength(0);
    expect(send).toHaveBeenCalledTimes(callsAtInvalidation);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores an invalidated automatic analysis without sending a cancellation to the dead runtime', async () => {
    preferences = { provider: 'jev', autoAnalyze: true, ready: true };
    let resolveAnalysis!: (response: unknown) => void;
    send.mockImplementation(async (message) =>
      message.type === 'page:analyze'
        ? new Promise((resolve) => {
            resolveAnalysis = resolve;
          })
        : reply(message),
    );
    await mount();
    await flush(700);
    expect(calls('page:analyze')).toHaveLength(1);
    const panel = shadow('detail');
    Object.defineProperty(chrome.runtime, 'id', { configurable: true, value: undefined });
    await flush(300);

    expect(hosts()).toHaveLength(0);
    expect(calls('page:cancel')).toHaveLength(0);
    const callsAtInvalidation = send.mock.calls.length;
    await act(async () => {
      resolveAnalysis({ ok: true, job: savedJob() });
      window.dispatchEvent(new Event('focus'));
    });
    await flush(2_000);
    expect(hosts()).toHaveLength(0);
    expect(panel.querySelector('.requirements')).toBeNull();
    expect(calls('page:cancel')).toHaveLength(0);
    expect(send).toHaveBeenCalledTimes(callsAtInvalidation);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('finishes runtime invalidation cleanup even when removing a runtime listener throws', async () => {
    const addListener = vi.fn();
    const removeListener = vi.fn(() => {
      throw new Error('Extension context invalidated.');
    });
    Object.defineProperty(chrome.runtime, 'onMessage', {
      configurable: true,
      value: { addListener, removeListener },
    });
    await mount();
    expect(addListener).toHaveBeenCalledTimes(3);
    const retainedListener = addListener.mock.calls[0]![0];
    Object.defineProperty(chrome.runtime, 'id', { configurable: true, value: undefined });
    await flush(500);

    expect(removeListener).toHaveBeenCalledTimes(3);
    expect(hosts()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    const callsAtInvalidation = send.mock.calls.length;
    await act(async () => {
      retainedListener({ type: 'language:changed' }, { id: 'test-extension-id' });
      window.dispatchEvent(new Event('focus'));
      applyLanguagePreference('en');
      cleanup!();
    });
    document.body.innerHTML = fixture();
    await flush(2_000);
    expect(hosts()).toHaveLength(0);
    expect(send).toHaveBeenCalledTimes(callsAtInvalidation);
    expect(removeListener).toHaveBeenCalledTimes(3);
  });

  it('waits 700 ms before one enabled automatic analysis and does not repeat after focus or reconciliation', async () => {
    preferences = { provider: 'jev', autoAnalyze: true, ready: true };
    await mount();
    await flush(699);
    expect(calls('page:analyze')).toHaveLength(0);
    await flush(1);
    expect(calls('page:analyze')).toHaveLength(1);
    expect(calls('page:analyze')[0]![0]).toMatchObject({
      mode: 'jev',
      automatic: true,
      force: false,
      draft: { sourceUrl: 'https://nz.seek.com/job/11', retainBody: false },
    });
    expect(shadow('detail').querySelector('.requirements')).not.toBeNull();
    expect(shadow('detail').textContent).not.toContain('已读取本地缓存');
    document.body.classList.add('host-layout-updated');
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await flush(2_000);
    expect(calls('page:analyze')).toHaveLength(1);
    expect(hosts('detail')).toHaveLength(1);
  });

  it('keeps analysis controls in the header and only employer information collapsed', async () => {
    preferences = { provider: 'jev', autoAnalyze: true, ready: true };
    const skillText = 'Experience with React and TypeScript.';
    const experienceText = 'At least 3 years of software engineering experience.';
    const body = `${description} ${skillText} ${experienceText}`;
    document.querySelector('[data-automation="jobAdDetails"]')!.textContent = body;
    const entry = (text: string, id: string) => ({
      text,
      level: 'required' as const,
      evidence: { id, text, start: body.indexOf(text), end: body.indexOf(text) + text.length },
      confidence: 1,
    });
    const job = savedJob();
    job.jev!.requirements = {
      skills: [entry(skillText, 'skill-1')],
      experience: [{ ...entry(experienceText, 'experience-1'), minYears: 3, maxYears: null }],
      truncated: false,
    };
    send.mockImplementation(async (message) =>
      message.type === 'page:analyze' ? { ok: true, job, cached: true } : reply(message),
    );
    await mount();
    await flush(700);

    const panel = shadow('detail');
    const detailsControls = panel.querySelectorAll<HTMLDetailsElement>('.panel-body > details');
    expect(detailsControls).toHaveLength(1);
    const details = detailsControls[0]!;
    expect(details.querySelector(':scope > summary')?.textContent).toBe('名单详情');
    expect(details.open).toBe(false);
    expect(details.hasAttribute('open')).toBe(false);
    expect(details.textContent).not.toContain(skillText);
    expect(details.textContent).not.toContain(experienceText);
    expect(details.textContent).not.toContain('职位原文');
    expect(details.querySelector('pre')).toBeNull();
    expect(details.textContent).toContain('名单来源');
    expect(Array.from(panel.querySelectorAll('h3'), (node) => node.textContent)).not.toContain(
      '分析设置',
    );
    expect(panel.textContent).not.toContain('已读取本地缓存');
    expect(panel.textContent).not.toContain('已有结果会重复使用');
    expect(details.querySelectorAll('button')).toHaveLength(0);
    expect(calls('page:employer-online')).toHaveLength(0);
    expect(button(panel, '重新分析').closest('.panel-top')).not.toBeNull();
    expect(panel.textContent).not.toContain('关闭自动分析');

    // Closed <details> still contributes textContent in jsdom; inspect the main DOM
    // separately to ensure implementation/provenance text is not duplicated there.
    const main = panel.querySelector('.panel-body')!.cloneNode(true) as HTMLElement;
    main.querySelectorAll('details').forEach((node) => node.remove());
    expect(main.querySelector('.requirements')).not.toBeNull();
    expect(Array.from(main.querySelectorAll('.skill-chip'), (node) => node.textContent)).toEqual([
      'React',
      'TypeScript',
    ]);
    expect(main.querySelector('.experience-line strong')?.textContent).toBe('至少 3 年');
    const visa = panel.querySelector('.occupation-visa')!;
    expect(visa.closest('details')).toBeNull();
    expect(visa.textContent).toContain('职业参考：');
    expect(Array.from(visa.querySelectorAll('.decisions b'), (node) => node.textContent)).toEqual([
      '未说明',
      '未说明',
      '未说明',
    ]);
    expect(details.querySelector('.occupation-visa')).toBeNull();
    for (const removed of ['经验原文', '技能原文', '部分条目未分析', 'AI 筛选的 JD 原文条目']) {
      expect(panel.textContent).not.toContain(removed);
    }
    for (const hidden of [
      skillText,
      experienceText,
      '名单来源',
      '分析设置',
      '已读取本地缓存',
      'synthetic-model',
      '当前 JD',
      '使用 Jev 分析',
    ]) {
      expect(main.textContent).not.toContain(hidden);
    }
    expect(calls('page:analyze')).toHaveLength(1);
  });

  it('shows an automatic Jev experience estimate without displaying its source explanation', async () => {
    preferences = { provider: 'jev', autoAnalyze: true, ready: true };
    const job = savedJob();
    job.jev!.requirements!.experienceEstimate = {
      band: 'one_to_three',
      minYears: 1,
      maxYears: 3,
      confidence: 0.8,
      evidence: [{ id: 'segment_1', text: description, start: 0, end: description.length }],
    };
    send.mockImplementation(async (message) =>
      message.type === 'page:analyze' ? { ok: true, job } : reply(message),
    );
    await mount();
    await flush(700);

    const panel = shadow('detail');
    const row = panel.querySelector('.experience-line')!;
    expect(row.querySelector('strong')?.textContent).toBe('1–3 年');
    expect(row.querySelector('.experience-estimate-tag')?.textContent).toBe('AI 预估');
    expect(panel.querySelector('.experience-estimate-evidence')).toBeNull();
    expect(panel.textContent).not.toContain('经验预估依据');
    expect(panel.textContent).not.toContain('不是雇主明确要求');
    await flush(2_000);
    expect(calls('page:analyze')).toHaveLength(1);
  });

  it.each([
    ['matched', true, '已匹配'],
    ['not_found', false, '未匹配'],
    ['unavailable', false, '暂时无法查询'],
  ] as const)(
    'renders %s employer results with a concise label on cards and details',
    async (status, stale, label) => {
      const employer: EmployerCheck = {
        query: 'Synthetic Employer',
        status,
        stale,
        matches:
          status === 'matched'
            ? [
                {
                  employerName: 'Synthetic Employer',
                  tradingName: '',
                  nzbn: '9429000000001',
                  expiryDate: '2028-01-01',
                },
              ]
            : [],
        checkedAt: 1,
        sourceDate: '2026-09-16',
        note: 'Historical source requires verification.',
      };
      send.mockImplementation(async (message) =>
        message.type === 'page:employers' ? { ok: true, employers: [employer] } : reply(message),
      );
      await mount();
      await flush();
      expect(shadow('card').querySelector('.employer .tag')?.textContent).toBe(label);
      expect(shadow('detail').querySelector('.employer .tag')?.textContent).toBe(label);
      expect(calls('page:analyze')).toHaveLength(0);
    },
  );

  it('shows the alias mapping and source alongside the legal employer identity', async () => {
    const employer: EmployerCheck = {
      query: 'Synthetic Employer',
      status: 'matched',
      stale: false,
      matches: [
        {
          employerName: 'Synthetic Legal Employer',
          tradingName: '',
          nzbn: '9429000000001',
          aliasMatch: { alias: 'Synthetic Employer', sourceUrl: 'https://example.org/identity' },
        },
      ],
      checkedAt: 1,
    };
    send.mockImplementation(async (message) =>
      message.type === 'page:employers' ? { ok: true, employers: [employer] } : reply(message),
    );
    await mount();
    await flush();
    const panel = shadow('detail');
    expect(panel.textContent).toContain('Synthetic Legal Employer');
    expect(panel.textContent).toContain('通过简称 Synthetic Employer 匹配');
    expect(panel.querySelector('a[href="https://example.org/identity"]')?.textContent).toBe(
      '名称对应来源 ↗',
    );
  });

  it.each(['ambiguous', 'unavailable'] as const)(
    'requires review for %s records even when name candidates exist',
    async (status) => {
      const employer: EmployerCheck = {
        query: 'Synthetic Employer',
        status,
        stale: false,
        matches: [
          {
            employerName: 'Synthetic Legal Employer',
            tradingName: '',
            nzbn: '9429000000001',
            candidateMatch: 'short_name',
          },
        ],
        checkedAt: 1,
        note: 'Verify this candidate before relying on it.',
      };
      send.mockImplementation(async (message) =>
        message.type === 'page:employers' ? { ok: true, employers: [employer] } : reply(message),
      );
      await mount();
      await flush();
      for (const kind of ['card', 'detail'] as const) {
        const badge = shadow(kind).querySelector('.employer .tag')!;
        expect(badge.textContent).toBe('需核实');
        expect(badge.className).not.toContain('bg-[#e0f1eb]');
      }
      expect(shadow('detail').textContent).toContain(employer.note);
      expect(shadow('detail').textContent).toContain('可能匹配：公司名称可能未写全');
    },
  );

  it('waits while hidden and restarts the full visibility delay when a hidden tab becomes visible', async () => {
    preferences = { provider: 'jev', autoAnalyze: true, ready: true };
    visibility = 'hidden';
    await mount();
    await flush(2_000);
    expect(calls('page:analyze')).toHaveLength(0);
    await act(async () => {
      setVisibility('visible');
    });
    await flush(350);
    await act(async () => {
      setVisibility('hidden');
    });
    await flush(2_000);
    expect(calls('page:analyze')).toHaveLength(0);
    await act(async () => {
      setVisibility('visible');
    });
    await flush(699);
    expect(calls('page:analyze')).toHaveLength(0);
    await flush(1);
    expect(calls('page:analyze')).toHaveLength(1);
  });

  it('does not automatically analyze when API readiness is false', async () => {
    preferences = { provider: 'jev', autoAnalyze: true, ready: false };
    await mount();
    await flush(2_000);
    expect(calls('page:analyze')).toHaveLength(0);
    expect(shadow('detail').textContent).toContain('配置 AI');
  });

  it('exposes a rejected preferences response without starting automatic analysis', async () => {
    preferences = { provider: 'jev', autoAnalyze: true, ready: true };
    send.mockImplementation(async (message) =>
      message.type === 'page:preferences'
        ? { ok: false, error: '权限已更新，请刷新。' }
        : reply(message),
    );
    await mount();
    await flush(2_000);

    const panel = shadow('detail');
    const alert = panel.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('权限已更新，请刷新。');
    expect(alert?.closest('details')).toBeNull();
    const details = panel.querySelector<HTMLDetailsElement>('.panel-details')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('[role="status"]')).toBeNull();
    expect(button(panel, t('page.analyse')).disabled).toBe(true);
    expect(calls('page:analyze')).toHaveLength(0);
  });

  it('keeps one automatic attempt when a delayed employer result repaints the same detail', async () => {
    preferences = { provider: 'jev', autoAnalyze: true, ready: true };
    let resolveEmployers!: (response: unknown) => void;
    send.mockImplementation(async (message) =>
      message.type === 'page:employers'
        ? new Promise((resolve) => {
            resolveEmployers = resolve;
          })
        : reply(message),
    );
    await mount();
    const detailHost = hosts('detail')[0]!;
    await flush(700);
    expect(calls('page:analyze')).toHaveLength(1);
    await act(async () => {
      resolveEmployers({
        ok: true,
        employers: [
          {
            query: 'Synthetic Employer',
            status: 'not_found',
            matches: [],
            checkedAt: Date.now(),
            stale: false,
          },
        ],
      });
    });
    await flush(2_000);
    expect(hosts('detail')).toEqual([detailHost]);
    expect(shadow('detail').textContent).toContain('未匹配');
    expect(shadow('detail').querySelector('.requirements')).not.toBeNull();
    expect(shadow('detail').textContent).not.toContain('已读取本地缓存');
    expect(calls('page:analyze')).toHaveLength(1);
  });

  it('blocks synthetic manual clicks even when the Jev button is enabled', async () => {
    preferences = { provider: 'jev', autoAnalyze: true, ready: true };
    visibility = 'hidden';
    await mount();
    const panel = shadow('detail');
    expect(button(panel, '分析岗位').disabled).toBe(false);
    await act(async () => {
      button(panel, '分析岗位').click();
    });
    await flush(1_000);
    expect(calls('page:analyze')).toHaveLength(0);
    expect(calls('page:auto')).toHaveLength(0);
  });

  it('cancels the owning automatic request on unmount and ignores its late result', async () => {
    preferences = { provider: 'jev', autoAnalyze: true, ready: true };
    let resolveAnalysis!: (response: unknown) => void;
    send.mockImplementation(async (message) =>
      message.type === 'page:analyze'
        ? new Promise((resolve) => {
            resolveAnalysis = resolve;
          })
        : reply(message),
    );
    await mount();
    await flush(700);
    const request = calls('page:analyze')[0]![0];
    await act(async () => {
      cleanup!();
      cleanup = undefined;
    });
    expect(calls('page:cancel')).toEqual([[{ type: 'page:cancel', requestId: request.requestId }]]);
    await act(async () => {
      resolveAnalysis({ ok: true, job: savedJob() });
    });
    await flush(2_000);
    expect(hosts()).toHaveLength(0);
    expect(calls('page:analyze')).toHaveLength(1);
  });

  it.each(['focus', 'list update'])(
    're-reads the local list after %s and ignores older responses',
    async (trigger) => {
      const listeners = new Set<(message: unknown, sender: chrome.runtime.MessageSender) => void>();
      Object.assign(chrome.runtime, {
        onMessage: {
          addListener: (
            listener: (message: unknown, sender: chrome.runtime.MessageSender) => void,
          ) => listeners.add(listener),
          removeListener: (
            listener: (message: unknown, sender: chrome.runtime.MessageSender) => void,
          ) => listeners.delete(listener),
        },
      });
      let resolveOld!: (response: unknown) => void;
      let reads = 0;
      const updated: EmployerCheck = {
        query: 'Synthetic Employer',
        status: 'matched',
        matches: [{ employerName: 'Synthetic Employer', tradingName: '', nzbn: '9429000000001' }],
        checkedAt: 1,
        stale: false,
      };
      send.mockImplementation(async (message) => {
        if (message.type !== 'page:employers') return reply(message);
        if (reads++ === 0)
          return new Promise((resolve) => {
            resolveOld = resolve;
          });
        return { ok: true, employers: [updated] };
      });
      await mount();
      await act(async () => {
        if (trigger === 'focus') window.dispatchEvent(new Event('focus'));
        else {
          // An unauthenticated notification must not invalidate the current read.
          for (const listener of listeners)
            listener({ type: 'employers:updated' }, { id: 'other-extension' });
        }
      });
      if (trigger === 'list update') {
        await flush();
        expect(calls('page:employers')).toHaveLength(1);
        await act(async () => {
          for (const listener of listeners)
            listener({ type: 'employers:updated' }, { id: 'test-extension-id' });
        });
      }
      await act(async () => {
        await Promise.resolve();
      });
      await flush();
      expect(shadow('card').textContent).toContain('已匹配');
      await act(async () => {
        resolveOld({ ok: true, employers: [{ ...updated, status: 'not_found', matches: [] }] });
      });
      await flush();
      expect(shadow('card').textContent).toContain('已匹配');
      expect(calls('page:employers')).toHaveLength(2);
      expect(calls('page:employers').every(([message]) => !('force' in message))).toBe(true);
      expect(calls('page:analyze')).toHaveLength(0);
    },
  );

  it('does not render an employer error into a destroyed root after cleanup', async () => {
    let rejectEmployers!: (error: Error) => void;
    send.mockImplementation(async (message) =>
      message.type === 'page:employers'
        ? new Promise((_resolve, reject) => {
            rejectEmployers = reject;
          })
        : reply(message),
    );
    await mount();
    await act(async () => {
      cleanup!();
      cleanup = undefined;
    });
    await act(async () => {
      rejectEmployers(new Error('Late employer lookup failure'));
    });
    await flush();
    expect(hosts()).toHaveLength(0);
    expect(calls('page:analyze')).toHaveLength(0);
  });
});

it('renders an English SEEK panel with cached analysis and leaves the host language unchanged', async () => {
  chrome.i18n = { getUILanguage: () => 'en-NZ' } as typeof chrome.i18n;
  const hostLanguage = document.documentElement.lang;
  preferences = { provider: 'jev', autoAnalyze: true, ready: true };
  await mount();
  await flush(700);
  const panel = shadow('detail');
  expect(panel.textContent).toContain('Job overview');
  expect(panel.textContent).toContain('Experience');
  expect(panel.textContent).toContain('Not stated');
  expect(panel.textContent).not.toMatch(/\p{Script=Han}/u);
  expect(button(panel, 'Settings')).toBeDefined();
  expect(panel.querySelector('[lang="en"]')).not.toBeNull();
  expect(document.documentElement.lang).toBe(hostLanguage);
  expect(calls('page:analyze')).toHaveLength(1);
  expect(calls('page:analyze')[0]![0].draft.body).toBe(description);
  expect(calls('page:analyze')[0]![0].draft.title).toBe('Software Engineer');
});

it('changes live panel, card and toolbar language without losing cached analysis or resubmitting', async () => {
  preferences = { provider: 'jev', autoAnalyze: true, ready: true };
  const skillText = 'Experience with React and TypeScript.';
  const body = `${description} ${skillText}`;
  document.querySelector('[data-automation="jobAdDetails"]')!.textContent = body;
  const job = savedJob();
  job.jev!.requirements!.skills = [
    {
      text: skillText,
      level: 'required',
      confidence: 1,
      evidence: {
        id: 'skill-1',
        text: skillText,
        start: body.indexOf(skillText),
        end: body.indexOf(skillText) + skillText.length,
      },
    },
  ];
  const originalJob = JSON.stringify(job);
  send.mockImplementation(async (message) =>
    message.type === 'page:analyze' ? { ok: true, job, cached: true } : reply(message),
  );
  const originalHostLanguage = document.documentElement.getAttribute('lang');
  document.documentElement.lang = 'mi';
  try {
    await mount();
    await flush(700);
    const mountedHosts = hosts();
    const panel = shadow('detail');
    const requirementsNode = panel.querySelector('.requirements');
    expect(requirementsNode).not.toBeNull();
    expect(panel.textContent).toContain('岗位速览');
    expect(shadow('card').textContent).not.toContain('已分析');
    expect(calls('page:analyze')).toHaveLength(1);

    for (const [locale, overview, cardLink, analysed, toolbarText] of [
      ['ja', '求人概要', '応募要件を見る →', '分析済み', '雇用主リストとの照合 · 求人 1 件'],
      ['ko', '채용 공고 요약', '지원 요건 보기 →', '분석 완료', '고용주 목록 대조 · 공고 1개'],
    ] as const) {
      await act(async () => applyLanguagePreference(locale));
      await flush(2_000);
      expect(hosts()).toEqual(mountedHosts);
      expect(shadow('detail')).toBe(panel);
      expect(panel.querySelector('.requirements')).toBe(requirementsNode);
      expect(panel.textContent).toContain(overview);
      expect(shadow('card').querySelector('.card-action')?.textContent).toBe(cardLink);
      expect(shadow('card').textContent).not.toContain(analysed);
      expect(shadow('toolbar').textContent).toContain(toolbarText);
      for (const kind of ['detail', 'card', 'toolbar']) {
        const container = shadow(kind).querySelector('div[lang]');
        expect(container?.parentNode).toBe(shadow(kind));
        expect(container?.getAttribute('lang')).toBe(locale);
      }
      expect(document.documentElement.lang).toBe('mi');
      expect(Array.from(panel.querySelectorAll('.skill-chip'), (node) => node.textContent)).toEqual(
        ['React', 'TypeScript'],
      );
      expect(panel.querySelector('.occupation-visa')).not.toBeNull();
      expect(calls('page:analyze')).toHaveLength(1);
      expect(calls('page:cancel')).toHaveLength(0);
      expect(document.querySelector('[data-automation="jobAdDetails"]')?.textContent).toBe(body);
      expect(calls('page:analyze')[0]![0].draft.body).toBe(body);
      expect(calls('page:analyze')[0]![0].draft.title).toBe('Software Engineer');
      expect(JSON.stringify(job)).toBe(originalJob);
    }
  } finally {
    if (originalHostLanguage === null) document.documentElement.removeAttribute('lang');
    else document.documentElement.setAttribute('lang', originalHostLanguage);
  }
});
