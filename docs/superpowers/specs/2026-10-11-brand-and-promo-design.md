# RoleHarbour brand and promo video: design

Date: 2026-10-11 · Status: awaiting review

## Goal

Give RoleHarbour a recognisable identity built around an anime mascot, Haru, and a short promotional video for the GitHub README and Release pages.

Success means:

- The extension icon is recognisably Haru at 16, 32, 48 and 128 px on light and dark Chrome toolbars.
- A 25.8-second, 16:9 video in an Apple-style app/SaaS manner (light theme, hard cuts on the beat, kinetic typography) shows what the extension does without claiming anything it does not do.
- Everything except the AI-generated character art is reproducible from source in this repository.

## Decisions made in conversation

| Topic           | Decision                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Video placement | GitHub README and Release page; 16:9, English copy                                                                                      |
| Sound           | Synthesised music bed and sound effects                                                                                                 |
| Style           | Light theme, Apple-style, dramatic cuts, kinetic typography; first cut 14 s, then slowed to 25.8 s on request so every shot can be read |
| Mascot          | Haru, a young woman in a Western preppy academy uniform; character sheet v3 is final                                                    |
| Character art   | Generated with Figma AI (`gemini-3.1-flash-image`) on the user's plan; everything else is drawn in code                                 |
| Extension icon  | Haru's smiling avatar at every size, including 16 and 32 px                                                                             |
| Lighthouse logo | Secondary mark for the wordmark lockup and the video                                                                                    |
| SEEK branding   | Never used. SEEK is named once, in end-card text. The job page in the video is a generic design with no SEEK URL                        |

## 1. Haru, the mascot

Source: `haru-sheet-v3.png`, 1376 × 768: front full body, three-quarter pointing pose and nine head-and-shoulders expressions. Defining details: shoulder-length navy-black hair, amber star hair clip on her left, amber eyes, navy beret with a gold lighthouse pin, navy blazer with gold piping and a lighthouse crest, amber-and-navy striped tie, navy/teal/amber tartan skirt, navy knee socks, brown loafers, yellow highlighter.

Assets are cut out by flood-filling the white background from the corners, eroding one pixel and feathering the edge (tested: clean edges, no halo). Each is saved as a transparent PNG under `brand/haru/`:

| File                   | Use                            |
| ---------------------- | ------------------------------ |
| `full-front.png`       | End card, README banner        |
| `full-pointing.png`    | Spare                          |
| `face-smile.png`       | Extension icon source          |
| `face-wave.png`        | Shot 4                         |
| `face-closed-eyes.png` | Shot 7                         |
| `face-*.png`           | Other seven expressions, spare |

`brand/haru/README.md` records the generator, model, date and the full prompt, and states that the art is AI-generated and may not be protected by copyright. Haru is never shown endorsing SEEK, INZ or any employer.

## 2. Logo system

Palette: navy `#051a49`, amber `#F5B841`, sky `#CFE8FF`, light background `#F7F8FA`, text `#2e3849`. These colours are not SEEK's.

- **Extension icon.** Haru's smiling face on a sky-blue rounded square (corner radius 23% of the side, matching the current icon). `scripts/icons.ts` composes the tile and `brand/haru/face-smile.png` with sharp for each size, replacing the hand-written SVG. The 16 and 32 px icons use a tighter crop (eyes, fringe and beret) so the face does not shrink to a dot. Output stays at `public/icon/{16,32,48,128}.png`, so the manifest does not change.
- **Lighthouse sticker.** `brand/logo/crest.svg`, chosen on 2026-10-11 over a shield, line, seal, highlighter and academy-crest style: a round anime-style sticker with a white border and soft shadow, a navy-outlined sky disc, a white lighthouse with coral bands and roof, an amber lamp, pale-amber beams, a two-tone blue sea with a white wave crest and three amber sparkles. Navy outlines keep it legible at 20 px on light and dark backgrounds.
- **Wordmark lockup.** Sticker plus "RoleHarbour" in Inter ExtraBold, tracking −0.02 em, navy. Built from `brand/logo/lockup.html` and rendered by headless Chrome to `lockup.png` and `lockup@2x.png` with transparency.
- **README banner.** `brand/banner.png`, 1280 × 640 (also the GitHub social-preview size): light background, lockup and the tagline "Job ads, read for you." on the left, Haru full body on the right. Built from `brand/banner.html`.

## 3. Promo video

### Format

1920 × 1080, 60 fps, 25.8 s (1548 frames). H.264 High, yuv420p, CRF 18, `+faststart`; AAC 192 kbit/s. Target under 10 MB, GitHub's upload limit for free accounts. Output: `brand/promo/roleharbour-promo.mp4` and a poster frame, `brand/promo/poster.png`, both kept in the repository at the user's request so the README can link to them. Intermediates (`music.wav`, stills) stay in the ignored `output/promo/`.

### Look

- Background `#F7F8FA`, surfaces white, type navy, one accent: amber highlighter.
- Inter 400 to 900, loaded from Google Fonts by the render page; the renderer waits for `document.fonts.ready` before the first frame.
- Words enter by sliding up from behind a mask line or slamming in with a 1.15 → 1.0 scale punch. Fast moves get a short CSS blur as motion blur.
- Cuts are hard and land on beats. Shots 5 and 8 enter with a whip pan and 3D perspective.
- Haru appears in three shots as a sticker-style pop (scale overshoot, slight rotation), never covering UI.

### Storyboard

100 BPM, so one beat is 0.6 s. Times are in seconds. All times live in `promo/timeline.json`; the music and the picture derive every cue from it.

| #   | Time      | Beats | On screen                                                                                                                                               | Motion                                                                      | Sound                                |
| --- | --------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| 1   | 0.0–1.8   | 1–3   | "Job ads."                                                                                                                                              | Slam in, scale punch                                                        | Filtered pluck, tick                 |
| 2   | 1.8–5.4   | 4–9   | Three fragments quoted from the advert, key words bold: "…**3+ years** of commercial…", "…Employer **Work Visa** for…", "…**React, Node.js, AWS** and…" | Three flash cuts of 1.2 s, text drifting up                                 | Ticks on each cut, riser starts      |
| 3   | 5.4–7.2   | 10–12 | "Long." "Messy." "Buried."                                                                                                                              | Word swap on eighth notes; "Buried." sinks and fades to 30 %                | Riser peaks                          |
| 4   | 7.2–9.6   | 13–16 | Crest, "Meet RoleHarbour.", Haru waving                                                                                                                 | Hard cut on the drop; crest spins in, words mask up, Haru pops bottom right | Impact hit, bass and drums enter     |
| 5   | 9.6–12.6  | 17–21 | Browser window with the job ad; RoleHarbour panel; caption "Read the ad. Instantly."                                                                    | Window whips in tilted, settles flat; fact tiles drop in on beats           | Whoosh, soft clicks                  |
| 6   | 12.6–16.2 | 22–27 | "Your checklist." and checklist chips                                                                                                                   | Macro zoom on the panel; chips pop every eighth note (0.3 s)                | Tick per chip                        |
| 7   | 16.2–18.6 | 28–31 | "Every answer. Its source." The ad sentence behind a visa verdict, highlighted; Haru, eyes closed smiling, top right                                    | Cursor hovers the verdict; amber marker sweeps the sentence left to right   | Marker swipe                         |
| 8   | 18.6–21.0 | 32–35 | "Employer? Checked." Two job cards with RoleHarbour employer badges: "Matched" and "Needs review"                                                       | Cards whip-pan in from the right; badges stamp                              | Two stamps                           |
| 9   | 21.0–22.8 | 36–38 | "100% on your device." then "No account. No uploads."                                                                                                   | Cloud icon struck out; type tightens                                        | Puff, filter sweep                   |
| 10  | 22.8–25.8 | 39–43 | Lockup, "Job ads, read for you.", "Chrome extension for SEEK NZ", Haru full body; fine print                                                            | Lockup and Haru settle; hold                                                | Final chord hit, reverb tail to 14.0 |

End-card fine print: "Illustrative job ad and employer results. Independent of SEEK and INZ."

### Truthfulness of the UI shots

- The job ad is invented and saved as `promo/data/job.json`: "Intermediate Software Developer" at an invented company in Wellington, with requirement bullets, nice-to-haves, a cover-letter request and a visa-sponsorship sentence. (An earlier draft of this spec asked for work-rights and residency sentences; the ad states sponsorship instead, so those two cells read "Not stated".) Company names are invented and must not be names of real NZ companies. Shot 2 quotes only text that appears in this ad.
- `promo/data/reading.json` holds the output of the real `localAnalysis()` for that ad, captured by a throwaway Vitest script that is deleted afterwards. The panel shows only values from this file, except the accredited-employer result (see below).
- Labels come from the English strings in `src/i18n/page.ts` (for example "Occupation reference", "Experience", "Visa support", "Existing work rights", "Citizenship / residency", "Matched", "Needs review"). Colours and radii come from `src/styles/tailwind.css` and `src/inpage/styles.ts`.
- The video does not run employer matching. The "Matched" and "Needs review" results in shots 5 and 8 are depictions with invented names; their labels are the real badge labels, and the fine print says the employer results are illustrative.
- If the engine's output for the draft ad does not support a shot (for example no visa verdict with a source sentence), the ad text is changed and the reading is regenerated. The UI is never edited by hand to fit the storyboard.

### Music

`promo/music.py` (Python standard library and NumPy) writes a 25.8 s, 48 kHz stereo WAV:

- 0–7.2 s: filtered plucked arpeggio and hi-hat ticks, with a noise riser from the first word swap to the drop and a breath of silence just before it.
- 7.2 s (the drop): impact, then kick on every beat, claps on 2 and 4, sub-bass, and electric-piano chords cycling Fmaj7, G7, Em7, Am7 one bar (2.4 s) each, with a pluck arpeggio on top.
- The last half bar before the final hit splits Fmaj7 and G; claps double and a riser climbs over the last four beats, and the kick drops out for the final beat.
- 22.8 s: C major hit with a synthetic reverb tail ringing to the end.
- Effects on the cues in `timeline.json`: whooshes, ticks, marker swipe, stamps, puff.

Mixed to −16 LUFS integrated with ffmpeg `loudnorm` at −2.5 dBTP, so the AAC-encoded video stays under −1.5 dBTP.

### Rendering pipeline

- `promo/video.html`: every shot is a function of time. `window.renderAt(seconds)` sets all styles deterministically; there are no CSS animations or timers. Assets load from `brand/` and `promo/data/`.
- `promo/render.mjs` (Node, no new dependencies): starts the installed Chrome with `--headless=new` and a debugging port, talks to it over the DevTools protocol using Node's built-in `WebSocket`, sets a 1920 × 1080 viewport, and for each frame calls `renderAt(frame / 60)` then `Page.captureScreenshot`. PNG frames are piped into ffmpeg, which also muxes the WAV.
- `promo/README.md` lists the commands, and a preview mode: open `video.html?t=8.2` to see one moment.

## 4. Repository changes

- New: `brand/` (Haru assets, logo, banner and their HTML sources) and `promo/` (video page, renderer, music script, data).
- Changed: `scripts/icons.ts` and `public/icon/*.png`.
- `promo/*.mjs` must pass `pnpm lint`, or `promo/` is added to the ESLint ignores if browser globals make that awkward. This spec must pass `pnpm format:check`.
- Not changed unless asked: the README text, the changelog, the version number, the Chrome Web Store assets.

## 5. Verification

- `pnpm build` succeeds and the built manifest still lists the four icons. The icons are checked by eye at actual size on light and dark toolbar mock-ups.
- `ffprobe` reports 1920 × 1080, 60 fps, 1548 frames, 25.8 s and AAC audio; the file is under 10 MB.
- A still at the middle of every shot is reviewed for clipping, overlap, legibility at 50 % scale and Haru's placement.
- Audio onsets of the impact, stamps and final hit fall within one frame of their cuts.
- Every value in the UI shots is traced back to `reading.json` or `src/i18n/page.ts`.
- `pnpm lint` and `pnpm format:check` pass.

## Out of scope

Chinese or vertical versions, a GIF, voice-over, Chrome Web Store promotional tiles, uploading the video to GitHub (the user does this) and editing the README to embed it.

## Risks

- The character art is 1376 × 768. Haru's full body is about 720 px tall, so the end card shows her at no more than 1.1×. A larger shot would need another generation and could drift from the sheet.
- Google Fonts must be reachable while rendering. If not, the renderer stops instead of falling back to another font.
- Synthesised audio is functional rather than produced. A licensed track can replace the WAV without other changes.
