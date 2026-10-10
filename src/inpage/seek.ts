import { draftSchema, type JobDraft } from '../core/schema';
import {
  canonicalSeekJobUrl,
  getSeekJobId,
  isSeekPublicPage,
  parseSeekUrl as seekUrl,
} from '../core/seek-url';

export interface SeekCard {
  element: HTMLElement;
  url: string;
  title: string;
  employer: string;
}

const INJECTED = '[data-seek-filter]';
const CARD_ROOTS = [
  '[data-testid="job-card"]',
  'article[data-automation="normalJob"]',
  'article[data-automation="premiumJob"]',
  'article[data-card-type]',
].join(',');
const CARD_LINKS = [
  'a[data-automation="jobTitle"]',
  'a[data-testid="jobTitle"]',
  'a[data-testid="job-title"]',
  'h2 a[href]',
  'h3 a[href]',
].join(',');
const RECOMMENDED_LINK = 'a[data-automation^="recommendedJobLink_"]';
const DETAIL_ROOTS = [
  '[data-automation="job-detail"]',
  '[data-testid="job-detail"]',
  '[data-testid="job-details"]',
  '[data-automation="jobDetails"]',
].join(',');
const DETAIL_BODIES = [
  '[data-automation="jobAdDetails"]',
  '[data-testid="jobAdDetails"]',
  '[data-automation="job-ad-details"]',
  '[data-testid="job-ad-details"]',
  '[data-automation="job-detail-description"]',
  '[data-testid="job-detail-description"]',
  '[data-testid="job-detail"] [itemprop="description"]',
  '[data-automation="job-detail"] [itemprop="description"]',
].join(',');
const DETAIL_TITLES = [
  '[data-automation="job-detail-title"]',
  '[data-testid="job-detail-title"]',
  'h1',
];
const IGNORED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG']);
const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'SECTION',
  'ARTICLE',
  'LI',
  'UL',
  'OL',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
]);

type Visibility = (element: Element) => boolean;

/** One cache per scan, so SPA visibility changes are reflected on the next call. */
function visibilityFor(document: Document): Visibility {
  const cache = new WeakMap<Element, boolean>();
  const view = document.defaultView;
  const visible: Visibility = (element) => {
    const cached = cache.get(element);
    if (cached !== undefined) return cached;
    const parent = element.parentElement;
    if (
      IGNORED_TAGS.has(element.tagName) ||
      element.matches(INJECTED) ||
      element.hasAttribute('hidden') ||
      element.getAttribute('aria-hidden') === 'true' ||
      (parent && !visible(parent))
    ) {
      cache.set(element, false);
      return false;
    }
    // Off-screen loaded nodes still count; no viewport or geometry dependency.
    const style = view?.getComputedStyle(element);
    const result =
      style?.display !== 'none' &&
      style?.visibility !== 'hidden' &&
      style?.visibility !== 'collapse' &&
      style?.contentVisibility !== 'hidden';
    cache.set(element, result);
    return result;
  };
  return visible;
}

/** List items keep a bullet so requirement lists stay recognisable after flattening. */
function renderedText(element: Element, visible: Visibility, listMarkers = false): string {
  const read = (node: Node): string => {
    if (node.nodeType === 3) return node.textContent ?? '';
    if (node.nodeType !== 1) return '';
    const child = node as Element;
    if (IGNORED_TAGS.has(child.tagName) || !visible(child)) return '';
    if (child.tagName === 'BR') return '\n';
    const text = Array.from(child.childNodes).map(read).join('');
    if (listMarkers && child.tagName === 'LI' && text.trim()) return `\n• ${text.trim()}\n`;
    return BLOCK_TAGS.has(child.tagName) ? `\n${text}\n` : text;
  };
  const text = read(element)
    // Soft hyphens are invisible on the page but split words for text matching.
    .replace(/\u00ad/g, '')
    .replace(/[\t\f\v \u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  // Consecutive list items read as one list, not separate paragraphs.
  return (listMarkers ? text.replace(/\n\n(?=\u2022 )/g, '\n') : text).trim();
}

function oneLine(element: Element, visible: Visibility): string {
  return renderedText(element, visible).replace(/\s+/g, ' ').trim();
}

function findText(
  root: Element,
  selectors: string[],
  visible: Visibility,
  belongs: (node: Element) => boolean = () => true,
): string {
  for (const selector of selectors) {
    for (const element of root.querySelectorAll(selector)) {
      if (belongs(element) && visible(element)) {
        const text = oneLine(element, visible);
        if (text) return text;
      }
    }
  }
  return '';
}

export function findSeekCards(document: Document): SeekCard[] {
  if (!isSeekPublicPage(document.URL)) return [];
  const visible = visibilityFor(document);
  const roots = new Set<HTMLElement>();
  for (const root of document.querySelectorAll<HTMLElement>(CARD_ROOTS)) {
    if (visible(root)) roots.add(root);
  }
  // Observed on the NZ SEEK home feed: an empty accessible overlay anchor and
  // sibling jobTitle/jobAdvertiser spans inside its immediate card parent.
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>(RECOMMENDED_LINK)) {
    if (visible(anchor) && anchor.parentElement) roots.add(anchor.parentElement);
  }
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>(CARD_LINKS)) {
    const article = anchor.closest<HTMLElement>('article');
    if (article && visible(article) && !anchor.closest(CARD_ROOTS)) roots.add(article);
  }

  const cards: SeekCard[] = [];
  for (const root of roots) {
    const belongs = (node: Element) =>
      !Array.from(roots).some(
        (other) => other !== root && root.contains(other) && other.contains(node),
      );
    const links = Array.from(
      root.querySelectorAll<HTMLAnchorElement>(`${CARD_LINKS},${RECOMMENDED_LINK}`),
    )
      .filter((anchor) => belongs(anchor) && visible(anchor))
      .map((anchor) => ({
        anchor,
        url: canonicalSeekJobUrl(anchor.getAttribute('href') ?? '', document.URL),
      }))
      .filter((entry): entry is { anchor: HTMLAnchorElement; url: string } => entry.url !== null);
    const identities = new Set(links.map((link) => link.url));
    if (identities.size !== 1) continue;
    const link = links[0]!;
    const title =
      findText(
        root,
        [
          '[data-automation="jobTitle"]',
          '[data-testid="jobTitle"]',
          '[data-testid="job-title"]',
          'h2',
          'h3',
        ],
        visible,
        belongs,
      ) ||
      oneLine(link.anchor, visible) ||
      link.anchor.getAttribute('aria-label')?.trim() ||
      '';
    if (!title || title.length > 240) continue;
    const employer = findText(
      root,
      [
        '[data-automation="jobCompany"]',
        '[data-automation="jobAdvertiser"]',
        '[data-testid="company-name"]',
        '[data-automation="advertiser-name"]',
      ],
      visible,
      belongs,
    );
    cards.push({ element: root, url: link.url, title, employer });
  }
  return cards;
}

function detailRoot(body: Element, visible: Visibility): Element | null {
  const dialog = body.closest('[role="dialog"]');
  if (dialog) return dialog;
  const explicit = body.closest(DETAIL_ROOTS);
  if (explicit) return explicit;
  for (let root = body.parentElement; root && root.tagName !== 'BODY'; root = root.parentElement) {
    if (DETAIL_TITLES.some((selector) => Array.from(root.querySelectorAll(selector)).some(visible)))
      return root;
  }
  return null;
}

function detailIdentities(
  root: Element,
  document: Document,
  visible: Visibility,
): { ids: Set<string>; titleIds: Set<string>; applyIds: Set<string> } {
  const ids = new Set<string>();
  const titleIds = new Set<string>();
  const applyIds = new Set<string>();
  const metadata = [root, ...root.querySelectorAll('[data-job-id], [data-jobid]')];
  for (const element of metadata) {
    if (!visible(element) || element.closest(CARD_ROOTS)) continue;
    const id = element.getAttribute('data-job-id') ?? element.getAttribute('data-jobid');
    if (id && /^[0-9]{1,20}$/.test(id)) ids.add(id);
  }
  const identityLinks = root.querySelectorAll<HTMLAnchorElement>(
    [
      'a[data-automation="job-detail-title"]',
      'h1 a[href]',
      'a[data-automation*="apply"]',
      'a[data-automation*="Apply"]',
      'a[data-testid*="apply"]',
      'a[data-testid*="Apply"]',
    ].join(','),
  );
  for (const anchor of identityLinks) {
    if (!visible(anchor) || anchor.closest(CARD_ROOTS)) continue;
    const url = seekUrl(anchor.getAttribute('href') ?? '', document.URL);
    const id = url?.pathname.match(/^\/job\/([0-9]{1,20})(?:\/apply)?\/?$/)?.[1];
    if (id) {
      ids.add(id);
      if (anchor.closest('h1') || anchor.matches('[data-automation="job-detail-title"]'))
        titleIds.add(id);
      if (url?.pathname.match(/^\/job\/\d+\/apply\/?$/)) applyIds.add(id);
    }
  }
  return { ids, titleIds, applyIds };
}

function boundDetail(
  document: Document,
  expectedJobId: string | undefined,
  visible: Visibility,
): { body: Element; root: Element; id: string } | null {
  if (!isSeekPublicPage(document.URL)) return null;
  const bodies = Array.from(document.querySelectorAll(DETAIL_BODIES)).filter(
    (element) => visible(element) && !element.closest(CARD_ROOTS),
  );
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(visible);
  const eligibleBodies = dialogs.length
    ? bodies.filter((element) => element.closest('[role="dialog"]'))
    : bodies;
  // Nested selectors can identify the same description; keep the outer one.
  const uniqueBodies = eligibleBodies.filter(
    (element) => !eligibleBodies.some((other) => other !== element && other.contains(element)),
  );
  if (uniqueBodies.length !== 1) return null;
  const bodyElement = uniqueBodies[0]!;
  const root = detailRoot(bodyElement, visible);
  if (!root) return null;
  const { ids: identities, titleIds, applyIds } = detailIdentities(root, document, visible);
  const inDialog = bodyElement.closest('[role="dialog"]') !== null;
  let id: string;
  if (inDialog) {
    // SEEK home-feed cards open a modal without changing location. Both visible
    // title and apply links must independently identify this same job.
    if (identities.size !== 1) return null;
    id = [...identities][0]!;
    if (!titleIds.has(id) || !applyIds.has(id)) return null;
  } else {
    const pageId = getSeekJobId(document.URL);
    if (!pageId) return null;
    // Both direct and split-view URLs can change before the old panel rerenders.
    // The panel must independently identify the same job before it can be read.
    if (identities.size !== 1 || !identities.has(pageId)) return null;
    id = pageId;
  }
  if (expectedJobId !== undefined && id !== expectedJobId) return null;
  return { body: bodyElement, root, id };
}

/** Reads one visible, identity-bound public detail panel; never cards or hidden JSON. Returns
 * the draft and the source description it was read from (injected controls mount outside it),
 * from one identity and visibility pass. */
export function readSeekDetailAt(
  document: Document,
  expectedJobId?: string,
  /** The description element and text from the previous pass, when nothing inside it changed. */
  previous?: { anchor: Element; body: string },
): { draft: JobDraft; anchor: HTMLElement } | null {
  const visible = visibilityFor(document);
  const bound = boundDetail(document, expectedJobId, visible);
  if (!bound) return null;
  const { body: bodyElement, root, id } = bound;
  const body =
    previous?.anchor === bodyElement ? previous.body : renderedText(bodyElement, visible, true);
  if (body.length < 40 || body.length > 24_000) return null;
  const belongs = (element: Element) => !element.closest(CARD_ROOTS);
  const title = findText(root, DETAIL_TITLES, visible, belongs);
  const employer = findText(
    root,
    [
      '[data-automation="advertiser-name"]',
      '[data-testid="advertiser-name"]',
      '[data-automation="job-detail-company"]',
      '[data-automation="jobCompany"]',
    ],
    visible,
    belongs,
  );
  const location = findText(
    root,
    [
      '[data-automation="job-detail-location"]',
      '[data-testid="job-detail-location"]',
      '[data-automation="jobLocation"]',
    ],
    visible,
    belongs,
  );
  const result = draftSchema.safeParse({
    title,
    employer,
    location,
    body,
    sourceUrl: `https://nz.seek.com/job/${id}`,
  });
  return result.success ? { draft: result.data, anchor: bodyElement as HTMLElement } : null;
}
