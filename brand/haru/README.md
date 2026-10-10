# Haru

Haru is RoleHarbour's mascot: a young woman in a navy preppy academy uniform who reads job ads with a yellow highlighter.

## Files

| File                       | Content                                                      |
| -------------------------- | ------------------------------------------------------------ |
| `source/haru-sheet-v3.png` | Original character sheet, 1376 × 768                         |
| `full-front.png`           | Full body, front, holding the highlighter                    |
| `full-pointing.png`        | Full body, three-quarter view, pointing with the highlighter |
| `face-smile.png`           | Gentle smile (extension icon source)                         |
| `face-closed-eyes.png`     | Closed-eye smile                                             |
| `face-closed-eyes-2.png`   | Closed-eye smile, second take                                |
| `face-surprised.png`       | Surprised                                                    |
| `face-thinking.png`        | Thinking, finger on chin                                     |
| `face-thumbs-up.png`       | Thumbs up                                                    |
| `face-wave.png`            | Waving hello                                                 |
| `face-determined.png`      | Determined                                                   |
| `face-laughing.png`        | Laughing                                                     |

The transparent PNGs are cut from the sheet by `brand/scripts/extract_haru.py`:

```sh
python3 -I brand/scripts/extract_haru.py brand/haru/source/haru-sheet-v3.png brand/haru
```

## Provenance

Generated on 2026-10-11 with Figma AI (`gemini-3.1-flash-image`) from this prompt:

> Original anime character design reference sheet in a clean, modern Japanese anime cel-shaded illustration style, crisp dark line art, soft two-tone shading, bright and friendly. Flat plain pure white background, no scenery, no text, no letters, no logos, no watermark, no labels.
>
> Character "Haru": a cheerful, reliable young woman, wholesome and modestly dressed, wearing a Western British-style preppy academy uniform. Face and hair: shoulder-length dark navy-black hair with soft bangs, a small amber star-shaped hair clip on her left side, large warm amber eyes, gentle smile.
>
> Outfit: a tailored navy blue (#051a49) single-breasted blazer with thin gold piping on the lapels and a small embroidered gold lighthouse crest on the left breast pocket; a crisp white collared shirt; a necktie with diagonal amber-yellow (#F5B841) and navy stripes; a knee-length pleated tartan skirt in navy, teal and amber; navy knee-high socks; brown leather penny loafers. A navy beret worn slightly tilted, with a small gold lighthouse pin. She holds a big yellow highlighter marker pen.
>
> Layout of the sheet, all the same character with a perfectly consistent design, evenly spaced, nothing overlapping, every figure fully inside the frame with white space around it: left, full-body front view, standing relaxed, smiling, holding the highlighter at her side; middle, full-body three-quarter view, cheerfully pointing up and to the side with the highlighter in that same hand as if presenting something, other hand relaxed and empty; right, a neat 3 by 3 grid of head-and-shoulders expressions: gentle smile, closed-eye happy smile, surprised, wink, thinking with finger on chin, thumbs up, waving hello, determined, laughing.

The model drew a closed-eye smile where the prompt asked for a wink.

The art is AI-generated. In many jurisdictions AI-generated images are not protected by copyright, so others may be able to reuse Haru.

## Usage

- Keep Haru wholesome and modestly dressed.
- Do not show Haru endorsing SEEK, Immigration New Zealand or any employer, or next to their logos.
- Do not edit her design by hand; generate a new sheet and update this file instead.
