// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://nz.seek.com/jobs?selectedjob=11"}
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountSeekIntegration } from '../src/inpage/mount';
import type { EmployerCheck } from '../src/employers';
import { applyLanguagePreference } from '../src/i18n/preference';
import { t } from '../src/i18n';
import { localAnalysis, type LocalReading } from '../src/core/local-analysis';

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
const requirementsBody =
  'Requirements:\nPython skills required.\nThree years of engineering experience required.';
const allowedTypes = new Set(['page:language', 'page:employers', 'page:local']);

let cleanup: (() => void) | undefined;
let shadows: Map<HTMLElement, ShadowRoot>;
let send: ReturnType<typeof vi.fn>;
let visibility: DocumentVisibilityState;
const calls = (type: string) => send.mock.calls.filter(([message]) => message.type === type);
function reply(message: { type: string }) {
  switch (message.type) {
    case 'page:employers':
      return { ok: true, employers: [] };
    case 'page:local': {
      const { title, body } = message as unknown as { title: string; body: string };
      return { ok: true, reading: localAnalysis(title, body) };
    }
    default:
      return { ok: true };
  }
}
function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}
function setBody(text: string) {
  document.querySelector('[data-automation="jobAdDetails"]')!.textContent = text;
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
/** The facts-grid cell whose label is `label`. */
function fact(root: ShadowRoot, label: string): HTMLElement {
  const found = Array.from(root.querySelectorAll<HTMLElement>('.facts .fact')).find(
    (node) => node.querySelector('dt')?.textContent === label,
  );
  if (!found) throw new Error(`Missing fact: ${label}`);
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

describe('on-device job panel', () => {
  it('renders facts and the preparation checklist from the page:local reply', async () => {
    setBody(requirementsBody);
    await mount();
    await flush(2_000);
    const panel = shadow('detail');
    expect(calls('page:local')).toEqual([
      [{ type: 'page:local', title: 'Software Engineer', body: requirementsBody }],
    ]);
    expect(send.mock.calls.every(([message]) => allowedTypes.has(message.type))).toBe(true);

    expect(Array.from(panel.querySelectorAll('.facts dt'), (node) => node.textContent)).toEqual([
      t('page.occupationReference'),
      t('page.experience'),
      t('page.accreditedList'),
      t('page.visaSupport'),
      t('page.workRights'),
      t('page.residency'),
    ]);
    const expected = localAnalysis('Software Engineer', requirementsBody);
    expect(fact(panel, t('page.occupationReference')).querySelector('dd')?.textContent).toBe(
      expected.occupationTitle ?? t('page.undetermined'),
    );
    expect(fact(panel, t('page.accreditedList')).querySelector('.tag')?.textContent).toBe(
      t('page.checking'),
    );

    // The checklist turns the statements into chips; the raw wording is not repeated.
    const checklist = panel.querySelector('.prep-checklist')!;
    expect(checklist.textContent).toContain(t('page.prepMust'));
    expect(checklist.textContent).toContain(t('page.kindLanguage'));
    expect(checklist.textContent).toContain('Python');
    expect(panel.querySelector('details.source-text')).toBeNull();
    expect(panel.textContent).not.toContain('查看原文');
    expect(panel.querySelector('details.list-details')).not.toBeNull();
    expect(panel.textContent).toContain(t('page.localNote'));
    expect(panel.querySelector('[role="status"]')).toBeNull();
    expect(panel.querySelector('[role="alert"]')).toBeNull();
    // Nothing from the retired AI flow remains.
    expect(panel.querySelector('input[type="checkbox"]')).toBeNull();
    expect(panel.textContent).not.toMatch(/分析岗位|重新分析|配置 AI|Jev|AI 预估|保存这则广告/);
  });

  it('builds the occupation reference from the local reading', async () => {
    const reading = localAnalysis('Software Engineer', description);
    send.mockImplementation(async (message) =>
      message.type === 'page:local'
        ? { ok: true, reading: { ...reading, occupationTitle: 'Synthetic Occupation' } }
        : reply(message),
    );
    await mount();
    await flush();
    const panel = shadow('detail');
    expect(fact(panel, t('page.occupationReference')).querySelector('dd')?.textContent).toBe(
      'Synthetic Occupation',
    );
    send.mockImplementation(async (message) =>
      message.type === 'page:local'
        ? { ok: true, reading: { ...reading, occupationTitle: undefined } }
        : reply(message),
    );
    changeDetail('22');
    history.replaceState(null, '', '/jobs?selectedjob=22');
    await flush();
    expect(
      fact(shadow('detail'), t('page.occupationReference')).querySelector('dd')?.textContent,
    ).toBe(t('page.undetermined'));
  });

  it('shows visa verdicts without quoting the ad underneath', async () => {
    const statement = 'Applicants must have the right to work in New Zealand.';
    const body = `${description}\n${statement}`;
    const expected = localAnalysis('Software Engineer', body);
    expect(expected.visa.workRights.choice).toBe('required');
    expect(expected.visa.sponsorship.choice).toBe('not_mentioned');
    setBody(body);
    await mount();
    await flush();
    const panel = shadow('detail');

    const workRights = fact(panel, t('page.workRights'));
    expect(workRights.querySelectorAll('dd')).toHaveLength(1);
    expect(workRights.querySelector('dd')?.textContent).toBe(t('page.required'));
    expect(workRights.textContent).not.toContain(statement);
    // The wording stays available as a hover hint on the verdict and, for keyboard and touch
    // readers, as a line that the verdict button reveals.
    const verdict = workRights.querySelector<HTMLButtonElement>('dd > button');
    expect(verdict?.getAttribute('title')).toBe(statement);
    expect(verdict?.getAttribute('aria-expanded')).toBe('false');
    act(() => verdict?.click());
    expect(workRights.querySelector('dd q')?.textContent).toBe(statement);
    expect(verdict?.getAttribute('aria-expanded')).toBe('true');

    for (const label of [t('page.visaSupport'), t('page.residency')]) {
      const cell = fact(panel, label);
      expect(cell.querySelectorAll('dd')).toHaveLength(1);
      expect(cell.querySelector('dd')?.textContent).toBe(t('page.notMentioned'));
    }
  });

  it('labels a local experience estimate and prefers stated years', async () => {
    const base = localAnalysis('Software Engineer', description);
    const estimated: LocalReading = {
      ...base,
      prep: { ...base.prep, experience: [], estimate: { band: 'one_to_three', evidence: [] } },
    };
    send.mockImplementation(async (message) =>
      message.type === 'page:local' ? { ok: true, reading: estimated } : reply(message),
    );
    await mount();
    await flush();
    const cell = fact(shadow('detail'), t('page.experience'));
    expect(cell.querySelector('.experience-estimate-tag')?.textContent).toBe(
      t('page.localEstimate'),
    );
    expect(cell.querySelector('dd')?.textContent).toContain(
      t('page.yearsRange', { min: '1', max: '3' }),
    );

    await act(async () => cleanup!());
    send.mockImplementation(async (message) => reply(message));
    setBody(`${description}\nAt least 3 years of software engineering experience required.`);
    await mount();
    await flush();
    const stated = fact(shadow('detail'), t('page.experience'));
    expect(stated.querySelector('.experience-estimate-tag')).toBeNull();
    expect(stated.querySelector('dd')?.textContent).toContain(
      t('page.yearsMinimum', { years: '3' }),
    );
  });

  it('shows a loading status while the local reading is pending', async () => {
    send.mockImplementation((message) =>
      message.type === 'page:local' ? new Promise(() => {}) : Promise.resolve(reply(message)),
    );
    await mount();
    await flush(2_000);
    const panel = shadow('detail');
    expect(panel.querySelector('[role="status"]')?.textContent).toBe(t('page.prepLoading'));
    expect(panel.querySelector('.prep-checklist')).toBeNull();
    // Employer status needs no local reading.
    expect(fact(panel, t('page.accreditedList')).querySelector('.tag')).not.toBeNull();
    // Every cell is reserved up front so the grid does not jump when the reading lands.
    expect(panel.querySelectorAll('.facts .fact')).toHaveLength(6);
    expect(fact(panel, t('page.visaSupport')).querySelector('dd')?.textContent).toBe('…');
  });

  it.each([
    ['a rejected reply', async () => ({ ok: false, error: 'Synthetic local failure' })],
    [
      'a synchronous send failure',
      () => {
        throw new Error('Synthetic local failure');
      },
    ],
  ])('shows an alert instead of a checklist after %s', async (name, failure) => {
    send.mockImplementation((message) =>
      message.type === 'page:local' ? failure() : Promise.resolve(reply(message)),
    );
    await mount();
    await flush();
    const panel = shadow('detail');
    const alert = panel.querySelector('[role="alert"]')!;
    // Only the worker's own (localised) message is shown; a thrown send is a stale script.
    expect(alert.firstChild?.textContent).toBe(
      name === 'a rejected reply' ? 'Synthetic local failure' : t('page.refreshExtension'),
    );
    expect(alert.closest('details')).toBeNull();
    // The facts say the reading failed instead of looking as if they were still loading.
    expect(fact(panel, t('page.visaSupport')).querySelector('dd')?.textContent).toBe(
      t('page.unreadable'),
    );
    expect(panel.querySelector('[role="status"]')).toBeNull();
    expect(panel.querySelector('.prep-checklist')).toBeNull();
    expect(calls('page:local')).toHaveLength(1);

    // Retry asks the worker again from the same panel.
    send.mockImplementation((message) => Promise.resolve(reply(message)));
    await act(async () => button(panel, t('page.retry')).click());
    await flush();
    expect(calls('page:local')).toHaveLength(2);
    expect(panel.querySelector('[role="alert"]')).toBeNull();
    expect(panel.querySelector('.prep-checklist')).not.toBeNull();
  });

  it('keeps the settings and collapse controls in the header with only details collapsed', async () => {
    setBody(requirementsBody);
    await mount();
    await flush();
    const panel = shadow('detail');
    const header = panel.querySelector('header')!;
    expect(header.textContent).toContain('RoleHarbour');
    expect(header.textContent).toContain(t('page.overview'));
    expect(Array.from(header.querySelectorAll('button'), (node) => node.textContent)).toEqual([
      t('page.settings'),
      t('page.collapse'),
    ]);
    const toggle = button(panel, t('page.collapse'));
    expect(toggle.type).toBe('button');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const body = panel.querySelector('.panel-body')!;
    expect(toggle.getAttribute('aria-controls')).toBe(body.parentElement!.id);

    const details = Array.from(panel.querySelectorAll<HTMLDetailsElement>('.panel-body details'));
    expect(details.every((node) => !node.open)).toBe(true);
    const list = panel.querySelector<HTMLDetailsElement>('details.list-details')!;
    expect(list.querySelector(':scope > summary')?.textContent).toBe(t('page.listDetails'));
    expect(list.textContent).toContain(t('page.listSource'));
    expect(list.querySelectorAll('button')).toHaveLength(0);

    // Closed <details> still contributes textContent in jsdom; inspect the main DOM
    // separately to ensure the original wording and list provenance are not duplicated there.
    const main = body.cloneNode(true) as HTMLElement;
    main.querySelectorAll('details').forEach((node) => node.remove());
    expect(main.querySelector('.facts')).not.toBeNull();
    expect(main.querySelector('.prep-checklist')).not.toBeNull();
    for (const hidden of [
      'Python skills required.',
      'Three years of engineering experience required.',
      t('page.listSource'),
    ])
      expect(main.textContent).not.toContain(hidden);
  });

  it('keeps a collapsed job collapsed across remounts and other jobs expanded', async () => {
    await mount();
    await flush();
    await act(async () => button(shadow('detail'), t('page.collapse')).click());
    let toggle = button(shadow('detail'), t('page.expand'));
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(shadow('detail').querySelector('.panel-body')).toBeNull();
    expect(shadow('detail').querySelector('header')).not.toBeNull();

    // The collapsed region stays referable while hidden.
    const controlled = toggle.getAttribute('aria-controls')!;
    expect(shadow('detail').getElementById(controlled)?.hidden).toBe(true);

    // SEEK re-rendering the pane removes the host; the same panel is put back, still collapsed.
    const first = hosts('detail')[0]!;
    first.remove();
    await flush();
    expect(hosts('detail')).toEqual([first]);
    toggle = button(shadow('detail'), t('page.expand'));
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    // A different job starts expanded.
    changeDetail('22');
    history.replaceState(null, '', '/jobs?selectedjob=22');
    await flush();
    expect(button(shadow('detail'), t('page.collapse')).getAttribute('aria-expanded')).toBe('true');

    // Returning to job 11 keeps its choice; expanding it clears the memory.
    changeDetail('11', 'Software Engineer');
    history.replaceState(null, '', '/jobs?selectedjob=11');
    await flush();
    await act(async () => button(shadow('detail'), t('page.expand')).click());
    expect(shadow('detail').querySelector('.panel-body')).not.toBeNull();
    hosts('detail')[0]!.remove();
    await flush();
    expect(button(shadow('detail'), t('page.collapse')).getAttribute('aria-expanded')).toBe('true');
  });

  it('re-requests the local reading only when the job text changes', async () => {
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
    await flush();
    const checklist = shadow('detail').querySelector('.prep-checklist');
    expect(checklist).not.toBeNull();
    await act(async () => {
      resolveEmployers({
        ok: true,
        employers: [
          {
            query: 'Synthetic Employer',
            status: 'not_found',
            matches: [],
            checkedAt: Date.now(),
          },
        ],
      });
    });
    await flush(2_000);
    expect(hosts('detail')).toEqual([detailHost]);
    expect(shadow('detail').textContent).toContain(t('page.notMatched'));
    expect(shadow('detail').querySelector('.prep-checklist')).toBe(checklist);
    expect(calls('page:local')).toHaveLength(1);
  });
});

describe('mounted SEEK integration on synthetic public DOM', () => {
  it('queries two-letter employer names from both cards and details', async () => {
    document.body.innerHTML = fixture().replaceAll('Synthetic Employer', 'QX');
    await mount();
    await flush();
    expect(calls('page:employers').map(([message]) => message.names)).toEqual([['QX']]);
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

  it('ignores a late local reading after normal teardown', async () => {
    let resolveLocal!: (response: unknown) => void;
    send.mockImplementation((message) =>
      message.type === 'page:local'
        ? new Promise((resolve) => {
            resolveLocal = resolve;
          })
        : Promise.resolve(reply(message)),
    );
    await mount();
    await flush();
    const panel = shadow('detail');
    await act(async () => {
      cleanup!();
      cleanup = undefined;
    });
    await act(async () =>
      resolveLocal({ ok: true, reading: localAnalysis('Software Engineer', description) }),
    );
    await flush(2_000);
    expect(hosts()).toHaveLength(0);
    expect(panel.querySelector('.prep-checklist')).toBeNull();
    expect(calls('page:local')).toHaveLength(1);
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
    expect(calls('page:local')).toHaveLength(0);
  });

  it('decorates cards and visible details without observer self-loops', async () => {
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
    expect(calls('page:local')).toHaveLength(1);
    expect(send.mock.calls.every(([message]) => allowedTypes.has(message.type))).toBe(true);
  });

  it('labels card links with the job title and gives the toolbar one settings button', async () => {
    await mount();
    const link = shadow('card').querySelector<HTMLAnchorElement>('a.card-action')!;
    expect(link.getAttribute('aria-label')).toBe(
      t('page.viewRequirementsFor', { title: 'Software Engineer' }),
    );
    expect(link.getAttribute('aria-label')).toBe('查看“Software Engineer”的岗位要求');
    expect(link.href).toBe('https://nz.seek.com/job/11#seek-filter');
    expect(
      Array.from(shadow('toolbar').querySelectorAll('button'), (node) => node.textContent),
    ).toEqual([t('page.settings')]);
    expect(shadow('toolbar').textContent).not.toContain('更新名单');
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
    expect(shadow('card').querySelector('a')?.getAttribute('aria-label')).toContain(
      'Systems Administrator',
    );

    changeDetail('22');
    await flush();
    expect(hosts('detail')).toHaveLength(1);
    expect(hosts()).toHaveLength(3);
    expect(calls('page:local').map(([message]) => message.title)).toEqual([
      'Software Engineer',
      'Systems Administrator',
    ]);
  });

  it('updates the same job in place when SEEK fills in the advertiser or location late', async () => {
    await mount();
    await flush();
    const host = hosts('detail')[0]!;
    const checklist = shadow('detail').querySelector('.prep-checklist');
    await act(async () => {
      document.querySelector('[data-automation="advertiser-name"]')!.textContent =
        'Synthetic Legal Employer';
      document.querySelector('[data-automation="job-detail-location"]')!.textContent = 'Wellington';
    });
    await flush();
    expect(hosts('detail')).toEqual([host]);
    expect(shadow('detail').querySelector('.prep-checklist')).toBe(checklist);
    expect(calls('page:local')).toHaveLength(1);
    expect(calls('page:employers').flatMap(([message]) => message.names)).toContain(
      'Synthetic Legal Employer',
    );
  });

  it('waits for a background tab to become visible before checking employers', async () => {
    setVisibility('hidden');
    await mount();
    await flush();
    expect(calls('page:employers')).toHaveLength(0);
    await act(async () => setVisibility('visible'));
    await flush();
    expect(calls('page:employers')).toHaveLength(1);
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
  });

  it('does not open settings from synthetic clicks', async () => {
    await mount();
    await flush();
    await act(async () => {
      button(shadow('detail'), t('page.settings')).click();
      button(shadow('toolbar'), t('page.settings')).click();
    });
    await flush();
    expect(calls('page:open-settings')).toHaveLength(0);
    expect(shadow('detail').querySelector('[role="alert"]')).toBeNull();
    expect(calls('page:employers').some(([message]) => 'force' in message)).toBe(false);
  });

  it('keeps clicks inside the Shadow roots from SEEK but lets keydown reach the page', async () => {
    await mount();
    await flush();
    const seen: string[] = [];
    const record = (event: Event) => seen.push(event.type);
    for (const type of ['click', 'pointerdown', 'keydown']) document.addEventListener(type, record);
    try {
      for (const kind of ['detail', 'toolbar']) {
        const target = button(shadow(kind), t('page.settings'));
        await act(async () => {
          target.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
          target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
          target.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
          );
        });
      }
      const link = shadow('card').querySelector('a')!;
      link.addEventListener('click', (event) => event.preventDefault());
      await act(async () => {
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        link.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true }),
        );
      });
    } finally {
      for (const type of ['click', 'pointerdown', 'keydown'])
        document.removeEventListener(type, record);
    }
    expect(seen).toEqual(['keydown', 'keydown', 'keydown']);
  });

  it('scrolls the panel into view once per job for the card link', async () => {
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scroll,
    });
    try {
      history.replaceState(null, '', '/jobs?selectedjob=11#seek-filter');
      await mount();
      expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'start', behavior: 'smooth' });
      expect(scroll.mock.contexts[0]).toBe(hosts('detail')[0]);
      expect(hosts('detail')[0]!.id).toBe('seek-filter');

      // SEEK re-rendering the same job must not scroll again.
      hosts('detail')[0]!.remove();
      await flush();
      expect(hosts('detail')).toHaveLength(1);
      expect(scroll).toHaveBeenCalledTimes(1);

      changeDetail('22');
      history.replaceState(null, '', '/jobs?selectedjob=22#seek-filter');
      await flush();
      expect(scroll).toHaveBeenCalledTimes(2);
      expect(scroll.mock.contexts[1]).toBe(hosts('detail')[0]);

      // Without the card's fragment a new job does not scroll.
      changeDetail('33');
      history.replaceState(null, '', '/jobs?selectedjob=33');
      await flush();
      expect(hosts('detail')).toHaveLength(1);
      expect(scroll).toHaveBeenCalledTimes(2);
    } finally {
      delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
    }
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

  it('ignores a pending local reading after runtime invalidation', async () => {
    let resolveLocal!: (response: unknown) => void;
    send.mockImplementation((message) =>
      message.type === 'page:local'
        ? new Promise((resolve) => {
            resolveLocal = resolve;
          })
        : Promise.resolve(reply(message)),
    );
    await mount();
    await flush();
    expect(calls('page:local')).toHaveLength(1);
    const panel = shadow('detail');
    Object.defineProperty(chrome.runtime, 'id', { configurable: true, value: undefined });
    await flush(300);

    expect(hosts()).toHaveLength(0);
    const callsAtInvalidation = send.mock.calls.length;
    await act(async () => {
      resolveLocal({ ok: true, reading: localAnalysis('Software Engineer', description) });
      window.dispatchEvent(new Event('focus'));
    });
    await flush(2_000);
    expect(hosts()).toHaveLength(0);
    expect(panel.querySelector('.prep-checklist')).toBeNull();
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
    // The page language bridge and the employer-list invalidation listener.
    expect(addListener).toHaveBeenCalledTimes(2);
    const retainedListener = addListener.mock.calls[0]![0];
    Object.defineProperty(chrome.runtime, 'id', { configurable: true, value: undefined });
    await flush(500);

    expect(removeListener).toHaveBeenCalledTimes(2);
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
    expect(removeListener).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['matched', '已匹配'],
    ['not_found', '未匹配'],
    ['unavailable', '暂时无法查询'],
  ] as const)(
    'renders %s employer results with a concise label on cards and details',
    async (status, label) => {
      const employer: EmployerCheck = {
        query: 'Synthetic Employer',
        status,
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
      expect(
        fact(shadow('detail'), t('page.accreditedList')).querySelector('.tag')?.textContent,
      ).toBe(label);
    },
  );

  it('shows the alias mapping and source alongside the legal employer identity', async () => {
    const employer: EmployerCheck = {
      query: 'Synthetic Employer',
      status: 'matched',
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
        matches: [
          {
            employerName: 'Synthetic Legal Employer',
            tradingName: 'Synthetic Legal Employer',
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
      for (const badge of [
        shadow('card').querySelector('.employer .tag')!,
        fact(shadow('detail'), t('page.accreditedList')).querySelector('.tag')!,
      ]) {
        expect(badge.textContent).toBe('需核实');
        expect(badge.className).toContain('bg-rh-warning-bg');
        expect(badge.className).not.toContain('bg-rh-positive-bg');
      }
      const details = shadow('detail').querySelector('details.list-details')!;
      expect(details.textContent).toContain(employer.note);
      expect(details.textContent).not.toContain('Synthetic Employer');
      expect(details.textContent).not.toContain('可能匹配：公司名称可能未写全');
      expect(details.textContent?.match(/Synthetic Legal Employer/g)).toHaveLength(1);
    },
  );

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
      expect(calls('page:local')).toHaveLength(1);
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
  });
});

it('renders an English SEEK panel from the local reading and leaves the host language unchanged', async () => {
  chrome.i18n = { getUILanguage: () => 'en-NZ' } as typeof chrome.i18n;
  const hostLanguage = document.documentElement.lang;
  await mount();
  await flush();
  const panel = shadow('detail');
  expect(panel.textContent).toContain('Job overview');
  expect(panel.textContent).toContain('Experience');
  expect(panel.textContent).toContain('Not stated');
  expect(panel.textContent).not.toMatch(/\p{Script=Han}/u);
  expect(button(panel, 'Settings')).toBeDefined();
  expect(button(panel, 'Show less').getAttribute('aria-expanded')).toBe('true');
  expect(panel.querySelector('[lang="en"]')).not.toBeNull();
  expect(document.documentElement.lang).toBe(hostLanguage);
  expect(calls('page:local')).toEqual([
    [{ type: 'page:local', title: 'Software Engineer', body: description }],
  ]);
});

it('changes live panel, card and toolbar language without losing the reading or resubmitting', async () => {
  setBody(requirementsBody);
  const originalHostLanguage = document.documentElement.getAttribute('lang');
  document.documentElement.lang = 'mi';
  try {
    await mount();
    await flush();
    const mountedHosts = hosts();
    const panel = shadow('detail');
    const checklist = panel.querySelector('.prep-checklist');
    expect(checklist).not.toBeNull();
    expect(panel.textContent).toContain('岗位速览');
    expect(calls('page:local')).toHaveLength(1);

    for (const [locale, overview, cardLink, cardLabel, toolbarText] of [
      [
        'ja',
        '求人概要',
        '応募要件を見る →',
        '「Software Engineer」の応募要件を見る',
        '雇用主リストとの照合 · 求人 1 件',
      ],
      [
        'ko',
        '채용 공고 요약',
        '지원 요건 보기 →',
        '"Software Engineer" 지원 요건 보기',
        '고용주 목록 대조 · 공고 1개',
      ],
    ] as const) {
      await act(async () => applyLanguagePreference(locale));
      await flush(2_000);
      expect(hosts()).toEqual(mountedHosts);
      expect(shadow('detail')).toBe(panel);
      expect(panel.querySelector('.prep-checklist')).toBe(checklist);
      expect(panel.textContent).toContain(overview);
      expect(panel.querySelector('.prep-checklist')?.textContent).toContain('Python');
      expect(shadow('card').querySelector('.card-action')?.textContent).toBe(cardLink);
      expect(shadow('card').querySelector('.card-action')?.getAttribute('aria-label')).toBe(
        cardLabel,
      );
      expect(shadow('toolbar').textContent).toContain(toolbarText);
      for (const kind of ['detail', 'card', 'toolbar']) {
        const container = shadow(kind).querySelector('div[lang]');
        expect(container?.parentNode).toBe(shadow(kind));
        expect(container?.getAttribute('lang')).toBe(locale);
      }
      expect(document.documentElement.lang).toBe('mi');
      expect(calls('page:local')).toHaveLength(1);
      expect(document.querySelector('[data-automation="jobAdDetails"]')?.textContent).toBe(
        requirementsBody,
      );
    }
  } finally {
    if (originalHostLanguage === null) document.documentElement.removeAttribute('lang');
    else document.documentElement.setAttribute('lang', originalHostLanguage);
  }
});
