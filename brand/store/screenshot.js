// Chrome Web Store screenshots: a caption above the promotional site's demo, which renders the
// extension's own panel components for an invented advert. `?shot=N` picks a screenshot;
// `window.shotReady` resolves once the demo shows the pictured state.
const SHOTS = {
  1: {
    lang: 'en',
    haru: 'face-smile',
    title: 'See where every answer <span class="mark">came from</span>.',
    sub: 'Click a visa verdict or a skill and the sentence it was read from lights up in the ad.',
    act: (doc) => doc.querySelector('#demo .facts button[title]').click(),
  },
  2: {
    lang: 'en',
    haru: 'face-thumbs-up',
    title: 'A preparation checklist, <span class="mark">straight from the ad</span>.',
    sub: 'Skills, tools and documents to prepare, split into must-haves and nice-to-haves.',
    act: (doc) => button(doc, 'TypeScript').click(),
  },
  3: {
    lang: 'en',
    haru: 'face-thinking',
    title: 'Is the employer on the <span class="mark">accredited list</span>?',
    sub: "Matched on your device against a dated snapshot of NZ's accredited employer list.",
    act: (doc) => {
      doc.querySelector('#demo details').open = true;
    },
    // Show the bottom of the panel, where the list details open.
    scroll: (doc) => bottomOf(doc.querySelector('#demo section[aria-label]')) - 590,
  },
  4: {
    lang: 'zh',
    haru: 'face-wave',
    title: 'Five languages. <span class="mark">Quotes stay as written.</span>',
    sub: 'English, Simplified and Traditional Chinese, Japanese and Korean.',
    act: (doc) => doc.querySelector('#demo .facts button[title]').click(),
  },
};

const shot = SHOTS[new URLSearchParams(location.search).get('shot')];
if (!shot) throw new Error('Unknown ?shot=; use 1 to 4');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bottomOf = (element) =>
  element.getBoundingClientRect().bottom + element.ownerDocument.defaultView.scrollY;

function button(doc, text) {
  const found = [...doc.querySelectorAll('#demo button')].find(
    (item) => item.textContent.trim() === text,
  );
  if (!found) throw new Error(`No demo button named ${text}`);
  return found;
}

async function until(check, what) {
  for (let tries = 0; tries < 100; tries++) {
    const value = check();
    if (value) return value;
    await wait(100);
  }
  throw new Error(`${what} did not appear`);
}

document.getElementById('title').innerHTML = shot.title;
document.getElementById('sub').textContent = shot.sub;
document.getElementById('haru').src = `../haru/${shot.haru}.png`;

window.shotReady = (async () => {
  await window.fontsReady;
  const frame = document.getElementById('site');
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
  frame.src = `../../output/site/index.html?lang=${shot.lang}`;
  await loaded;
  const doc = frame.contentDocument;
  const view = frame.contentWindow;
  await until(() => doc.querySelector('#demo .facts'), 'The demo panel');
  await doc.fonts.load('600 16px Inter');
  await doc.fonts.ready;
  // Picture the demo alone: no site header or note, no sticky offset for the panel.
  const style = doc.createElement('style');
  style.textContent = `html { scroll-behavior: auto !important; }
    header.sticky, #demo > p { display: none !important; }
    #demo .lg\\:sticky { position: static !important; }`;
  doc.head.append(style);
  shot.act(doc);
  // Let the highlight sweep and the ad's own scroll finish.
  await wait(1500);
  const grid = doc.querySelector('#demo .grid');
  view.scrollTo(0, shot.scroll ? shot.scroll(doc) : bottomOf(grid) - grid.offsetHeight - 36);
  const ad = doc.querySelector('#demo article');
  const marked = ad.querySelector('mark');
  if (marked) ad.scrollTop = Math.max(0, marked.offsetTop - ad.clientHeight * 0.35);
  await wait(300);
})();
