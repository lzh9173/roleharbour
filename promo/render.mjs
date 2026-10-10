// Render the promo video, or only a still per shot with --stills.
// Usage: node promo/render.mjs [--stills [--at 4.4,6.4]]
// Needs output/promo/music.wav from promo/music.py for the full render.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchChrome } from './lib/chrome.mjs';
import { serveDirectory } from './lib/serve.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
// Intermediates (music, stills) stay in the ignored output/; the video and poster are
// brand assets kept in the repository and shown in the README.
const out = `${root}output/promo`;
const deliver = `${root}brand/promo`;
const stillsOnly = process.argv.includes('--stills');
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');

const server = await serveDirectory(root);
const chrome = await launchChrome({ width: 1920, height: 1080 });

/** Render time t and wait two animation frames so the capture shows it. */
async function frame(page, t) {
  await page.evaluate(
    `(async () => {
      window.renderAt(${t});
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('requestAnimationFrame stalled')), 3000);
        requestAnimationFrame(() => requestAnimationFrame(() => (clearTimeout(timer), resolve())));
      });
    })()`,
  );
  return page.screenshot();
}

async function preflight(page, timeline) {
  const times = timeline.shots.flatMap((shot) => [
    +((shot.start + shot.end) / 2).toFixed(3),
    +(shot.end - 0.06).toFixed(3),
  ]);
  const problems = [];
  for (const t of times) problems.push(...(await page.evaluate(`window.checkLayout(${t})`)));
  problems.push(...(await page.evaluate('window.checkTruth()')));
  if (problems.length) throw new Error(`Preflight problems:\n${problems.join('\n')}`);

  // A frame is a pure function of time: same bytes after other frames, and in a fresh page.
  const middle = (shot) => +((shot.start + shot.end) / 2).toFixed(3);
  const probe = middle(timeline.shots[6]);
  const first = hash(await frame(page, probe));
  await frame(page, timeline.shots[3].start + 0.1);
  const again = hash(await frame(page, probe));
  const fresh = await chrome.open(`${server.url}promo/video.html?t=${probe}`);
  await fresh.evaluate('window.ready');
  const direct = hash(await frame(fresh, probe));
  await fresh.close();
  if (first !== again || first !== direct)
    throw new Error(`Frame ${probe}s is not deterministic: ${first} / ${again} / ${direct}`);
  console.log(`preflight: ${times.length} layout checks clean; frames deterministic`);
}

async function encode(page, timeline) {
  const wav = `${out}/music.wav`;
  await access(wav).catch(() => {
    throw new Error(`${wav} is missing; run python3 -I promo/music.py ${wav}`);
  });
  const frames = Math.round(timeline.duration * timeline.fps);
  const ffmpeg = spawn(
    'ffmpeg',
    [
      ...['-y', '-hide_banner', '-loglevel', 'error'],
      ...['-f', 'image2pipe', '-framerate', String(timeline.fps), '-i', '-', '-i', wav],
      ...['-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow'],
      ...['-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k'],
      ...['-movflags', '+faststart', '-t', String(timeline.duration)],
      `${deliver}/roleharbour-promo.mp4`,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  // A missing binary is an 'error' event, a failed encode an exit code; either way stop
  // writing frames and report why. EPIPE on stdin follows from the same failure.
  let failure = null;
  const finished = new Promise((resolve, reject) => {
    ffmpeg.once('error', reject);
    ffmpeg.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)),
    );
  });
  finished.catch((error) => (failure = error));
  ffmpeg.stdin.on('error', () => {});
  for (let i = 0; i < frames && !failure; i++) {
    const png = await frame(page, i / timeline.fps);
    if (!ffmpeg.stdin.write(png))
      await Promise.race([
        new Promise((resolve) => ffmpeg.stdin.once('drain', resolve)),
        finished.catch(() => {}),
      ]);
    if (i % 120 === 0) console.log(`frame ${i}/${frames}`);
  }
  ffmpeg.stdin.end();
  await finished;
  await writeFile(`${deliver}/poster.png`, await frame(page, timeline.duration - 0.5));
  console.log(`${deliver}/roleharbour-promo.mp4 (${frames} frames) and poster.png`);
}

try {
  await mkdir(`${out}/stills`, { recursive: true });
  await mkdir(deliver, { recursive: true });
  const page = await chrome.open(`${server.url}promo/video.html`);
  await page.evaluate('window.ready');
  const timeline = await page.evaluate('window.timeline');
  await preflight(page, timeline);
  if (stillsOnly) {
    // --at 4.4,6.4 picks the moments; the default is the middle of every shot.
    const at = process.argv[process.argv.indexOf('--at') + 1];
    const times = process.argv.includes('--at')
      ? at.split(',').map(Number)
      : timeline.shots.map((shot) => +((shot.start + shot.end) / 2).toFixed(3));
    for (const t of times)
      await writeFile(`${out}/stills/t-${t.toFixed(3)}.png`, await frame(page, t));
    console.log(`${out}/stills: ${times.length} stills`);
  } else await encode(page, timeline);
} finally {
  await chrome.close();
  await server.close();
}
