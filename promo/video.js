// RoleHarbour promo video. Every frame is a pure function of time: renderAt(t) sets every
// moving style, and render.mjs captures renderAt(frame / fps). Cue times come from
// timeline.json (shared with music.py). UI values come from data/reading.json, the real
// localAnalysis() output for the invented advert in data/job.json.
'use strict';

const W = 1920;
const H = 1080;
const stage = document.getElementById('stage');

// ---------------------------------------------------------------------------
// Easing and DOM helpers

const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const mix = (a, b, p) => a + (b - a) * p;
const outExpo = (p) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p));
const outCubic = (p) => 1 - (1 - p) ** 3;
const inCubic = (p) => p ** 3;
const inOutCubic = (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
const outBack = (p) => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2;

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'style') Object.assign(node.style, value);
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) if (child != null) node.append(child);
  return node;
}

/** Absolutely positioned box at (x, y), optionally sized. */
function box(x, y, attrs = {}, ...children) {
  const node = h('div', attrs, ...children);
  node.classList.add('abs');
  Object.assign(node.style, { left: `${x}px`, top: `${y}px` });
  return node;
}

/** Transform, opacity and blur of a wrapper; stickers keep their own filter on the child. */
function pose(node, { x = 0, y = 0, scale = 1, rotate = 0, opacity = 1, blur = 0, pre = '' } = {}) {
  node.style.transform = `${pre} translate(${x}px, ${y}px) scale(${scale}) rotate(${rotate}deg)`;
  node.style.opacity = String(clamp(opacity));
  node.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
}

/** A line of kinetic type that slides up from behind its own clipping edge. */
function line(html, attrs = {}) {
  const inner = h('span', { html });
  return { node: h('span', { ...attrs, class: `line ${attrs.class ?? ''}` }, inner), inner };
}
function reveal(kinetic, p, from = 135) {
  kinetic.inner.style.transform = `translateY(${mix(from, 0, p)}%)`;
}
/** Kinetic type revealed letter by letter. */
function letters(text) {
  const spans = [...text].map((char) => h('span', { text: char === ' ' ? ' ' : char }));
  const node = h('span', {}, ...spans.map((span) => h('span', { class: 'letter' }, span)));
  return { node, spans };
}
function revealLetters(kinetic, t, start, stagger, duration) {
  kinetic.spans.forEach((span, i) => {
    const p = outExpo(prog(t, start + i * stagger, start + i * stagger + duration));
    span.style.transform = `translateY(${mix(135, 0, p)}%)`;
  });
}
/** A highlighter stroke behind text, as a share of its width. */
function mark(node, p) {
  node.style.backgroundSize = `${(clamp(p) * 100).toFixed(2)}% 46%`;
}

function sticker(src, width) {
  const img = h('img', { src, class: 'sticker', alt: '' });
  img.style.width = `${width}px`;
  return h('div', { 'data-sticker': src }, img);
}

const CURSOR = `<svg class="cursor" viewBox="0 0 24 24"><path d="M4 2.5v17.2l4.6-4.4 3 6.9 2.9-1.3-3-6.8h6.4z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
const GEAR = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>`;
const CLOUD = `<svg viewBox="0 0 24 24" fill="none" stroke="#051a49" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9.5z"/><path d="M12 16v-5.5M9.6 12.9 12 10.5l2.4 2.4"/></svg>`;

// ---------------------------------------------------------------------------
// The RoleHarbour panel, built from the reading exactly as the extension renders it

let S = {};
/** What checkTruth() compares: shot 2 quotes, the end-card fine print, illustrative badges. */
const truth = { body: '', fragments: [], fine: '', illustrativeEmployers: 0 };
const VISA = {
  sponsorship: {
    label: 'page.visaSupport',
    names: {
      supported: 'page.visaSupported',
      not_supported: 'page.visaUnsupported',
      not_mentioned: 'page.notMentioned',
      conflict: 'page.conflicting',
    },
    tones: { supported: 'positive' },
  },
  workRights: {
    label: 'page.workRights',
    names: {
      required: 'page.required',
      not_required: 'page.notRequired',
      not_mentioned: 'page.notMentioned',
      conflict: 'page.conflicting',
    },
    tones: { not_required: 'positive' },
  },
  residency: {
    label: 'page.residency',
    names: {
      citizen_or_resident_only: 'page.residencyRestricted',
      not_mentioned: 'page.notMentioned',
      conflict: 'page.conflicting',
    },
    tones: {},
  },
};
const KINDS = [
  ['language', 'page.kindLanguage'],
  ['tool', 'page.kindTool'],
  ['knowledge', 'page.kindKnowledge'],
  ['spoken', 'page.kindSpoken'],
  ['qualification', 'page.kindQualification'],
  ['personal', 'page.kindPersonal'],
];
const CHIP_STYLE = {
  language: 'skill',
  tool: 'skill',
  knowledge: 'skill',
  spoken: 'skill',
  qualification: 'qualification',
  personal: 'personal',
};

function fact(label, value) {
  return h('div', { class: 'rh-fact' }, h('dt', { text: label }), h('dd', {}, value));
}

function employerPill(state) {
  // The video does not run employer matching, so any result shown is illustrative.
  if (state !== 'checking') truth.illustrativeEmployers++;
  const [cls, key] = {
    matched: ['positive', 'page.matched'],
    review: ['warning', 'page.employerReview'],
    checking: ['neutral', 'page.checking'],
  }[state];
  return h('span', { class: `pill ${cls}`, text: S[key] });
}

/** One visa dimension: a coloured verdict, with the source sentence shown when opened. */
function visaFact(dimension, decision) {
  const spec = VISA[dimension];
  const { choice } = decision;
  const tone =
    choice === 'not_mentioned'
      ? 'quiet'
      : choice === 'conflict'
        ? 'warning'
        : (spec.tones[choice] ?? 'warning');
  const value =
    tone === 'quiet'
      ? h('span', { class: 'rh-quiet-value', text: S[spec.names[choice]] })
      : h('span', { class: `pill ${tone}`, text: S[spec.names[choice]] });
  const quote = decision.evidence[0]
    ? h('q', { class: 'rh-quote', text: decision.evidence[0].text.replace(/^[-*•●▪]\s*/, '') })
    : null;
  const dd = h('span', {}, value);
  const node = fact(S[spec.label], dd);
  return { node, value, quote, dd };
}

function checklist(prep) {
  const chips = [];
  const section = (title, entries) => {
    if (!entries.length) return null;
    const rows = KINDS.map(([kind, key]) => {
      const items = entries.filter((entry) => entry.kind === kind);
      if (!items.length) return null;
      const list = h(
        'ul',
        { class: 'rh-chips' },
        items.map((entry) => {
          const chip = h(
            'li',
            { class: `chip ${CHIP_STYLE[kind]}` },
            entry.terms.join(S['page.prepOr']),
            entry.level === 'unclear' ? h('span', { text: S['page.unclearSuffix'] }) : null,
          );
          chips.push(chip);
          return chip;
        }),
      );
      return h(
        'div',
        { class: 'rh-row' },
        h('span', { class: 'rh-row-label', text: S[key] }),
        h('div', {}, list),
      );
    });
    return h('section', { class: 'rh-section' }, h('h3', { text: title }), rows);
  };
  const atLevel = (levels) => prep.entries.filter((entry) => levels.includes(entry.level));
  const must = section(S['page.prepMust'], atLevel(['required', 'unclear']));
  let materials = null;
  if (prep.materials.length) {
    materials = h(
      'section',
      { class: 'rh-section' },
      h('h3', { text: S['page.prepMaterials'] }),
      prep.materials.map((material) => {
        const card = h(
          'div',
          { class: 'rh-material' },
          h('b', { text: material.label }),
          h('span', { text: material.source.text.replace(/^[-*•●▪]\s*/, '') }),
        );
        chips.push(card);
        return card;
      }),
    );
  }
  const preferred = section(S['page.prepPreferred'], atLevel(['preferred']));
  return { node: h('div', { class: 'rh-checklist' }, must, materials, preferred), chips };
}

function panel(reading, experience, { loading = false } = {}) {
  const tiles = [
    fact(
      S['page.occupationReference'],
      reading.occupationTitle ??
        h('span', { class: 'rh-quiet-value', text: S['page.undetermined'] }),
    ),
    fact(S['page.experience'], experience.label),
    fact(S['page.accreditedList'], employerPill('matched')),
  ];
  const visa = {};
  for (const dimension of ['sponsorship', 'workRights', 'residency']) {
    visa[dimension] = visaFact(dimension, reading.visa[dimension]);
    tiles.push(visa[dimension].node);
  }
  const list = checklist(reading.prep);
  const status = h('p', {
    text: S['page.prepLoading'],
    style: { margin: '0', fontSize: '12px', color: 'var(--rh-muted)' },
  });
  const node = h(
    'section',
    { class: 'rh-panel', 'data-ui': 'panel' },
    h(
      'header',
      { class: 'rh-header' },
      h('h2', { class: 'rh-title' }, 'RoleHarbour', h('span', { text: S['page.overview'] })),
      h(
        'div',
        { class: 'rh-actions' },
        h('span', { class: 'rh-quiet', html: `${GEAR}${S['page.settings']}` }),
        h('span', { class: 'rh-quiet', text: S['page.collapse'] }),
      ),
    ),
    h(
      'div',
      { class: 'rh-body' },
      h('dl', { class: 'rh-facts' }, tiles),
      loading ? status : list.node,
      h(
        'div',
        { class: 'rh-footer' },
        h('details', {}, h('summary', { text: S['page.listDetails'] })),
        h('p', { text: S['page.localNote'] }),
      ),
    ),
  );
  return { node, tiles, visa, chips: list.chips, checklist: list.node };
}

// ---------------------------------------------------------------------------
// Shots

const shots = [];

function addShot(timeline, id, build) {
  const { start, end } = timeline.shots.find((shot) => shot.id === id);
  const root = h('div', { class: 'shot', 'data-shot': String(id) });
  stage.append(root);
  shots.push({ id, start, end, root, render: build(root, { start, end, duration: end - start }) });
}

function buildShots({ timeline, reading, experience, job }) {
  const cues = timeline.cues;

  // 1 · "Job ads." slams in.
  addShot(timeline, 1, (root, shot) => {
    const word = h('div', {
      class: 'display',
      html: 'Job ads<span class="dot">.</span>',
      style: { fontSize: '280px' },
    });
    const wrap = box(
      0,
      0,
      { style: { width: `${W}px`, height: `${H}px`, display: 'grid', placeItems: 'center' } },
      word,
    );
    word.dataset.check = 'Job ads';
    root.append(wrap);
    return (l, t) => {
      const p = outExpo(prog(t, cues.slam, cues.slam + 0.55));
      pose(word, {
        scale: mix(1.3, 1, p) * mix(1, 1.045, prog(t, cues.slam, shot.end)),
        opacity: prog(t, cues.slam, cues.slam + 0.05),
        blur: (1 - p) * 16,
      });
    };
  });

  // 2 · Three flash cuts of advert fragments over a wall of advert text.
  addShot(timeline, 2, (root, shot) => {
    const wallText = job.body.split('\n').filter(Boolean);
    const wall = box(
      110,
      0,
      { class: 'wall' },
      [...wallText, ...wallText, ...wallText].map((text) => h('div', { text })),
    );
    const frags = [
      {
        html: '…<b>3+ years</b> of commercial…',
        x: 150,
        y: 330,
        size: 104,
        align: 'left',
      },
      { html: '…Employer <b>Work Visa</b> for…', x: 0, y: 450, size: 116, align: 'center' },
      { html: '…<b>React, Node.js, AWS</b> and…', x: 0, y: 560, size: 108, align: 'right' },
    ].map((frag) => {
      truth.fragments.push(frag.html);
      const node = box(frag.x, frag.y, {
        class: 'frag',
        html: frag.html,
        style: { fontSize: `${frag.size}px` },
      });
      if (frag.align === 'center')
        Object.assign(node.style, { left: '0', width: `${W}px`, textAlign: 'center' });
      if (frag.align === 'right')
        Object.assign(node.style, { left: 'auto', right: '150px', textAlign: 'right' });
      node.dataset.check = 'fragment';
      return node;
    });
    root.append(wall, ...frags);
    return (l, t) => {
      pose(wall, { y: mix(-80, -900, l / shot.duration), opacity: 0.32, blur: 1.6 });
      const index = cues.flashCuts.filter((cut) => t >= cut).length - 1;
      frags.forEach((node, i) => {
        if (i !== index) return void (node.style.opacity = '0');
        const cut = cues.flashCuts[i];
        const next = cues.flashCuts[i + 1] ?? shot.end;
        const q = prog(t, cut, next);
        const punch = outExpo(prog(t, cut, cut + 0.4));
        pose(node, { y: mix(40, -30, outCubic(q)), scale: mix(1.06, 1, punch), opacity: 1 });
      });
    };
  });

  // 3 · "Long." "Messy." "Buried." swap in one line; the last one sinks.
  addShot(timeline, 3, (root, shot) => {
    const words = ['Long.', 'Messy.', 'Buried.'].map((word) =>
      line(word.replace('.', '<span class="dot">.</span>'), { class: 'display' }),
    );
    const holder = box(0, 0, {
      style: { width: `${W}px`, height: `${H}px`, display: 'grid', placeItems: 'center' },
    });
    const slot = h('div', {
      style: { position: 'relative', fontSize: '250px', width: `${W}px`, height: '300px' },
    });
    words.forEach((word) => {
      Object.assign(word.node.style, {
        position: 'absolute',
        left: '0',
        right: '0',
        top: '0',
        textAlign: 'center',
      });
      word.node.dataset.check = 'swap word';
      slot.append(word.node);
    });
    holder.append(slot);
    root.append(holder);
    return (l, t) => {
      const swaps = cues.wordSwaps;
      words.forEach((word, i) => {
        const enter = outExpo(prog(t, swaps[i], swaps[i] + 0.22));
        const leave = i < 2 ? outExpo(prog(t, swaps[i + 1], swaps[i + 1] + 0.22)) : 0;
        word.inner.style.transform = `translateY(${mix(135, 0, enter) - 135 * leave}%)`;
        if (i === 2) {
          // "Buried." sinks, then a breath of empty frame before the drop.
          const gone = shot.end - 0.05;
          const sink = inCubic(prog(t, swaps[2] + 0.3, gone));
          pose(word.node, {
            y: sink * 70,
            scale: mix(1, 0.94, sink),
            opacity: t >= gone ? 0 : mix(1, 0.3, sink),
            blur: sink * 4,
          });
        }
      });
    };
  });

  // 4 · On the drop: crest, "Meet RoleHarbour.", Haru waving.
  addShot(timeline, 4, (root, shot) => {
    const crest = box(
      170,
      300,
      { 'data-check': 'crest' },
      h('img', { src: '../brand/logo/crest.svg', style: { width: '240px' }, alt: '' }),
    );
    const meet = line('Meet', {
      class: 'display muted',
      style: { fontSize: '96px', fontWeight: '700', letterSpacing: '-0.03em' },
    });
    const name = letters('RoleHarbour');
    const dot = h('span', { class: 'dot', text: '.' });
    const title = h(
      'div',
      { class: 'display', style: { fontSize: '184px' } },
      name.node,
      h('span', { class: 'letter' }, dot),
    );
    const text = box(
      460,
      270,
      { 'data-check': 'Meet RoleHarbour', 'data-ui': 'title' },
      meet.node,
      title,
    );
    const haru = box(
      1560,
      660,
      { 'data-check': 'Haru' },
      sticker('../brand/haru/face-wave.png', 262),
    );
    const bubble = box(1170, 770, {
      class: 'bubble',
      text: 'Hi, I’m Haru!',
      'data-check': 'bubble',
    });
    root.append(crest, text, haru, bubble);
    return (l) => {
      const spin = outExpo(prog(l, 0, 0.65));
      // A hard cut: the crest is already on screen on the drop frame.
      pose(crest, {
        pre: `perspective(900px) rotateY(${mix(-70, 0, spin)}deg)`,
        scale: mix(0.62, 1, outBack(prog(l, 0, 0.6))),
      });
      reveal(meet, outExpo(prog(l, -0.04, 0.4)));
      revealLetters(name, l, 0.12, 0.03, 0.4);
      dot.style.transform = `translateY(${mix(135, 0, outBack(prog(l, 0.6, 0.85)))}%)`;
      const pop = outBack(prog(l, 0.55, 1));
      pose(haru, {
        y: l > 1 ? Math.sin((l - 1) * Math.PI * 1.8) * -6 : 0,
        scale: pop,
        rotate: mix(-14, 0, pop),
        opacity: prog(l, 0.55, 0.62),
      });
      const say = outBack(prog(l, 0.95, 1.3));
      pose(bubble, { scale: say, opacity: prog(l, 0.95, 1.02), x: mix(40, 0, say) });
      pose(root, { scale: mix(1, 1.03, l / shot.duration) });
    };
  });

  // 5 · The browser window whips in; the panel's tiles drop in on the beat.
  addShot(timeline, 5, (root, shot) => {
    const parts = panel(reading, experience, { loading: true });
    const page = h(
      'div',
      { class: 'page' },
      h('h1', { class: 'job-title', text: job.title }),
      h('p', { class: 'job-meta', text: `${job.employer} · ${job.location}` }),
      parts.node,
      h('p', { class: 'job-body', text: job.body }),
    );
    const browser = h(
      'div',
      { class: 'browser', 'data-ui': 'browser' },
      h(
        'div',
        { class: 'browser-bar' },
        h('div', { class: 'browser-dots' }, h('i'), h('i'), h('i')),
        h('div', { class: 'browser-tab', text: job.title }),
        h(
          'div',
          { class: 'browser-address' },
          h('i', { style: { width: '14px' } }),
          h('i', { style: { width: '260px' } }),
        ),
      ),
      page,
    );
    const frame = box(745, 140, { style: { perspective: '2600px' } }, browser);
    const read = line('Read the ad<span class="dot">.</span>', {
      class: 'display',
      style: { fontSize: '90px' },
    });
    const now = line('Instantly<span class="dot">.</span>', {
      class: 'display',
      style: { fontSize: '90px' },
    });
    const caption = box(96, 410, { 'data-check': 'Read the ad' }, read.node, now.node);
    root.append(frame, caption);
    browser.dataset.check = 'browser';
    return (l, t) => {
      const fly = outExpo(prog(l, 0, 0.75));
      const settle = inOutCubic(prog(l, 0.75, shot.duration));
      pose(browser, {
        pre: `rotateY(${mix(-38, -9, fly) + 6 * settle}deg) rotateX(${mix(10, 4, fly) - 2 * settle}deg)`,
        x: mix(1100, 0, fly),
        scale: mix(0.84, 1, fly),
        blur: (1 - fly) * 18,
      });
      reveal(read, outExpo(prog(l, 0.3, 0.7)));
      reveal(now, outExpo(prog(l, 0.5, 0.9)));
      parts.tiles.forEach((tile, i) => {
        const cue = cues.tiles[i];
        const q = outBack(prog(t, cue, cue + 0.3));
        pose(tile, { y: mix(-30, 0, q), opacity: prog(t, cue, cue + 0.08), scale: mix(0.9, 1, q) });
      });
    };
  });

  // 6 · Macro shot of the checklist; chips pop on sixteenths.
  addShot(timeline, 6, (root, shot) => {
    const parts = panel(reading, experience);
    const scale = 2;
    const holder = box(0, 0, {}, parts.node);
    holder.style.transformOrigin = '0 0';
    const lens = box(
      210,
      236,
      { style: { width: '1500px', height: '844px', overflow: 'hidden' } },
      holder,
    );
    const title = line('Your checklist<span class="dot">.</span>', {
      class: 'display',
      style: { fontSize: '112px' },
    });
    const caption = box(110, 70, { 'data-check': 'Your checklist' }, title.node);
    root.append(lens, caption);
    let top = 0;
    return (l, t) => {
      if (!top) top = parts.checklist.offsetTop;
      const zoom = outExpo(prog(l, 0, 0.9));
      const pan = inOutCubic(prog(l, 0.3, shot.duration - 0.2));
      // Start close on "Must have" and drift down the list.
      const now = mix(scale * 1.12, scale, zoom);
      pose(holder, { y: 34 - top * now - 14 * pan, x: mix(-40, 0, zoom), scale: now });
      reveal(title, outExpo(prog(l, 0, 0.4)));
      parts.chips.forEach((chip, i) => {
        const cue =
          cues.chips[i] ?? cues.chips[cues.chips.length - 1] + (i - cues.chips.length + 1) * 0.125;
        const q = outBack(prog(t, cue, cue + 0.25));
        pose(chip, { scale: mix(0.5, 1, q), opacity: prog(t, cue, cue + 0.06) });
      });
    };
  });

  // 7 · Every answer keeps its source: open the visa verdict and mark the ad's sentence.
  addShot(timeline, 7, (root) => {
    const decision = reading.visa.sponsorship;
    const verdict = visaFact('sponsorship', decision);
    const tile = verdict.node;
    tile.style.width = '290px';
    tile.dataset.ui = 'visa tile';
    const tileBox = box(1010, 150, { 'data-check': 'visa tile' }, tile);
    tileBox.style.transformOrigin = '0 0';
    tileBox.style.transform = 'scale(2.35)';
    if (verdict.quote) verdict.dd.append(verdict.quote);
    const quote = verdict.quote;
    const sentence = decision.evidence[0].text;
    const words = sentence.split(' ').map((word) => h('span', { class: 'mark', text: word }));
    const card = box(
      110,
      600,
      {
        'data-ui': 'advert',
        'data-check': 'advert sentence',
        style: {
          width: '1700px',
          background: '#fff',
          borderRadius: '26px',
          padding: '40px 52px',
          boxShadow: '0 24px 60px rgba(5,26,73,.08)',
        },
      },
      h('div', {
        text: 'Visa',
        style: {
          fontSize: '24px',
          fontWeight: '700',
          color: 'var(--rh-muted)',
          marginBottom: '10px',
        },
      }),
      h(
        'div',
        {
          style: {
            fontSize: '56px',
            fontWeight: '500',
            lineHeight: '1.32',
            letterSpacing: '-0.02em',
            color: 'var(--rh-text)',
          },
        },
        words.flatMap((word, i) => (i ? [' ', word] : [word])),
      ),
    );
    const one = line('Every answer<span class="dot">.</span>', {
      class: 'display',
      style: { fontSize: '108px' },
    });
    const two = line('Its source<span class="dot">.</span>', {
      class: 'display',
      style: { fontSize: '108px' },
    });
    const caption = box(110, 120, { 'data-check': 'Every answer' }, one.node, two.node);
    const cursor = box(0, 0, { html: CURSOR });
    const haru = box(
      1716,
      130,
      { 'data-check': 'Haru' },
      sticker('../brand/haru/face-closed-eyes.png', 176),
    );
    root.append(card, tileBox, caption, cursor, haru);
    return (l, t) => {
      reveal(one, outExpo(prog(l, 0, 0.4)));
      reveal(two, outExpo(prog(l, 0.15, 0.55)));
      const travel = inOutCubic(prog(l, 0.2, 0.75));
      // From lower right to the verdict pill (tile at 1010,150 scaled 2.35).
      const target = { x: 1010 + 2.35 * 40, y: 150 + 2.35 * 34 };
      pose(cursor, {
        x: mix(1560, target.x, travel),
        y: mix(560, target.y, travel),
        scale: l > 0.75 && l < 0.85 ? 0.9 : 1,
      });
      const click = prog(l, 0.78, 0.95);
      verdict.value.style.transform = `scale(${l > 0.75 && l < 0.85 ? 0.94 : 1})`;
      if (quote) {
        quote.style.display = l >= 0.78 ? 'block' : 'none';
        quote.style.opacity = String(click);
      }
      const sweep = prog(t, cues.markerStart, cues.markerEnd);
      words.forEach((word, i) => mark(word, sweep * words.length - i));
      const pop = outBack(prog(l, 0.6, 1));
      pose(haru, { scale: pop, rotate: mix(12, 0, pop), opacity: prog(l, 0.6, 0.66) });
    };
  });

  // 8 · Job cards whip in; employer badges stamp from "Checking" to their result.
  addShot(timeline, 8, (root) => {
    const card = (title, employer, location, teaser) => {
      const pill = { checking: employerPill('checking') };
      const slot = h('span', {}, pill.checking);
      const node = h(
        'div',
        { class: 'card', 'data-ui': 'card' },
        h('h4', { text: title }),
        h('p', { class: 'meta', text: `${employer} · ${location}` }),
        h('p', { class: 'teaser', text: teaser }),
        h(
          'div',
          { class: 'card-label' },
          h('span', { class: 'card-brand', text: 'RoleHarbour' }),
          h('div', { class: 'card-employer' }, h('span', { text: S['page.accreditedList'] }), slot),
          h('span', { class: 'card-action', text: S['page.viewRequirements'] }),
        ),
      );
      return { node, slot, pill };
    };
    const cards = [
      card(
        job.title,
        job.employer,
        job.location,
        'Build scheduling tools for New Zealand ports with React and Node.js.',
      ),
      card(
        'Junior Product Designer',
        'Saltmarsh Studio',
        'Auckland',
        'Design calm, accessible interfaces for a small product studio.',
      ),
    ];
    cards[0].pill.done = employerPill('matched');
    cards[1].pill.done = employerPill('review');
    const holders = cards.map((c, i) => {
      const holder = box(840, 190 + i * 340, { 'data-check': `card ${i + 1}` }, c.node);
      holder.style.transformOrigin = '0 0';
      return holder;
    });
    const one = line('Employer?', { class: 'display', style: { fontSize: '112px' } });
    const two = line('Checked<span class="dot">.</span>', {
      class: 'display',
      style: { fontSize: '112px' },
    });
    const caption = box(110, 360, { 'data-check': 'Employer checked' }, one.node, two.node);
    const note = box(840, 900, {
      text: S['page.listMatchNote'],
      'data-check': 'list note',
      style: { fontSize: '24px', color: 'var(--rh-muted)', width: '980px' },
    });
    root.append(...holders, caption, note);
    return (l, t) => {
      holders.forEach((holder, i) => {
        const whip = outExpo(prog(l, 0.05 * i, 0.6 + 0.05 * i));
        pose(holder, {
          x: mix(1300, 0, whip),
          scale: 1.6,
          blur: (1 - whip) * 22,
          opacity: prog(l, 0.05 * i, 0.1 + 0.05 * i),
        });
        const stampAt = cues.stamps[i];
        const c = cards[i];
        const done = t >= stampAt;
        const pill = done ? c.pill.done : c.pill.checking;
        if (c.slot.firstChild !== pill) c.slot.replaceChildren(pill);
        const s = outBack(prog(t, stampAt, stampAt + 0.22));
        pill.style.display = 'inline-flex';
        pill.style.transform = done
          ? `scale(${mix(1.9, 1, s)}) rotate(${mix(-10, 0, s)}deg)`
          : 'none';
      });
      reveal(one, outExpo(prog(l, 0.1, 0.5)));
      reveal(two, outExpo(prog(t, cues.stamps[0], cues.stamps[0] + 0.4)));
      note.style.opacity = String(prog(l, 0.7, 1));
    };
  });

  // 9 · Everything stays on the device: the cloud is struck out.
  addShot(timeline, 9, (root, shot) => {
    const cloud = box(W / 2 - 110, 150, {
      html: CLOUD,
      style: { width: '220px', height: '220px' },
    });
    const strike = box(W / 2 - 150, 330, {
      style: {
        width: '300px',
        height: '14px',
        background: 'var(--navy)',
        borderRadius: '7px',
        transformOrigin: '0 50%',
      },
    });
    const words = ['100%', 'on', 'your', 'device.'].map((word) =>
      line(word.replace('.', '<span class="dot">.</span>')),
    );
    const headline = h(
      'div',
      { class: 'display', style: { fontSize: '176px', textAlign: 'center' } },
      words.flatMap((word, i) => {
        word.node.style.display = 'inline-block';
        return i ? [' ', word.node] : [word.node];
      }),
    );
    const head = box(
      0,
      420,
      { 'data-check': '100% on your device', style: { width: `${W}px` } },
      headline,
    );
    const subs = ['No account.', 'No uploads.'].map((text) =>
      line(text, { style: { display: 'inline-block' } }),
    );
    const sub = box(
      0,
      690,
      {
        'data-check': 'No account',
        style: {
          width: `${W}px`,
          textAlign: 'center',
          fontSize: '60px',
          fontWeight: '700',
          color: 'var(--rh-muted)',
          letterSpacing: '-0.02em',
        },
      },
      subs[0].node,
      ' ',
      subs[1].node,
    );
    root.append(cloud, strike, head, sub);
    const puff = cues.puff - shot.start;
    return (l) => {
      const inn = outBack(prog(l, 0, 0.35));
      const gone = outCubic(prog(l, puff, puff + 0.3));
      pose(cloud, {
        scale: mix(0.6, 1, inn) * mix(1, 0.7, gone),
        opacity: prog(l, 0, 0.05) * (1 - gone),
        blur: gone * 10,
      });
      strike.style.transform = `rotate(-28deg) scaleX(${outExpo(prog(l, puff - 0.3, puff - 0.05))})`;
      strike.style.opacity = String(1 - gone);
      words.forEach((word, i) => reveal(word, outExpo(prog(l, 0.1 + i * 0.09, 0.45 + i * 0.09))));
      headline.style.letterSpacing = `${mix(-0.02, -0.055, inOutCubic(l / shot.duration))}em`;
      const rise = outExpo(prog(l, puff, puff + 0.6));
      pose(head, { y: -110 * rise });
      pose(sub, { y: -110 * rise });
      subs.forEach((word, i) =>
        reveal(word, outExpo(prog(l, puff + 0.15 + i * 0.15, puff + 0.5 + i * 0.15))),
      );
    };
  });

  // 10 · End card: lockup, tagline, Haru.
  addShot(timeline, 10, (root) => {
    const halo = box(1170, 230, {
      style: { width: '720px', height: '720px', borderRadius: '50%', background: 'var(--sky)' },
    });
    const haru = box(
      1380,
      300,
      { 'data-check': 'Haru' },
      h('img', { src: '../brand/haru/full-front.png', style: { height: '760px' }, alt: '' }),
    );
    const brand = line(
      '<span style="display:inline-flex;align-items:center;gap:26px"><img src="../brand/logo/crest.svg" style="width:118px" alt="">RoleHarbour</span>',
      { class: 'display', style: { fontSize: '110px' } },
    );
    const markText = h('span', { class: 'mark', text: 'read for you.' });
    const tagline = line('', {
      class: 'display',
      style: { fontSize: '84px', fontWeight: '800', letterSpacing: '-0.04em' },
    });
    tagline.inner.append('Job ads, ', markText);
    const store = line('Chrome extension for SEEK NZ', {
      style: { fontSize: '44px', fontWeight: '500', color: 'var(--rh-muted)' },
    });
    const text = box(
      130,
      330,
      { 'data-check': 'end card text' },
      brand.node,
      h('div', { style: { height: '44px' } }),
      tagline.node,
      h('div', { style: { height: '30px' } }),
      store.node,
    );
    const fine = box(134, 990, {
      text: 'Illustrative job ad and employer results. Independent of SEEK and INZ.',
      'data-check': 'fine print',
      style: { fontSize: '24px', color: '#8995a9' },
    });
    truth.fine = fine.textContent;
    root.append(halo, haru, text, fine);
    return (l) => {
      const grow = outExpo(prog(l, 0, 0.7));
      pose(halo, { scale: mix(0.4, 1, grow), opacity: prog(l, 0, 0.05) });
      const rise = outExpo(prog(l, 0.05, 0.8));
      pose(haru, { y: mix(260, 0, rise), opacity: prog(l, 0.05, 0.12) });
      reveal(brand, outExpo(prog(l, 0, 0.45)));
      reveal(tagline, outExpo(prog(l, 0.2, 0.65)));
      mark(markText, inOutCubic(prog(l, 0.65, 1.15)));
      reveal(store, outExpo(prog(l, 0.45, 0.9)));
      fine.style.opacity = String(prog(l, 0.8, 1.1));
    };
  });
}

// ---------------------------------------------------------------------------
// Public API for render.mjs and previews

let drop = 3;

window.renderAt = (t) => {
  shots.forEach((shot, i) => {
    const last = i === shots.length - 1;
    const visible = t >= shot.start && (t < shot.end || (last && t <= shot.end));
    shot.root.style.display = visible ? 'block' : 'none';
    if (visible) shot.render(t - shot.start, t);
  });
  // The drop hits the whole frame.
  const punch = prog(t, drop, drop + 0.3);
  stage.style.transform =
    t >= drop && punch < 1 ? `scale(${mix(1.045, 1, outExpo(punch))})` : 'none';
};

/** Problems with what the video claims: quotes not in the advert, undisclosed illustrations. */
window.checkTruth = () => {
  const problems = [];
  const body = truth.body.replace(/\s+/g, ' ');
  for (const fragment of truth.fragments) {
    const quote = fragment
      .replace(/<[^>]+>/g, '')
      .replace(/…/g, '')
      .trim();
    if (!body.includes(quote))
      problems.push(`shot 2 quotes "${quote}", which is not in the advert`);
  }
  if (truth.illustrativeEmployers && !/employer results/i.test(truth.fine))
    problems.push('employer results are illustrative, but the fine print does not say so');
  return problems;
};

/** The union of the text and images inside a node: what is actually drawn, not its box. */
function contentRect(node) {
  // Containers that clip their own content are judged by their box.
  if (node.matches('.browser, [data-ui]')) return node.getBoundingClientRect();
  const rects = [];
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (!walker.currentNode.textContent.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(walker.currentNode);
    rects.push(...range.getClientRects());
  }
  for (const img of node.querySelectorAll('img')) rects.push(img.getBoundingClientRect());
  if (node.matches('img')) rects.push(node.getBoundingClientRect());
  const drawn = rects.filter((r) => r.width && r.height);
  if (!drawn.length) return null;
  return {
    left: Math.min(...drawn.map((r) => r.left)),
    top: Math.min(...drawn.map((r) => r.top)),
    right: Math.max(...drawn.map((r) => r.right)),
    bottom: Math.max(...drawn.map((r) => r.bottom)),
  };
}

/** Problems at time t: text leaving the frame, overflowing boxes, Haru covering UI. */
window.checkLayout = (t) => {
  window.renderAt(t);
  const problems = [];
  const intersects = (a, b) =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  for (const shot of shots.filter((s) => s.root.style.display === 'block')) {
    for (const node of shot.root.querySelectorAll('[data-check]')) {
      if (node.style.opacity === '0') continue;
      const r = contentRect(node);
      if (!r) continue;
      if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1)
        problems.push(
          `shot ${shot.id} at ${t}s: "${node.dataset.check}" leaves the frame [${[r.left, r.top, r.right, r.bottom].map(Math.round)}]`,
        );
    }
    for (const node of shot.root.querySelectorAll(
      '.rh-fact dd, .chip, .pill, .card h4, .card .meta',
    )) {
      if (node.scrollWidth > node.clientWidth + 1)
        problems.push(`shot ${shot.id} at ${t}s: "${node.textContent.trim()}" overflows its box`);
    }
    const stickers = [...shot.root.querySelectorAll('[data-sticker] img, .bubble')].map((node) =>
      node.getBoundingClientRect(),
    );
    for (const ui of shot.root.querySelectorAll('[data-ui]')) {
      const r = ui.getBoundingClientRect();
      if (stickers.some((s) => intersects(s, r)))
        problems.push(`shot ${shot.id} at ${t}s: Haru or her bubble covers "${ui.dataset.ui}"`);
    }
  }
  return problems;
};

async function json(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

window.ready = (async () => {
  await window.fontsReady;
  const [timeline, captured, job, strings] = await Promise.all(
    ['timeline.json', 'data/reading.json', 'data/job.json', 'data/strings.json'].map(json),
  );
  S = strings;
  truth.body = job.body;
  drop = timeline.cues.drop;
  buildShots({ timeline, reading: captured.reading, experience: captured.experience, job });
  await Promise.all([...stage.querySelectorAll('img')].map((img) => img.decode()));
  window.timeline = timeline;
  window.renderAt(Number(new URLSearchParams(location.search).get('t') ?? 0));
})();
