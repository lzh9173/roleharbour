# RoleHarbour brand

Haru the mascot, the extension icons' source art, the logo, the README banner and the promo video. The design and its decisions are in [`docs/superpowers/specs/2026-10-11-brand-and-promo-design.md`](../docs/superpowers/specs/2026-10-11-brand-and-promo-design.md).

![RoleHarbour lockup](logo/lockup@2x.png)

## Palette

| Name       | Hex       | Use                                    |
| ---------- | --------- | -------------------------------------- |
| Navy       | `#051a49` | Type, outlines, Haru's uniform         |
| Amber      | `#F5B841` | The one accent: highlighter, lamp, dot |
| Sky        | `#CFE8FF` | Icon tiles, halo behind Haru           |
| Background | `#F7F8FA` | Banner and video background            |
| Text       | `#2e3849` | Body copy                              |

Navy and text are the extension's own UI colours, which follow SEEK's palette so the in-page panel sits naturally on SEEK; amber and sky are RoleHarbour's own. No SEEK logo, URL or signature pink is used. Type is Inter (SIL Open Font License), loaded from Google Fonts when the banner, lockup and video are rendered.

## Files

| Path                          | Content                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `haru/`                       | Haru's character sheet and transparent poses and expressions; see [`haru/README.md`](haru/README.md) |
| `logo/crest.svg`              | Lighthouse sticker: white sticker border, navy-outlined sky disc, lighthouse, sea, sparkles          |
| `logo/lockup.png`, `@2x.png`  | Sticker and "RoleHarbour" in Inter ExtraBold, transparent background                                 |
| `logo/lockup.html`            | Source of the lockup                                                                                 |
| `banner.png`, `banner.html`   | README banner, 1280 × 640, also the size of a GitHub social preview                                  |
| `promo/roleharbour-promo.mp4` | Promo video: 25.8 s, 1920 × 1080, 60 fps, with music                                                 |
| `promo/poster.png`            | The video's end card, used as its thumbnail                                                          |
| `scripts/`                    | `extract_haru.py` cuts Haru out of the sheet; `render-brand.mjs` renders the lockup and banner       |

The extension icons in `public/icon/` are Haru's smiling face on a sky tile: the whole head at 48 and 128 px, and eyes, fringe and beret inside a sky rim at 16 and 32 px so the toolbar icon stays legible on light and dark toolbars.

## Rebuild

Run from the repository root. Rendering needs Google Chrome and network access to Google Fonts; the video also needs ffmpeg and Python 3 with NumPy.

```sh
python3 -I brand/scripts/extract_haru.py brand/haru/source/haru-sheet-v3.png brand/haru
node --experimental-strip-types scripts/icons.ts
node brand/scripts/render-brand.mjs
python3 -I promo/music.py output/promo/music.wav
node promo/render.mjs
```

The video's source and checks are described in [`promo/README.md`](../promo/README.md).

## Usage

- Haru is AI-generated (Figma AI, `gemini-3.1-flash-image`). In many jurisdictions AI-generated images are not protected by copyright.
- Keep Haru wholesome and modestly dressed, and never show her or the logo endorsing SEEK, Immigration New Zealand or any employer.
- The job ad and employer results in the video are illustrative; the end card says so.
