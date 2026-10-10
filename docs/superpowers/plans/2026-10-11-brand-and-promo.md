# Brand and promo video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Haru's assets, the new extension icons, the logo lockup and banner, and a 14-second promo video rendered from source.

**Architecture:** Python (Pillow, NumPy) cuts Haru out of the AI character sheet and synthesises the music. A small DevTools-protocol client in Node drives the installed Chrome to render HTML sources (lockup, banner, video frames) to PNG. ffmpeg encodes the frames and muxes the audio. Extension icons are composed with sharp in `scripts/icons.ts`.

**Tech Stack:** Node 26 (built-in `WebSocket`), Chrome 154 headless, ffmpeg 8.1, Python 3.13 with Pillow 11 and NumPy 2, sharp, Vitest (throwaway capture only).

**Spec:** `docs/superpowers/specs/2026-10-11-brand-and-promo-design.md`

## Global Constraints

> Retimed on 2026-10-11 at the user's request: the video is now 25.8 s (1548 frames) at 100 BPM, and every time comes from `promo/timeline.json`. The 14 s figures below describe the first cut.

- Video: 1920 × 1080, 60 fps, 840 frames, 14.0 s, H.264 High yuv420p CRF 18 `+faststart`, AAC 192 kbit/s, under 10 MB.
- Palette: navy `#051a49`, amber `#F5B841`, sky `#CFE8FF`, background `#F7F8FA`, text `#2e3849`.
- No SEEK logo, colours or URL. SEEK is named only in the end-card line "Chrome extension for SEEK NZ".
- End-card fine print: "Illustrative job ad and employer results. Independent of SEEK and INZ."
- UI values come only from `promo/data/reading.json` and the English strings in `src/i18n/page.ts`.
- No new npm dependencies. No git commits unless the user asks.
- Character source: `haru-sheet-v3.png` (1376 × 768) from the session scratchpad, copied to `brand/haru/source/`.

## Review Focus

- Inter not loaded when the first frame is captured: frames silently use a fallback font. The renderer must fail unless `document.fonts.check('900 64px Inter')` is true.
- Rendering is not a pure function of time: frame N differs from opening `video.html?t=N/60`. Capturing the same time twice must give byte-identical PNGs.
- Audio and video lengths differ, so ffmpeg trims or pads. Both streams must probe at 14.0 s ± 1 frame.
- Long values from the engine (occupation title, chip text) overflow their tiles at 1920 px. `video.html` exposes `checkLayout(t)` that lists elements overflowing their parent or the frame, and the renderer fails on any.
- Icon edges: the 16 px icon shows a grey fringe or square corners on a dark toolbar. Checked on a light and a dark mock-up at actual size.

---

### Task 1: Haru assets

**Files:**

- Create: `brand/scripts/extract_haru.py`, `brand/haru/*.png`, `brand/haru/source/haru-sheet-v3.png`, `brand/haru/README.md`

**Interfaces:**

- Produces: transparent PNGs `full-front.png`, `full-pointing.png`, `face-smile.png`, `face-closed-eyes.png`, `face-surprised.png`, `face-closed-eyes-2.png`, `face-thinking.png`, `face-thumbs-up.png`, `face-wave.png`, `face-determined.png`, `face-laughing.png`, each trimmed to its alpha bounding box plus 4 px.

- [ ] Write `extract_haru.py`: flood-fill the white background from the four corners (threshold 40), erode alpha by one pixel (MinFilter 3), feather (Gaussian 0.8), then crop each named box and trim.
- [ ] Run `python3 -I brand/scripts/extract_haru.py brand/haru/source/haru-sheet-v3.png brand/haru`.
- [ ] Verify: composite every PNG on magenta and inspect; no white halo, no neighbouring figure inside a crop.
- [ ] Write `brand/haru/README.md` with generator, model, date, prompt, AI-copyright note and usage rules.

### Task 2: Extension icons

**Files:**

- Modify: `scripts/icons.ts`, `public/icon/{16,32,48,128}.png`

**Interfaces:**

- Consumes: `brand/haru/face-smile.png`.

- [ ] Rewrite `icons.ts`: for each size, create a sky `#CFE8FF` rounded square (radius 23% of the side) as an SVG mask, composite the face crop (sizes 48 and 128 use the full head; 16 and 32 use a tighter crop of eyes, fringe and beret), and apply the mask so corners are transparent.
- [ ] Run `node --experimental-strip-types scripts/icons.ts`.
- [ ] Verify: preview sheet at actual size on `#f3f5f7` and `#202124`; `pnpm build` succeeds; `.output/chrome-mv3/manifest.json` still lists the four icons; `pnpm lint` passes.

### Task 3: Chrome capture client

**Files:**

- Create: `promo/lib/chrome.mjs`

**Interfaces:**

- Produces: `launchChrome({ width, height }) → Promise<Browser>` and, on `Browser`, `open(url) → Promise<Page>` and `close()`; on `Page`, `evaluate(expression) → Promise<unknown>` and `screenshot({ transparent }) → Promise<Buffer>`.

- [ ] Launch `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless=new --remote-debugging-port=0 --user-data-dir=<tmp>`, read the `DevTools listening on ws://…` line from stderr, connect with `WebSocket`, create a target, attach with `flatten: true`, set the device metrics override, and implement `Runtime.evaluate` with `awaitPromise` and `Page.captureScreenshot`.
- [ ] Verify: a one-off script opens `data:text/html,<h1>ok</h1>`, saves a screenshot and exits; capturing twice gives identical bytes.

### Task 4: Crest, lockup and banner

**Files:**

- Create: `brand/logo/crest.svg`, `brand/logo/lockup.html`, `brand/banner.html`, `brand/scripts/render-brand.mjs`, outputs `brand/logo/lockup.png`, `brand/logo/lockup@2x.png`, `brand/banner.png`

**Interfaces:**

- Consumes: `launchChrome` from Task 3, `brand/haru/full-front.png`.

- [ ] Draw `crest.svg` per the spec (shield, inset gold border, banded lighthouse, white lamp room, `#FFE3A3` beams).
- [ ] Build `lockup.html` (transparent background) and `banner.html` (1280 × 640), both loading Inter from Google Fonts.
- [ ] `render-brand.mjs` waits for `document.fonts.ready`, fails unless Inter is loaded, and saves the three PNGs.
- [ ] Verify by viewing each PNG.

### Task 5: Job ad and reading

**Files:**

- Create: `promo/data/job.json`, `promo/data/reading.json`; temporary `tests/promo-capture.test.ts` (deleted after use)

**Interfaces:**

- Produces: `reading.json`, the `LocalReading` returned by `localAnalysis(job.title, job.body)`, plus the `experienceSummary` label.

- [ ] Write an invented ad: "Intermediate Software Developer", invented company, Wellington, with must-have bullets (TypeScript, React, Node.js, AWS, Git), nice-to-haves, a cover-letter request, years of experience, an existing-work-rights sentence and a citizenship-or-residency sentence.
- [ ] Capture with a temporary Vitest file that writes `reading.json`; run `pnpm exec vitest run tests/promo-capture.test.ts`; delete the file.
- [ ] Verify the reading supports every UI shot: an occupation reference, an experience label, at least one visa verdict with a source sentence, at least six checklist chips. If not, change the ad and capture again.

### Task 6: Music

**Files:**

- Create: `promo/music.py`; output `output/promo/music.wav`

- [ ] Synthesise per the spec (intro 0–3 s; drop at 3.0 s; Fmaj7, G7, Em7, Am7 at 2 s each; rise 11–12.5 s; C hit at 12.5 s; effects at storyboard times), 48 kHz stereo, exactly 672 000 samples.
- [ ] Normalise with `ffmpeg -af loudnorm=I=-16:TP=-1.5:LRA=11` and resample to 48 kHz.
- [ ] Verify: `ffprobe` duration 14.000 s; listen to the onsets at 3.0, 9.5, 10.0 and 12.5 s by checking peak frames in a quick NumPy onset scan.

### Task 7: Video page

**Files:**

- Create: `promo/video.html`, `promo/video.css`, `promo/video.js`

**Interfaces:**

- Consumes: `brand/haru/*.png`, `brand/logo/crest.svg`, `promo/data/reading.json`.
- Produces: `window.renderAt(seconds: number): void`, `window.checkLayout(seconds: number): string[]`, `window.ready: Promise<void>` (fonts, images and JSON loaded); `?t=` query renders one moment for preview.

- [ ] Build the ten shots as functions of local time with shared easing helpers (`easeOutExpo`, `easeOutBack`, `clamp`, `mix`) and a shot table matching the storyboard times.
- [ ] Preview stills at each shot's midpoint and fix layout until `checkLayout` returns no entries.

### Task 8: Render and encode

**Files:**

- Create: `promo/render.mjs`, `promo/README.md`; outputs `output/promo/roleharbour-promo.mp4`, `output/promo/poster.png`

- [ ] `render.mjs` opens `video.html` through a local static file server on 127.0.0.1 (Node `http`, serving the repository root), awaits `ready`, asserts Inter, checks layout at every shot's midpoint, then pipes 840 PNG frames into `ffmpeg -f image2pipe -framerate 60 -i - -i output/promo/music.wav -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 18 -c:a aac -b:a 192k -movflags +faststart`.
- [ ] Save `poster.png` at t = 13.5 s.
- [ ] Verify with `ffprobe` (size, fps, frame count, both stream durations), file size under 10 MB, and stills extracted at every shot's midpoint.

### Task 9: Final checks

- [ ] `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build` pass.
- [ ] Trace every UI value in the stills to `reading.json` or `src/i18n/page.ts`.
- [ ] Report results and file locations to the user.
