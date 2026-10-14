# Promo video

A 25.8-second, 1920 × 1080, 60 fps promo (100 BPM; every time lives in `timeline.json`) for the promotional site.

## Build

Requires Google Chrome, ffmpeg, Python 3 with NumPy, and network access to Google Fonts (Inter).

```sh
python3 -I promo/music.py output/promo/music.wav   # music and sound effects
node promo/check-strings.mjs                       # UI copy matches src/i18n/page.ts
node promo/render.mjs                              # brand/promo/roleharbour-promo.mp4 and poster.png
```

`node promo/render.mjs --stills` writes one still per shot to `output/promo/stills/`; add `--at 4.4,6.4` for chosen moments. Before rendering, the script checks layout at the middle and end of every shot and fails if any text leaves the frame, a UI value overflows its box, Haru covers UI, or a frame is not a pure function of time.

To preview one moment in a browser, serve the repository root and open `promo/video.html?t=8.2`.

## Files

| File                        | Role                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `timeline.json`             | Shot times and sound cues, shared by the music and the picture                         |
| `video.html`, `.css`, `.js` | The ten shots; `renderAt(t)` draws time `t`                                            |
| `data/job.json`             | Invented advert; employer names are invented (no NZ match in a web search, 2026-10-11) |
| `data/reading.json`         | `localAnalysis()` output for that advert; regenerate it rather than editing it         |
| `data/strings.json`         | English UI strings the video shows, checked against `src/i18n/page.ts`                 |
| `music.py`                  | Synthesised music bed and effects, loudness-normalised to -16 LUFS                     |
| `render.mjs`, `lib/`        | Headless Chrome capture over the DevTools protocol, piped into ffmpeg                  |

To regenerate `data/reading.json` after the engine changes, run `localAnalysis(job.title, job.body)` and `experienceSummary(reading.prep)` with an English UI language and write `{ reading, experience }`. If the new output no longer supports a shot, change the advert, not the UI.

The employer badges in shots 5 and 8 depict the extension's real labels; the video does not run employer matching.
