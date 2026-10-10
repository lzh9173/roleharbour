"""Cut Haru's poses and expressions out of the character sheet as transparent PNGs.

Usage: python3 -I brand/scripts/extract_haru.py brand/haru/source/haru-sheet-v3.png brand/haru

The sheet has a flat white background, two full-body poses on the left and a
3 x 3 grid of expressions on the right. Figures are found from the gaps in the
alpha mask, so the script needs no hand-measured coordinates.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

KEY = (255, 0, 255)
PAD = 4
FULL_BODY = ['full-front', 'full-pointing']
# Row-major order of the expression grid, as requested in the generation prompt.
FACES = [
    'face-smile', 'face-closed-eyes', 'face-surprised',
    'face-closed-eyes-2', 'face-thinking', 'face-thumbs-up',
    'face-wave', 'face-determined', 'face-laughing',
]


def cut_out(sheet: Image.Image) -> Image.Image:
    """Flood-fill the white background from the corners and turn it transparent."""
    marked = sheet.copy()
    w, h = sheet.size
    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(marked, corner, KEY, thresh=40)
    background = np.all(np.array(marked) == KEY, axis=-1)
    alpha = Image.fromarray(np.where(background, 0, 255).astype(np.uint8))
    # Erode one pixel to drop the anti-aliased white fringe, then feather the edge.
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    rgba = sheet.convert('RGBA')
    rgba.putalpha(alpha)
    return rgba


def runs(mask: np.ndarray) -> list[tuple[int, int]]:
    """Inclusive (start, end) index ranges where mask is true."""
    padded = np.concatenate([[False], mask, [False]])
    edges = np.flatnonzero(padded[1:] != padded[:-1])
    return [(int(s), int(e) - 1) for s, e in zip(edges[::2], edges[1::2])]


def figure_boxes(rgba: Image.Image) -> list[tuple[int, int, int, int]]:
    """Boxes of every figure, columns left to right and figures top to bottom."""
    solid = np.array(rgba)[..., 3] > 0
    boxes = []
    for x0, x1 in runs(solid.any(axis=0)):
        column = solid[:, x0 : x1 + 1]
        for y0, y1 in runs(column.any(axis=1)):
            xs = runs(column[y0 : y1 + 1].any(axis=0))
            boxes.append((x0 + xs[0][0], y0, x0 + xs[-1][1] + 1, y1 + 1))
    return boxes


def main() -> None:
    source, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    rgba = cut_out(Image.open(source).convert('RGB'))
    boxes = figure_boxes(rgba)
    if len(boxes) != len(FULL_BODY) + len(FACES):
        raise SystemExit(f'expected {len(FULL_BODY) + len(FACES)} figures, found {len(boxes)}')
    bodies, grid = boxes[:2], boxes[2:]
    # The grid was found column by column; reorder it to the prompt's row-major order.
    faces = sorted(grid, key=lambda b: (round(b[1] / 100), b[0]))
    w, h = rgba.size
    for name, (x0, y0, x1, y1) in zip(FULL_BODY + FACES, bodies + faces):
        box = (max(x0 - PAD, 0), max(y0 - PAD, 0), min(x1 + PAD, w), min(y1 + PAD, h))
        rgba.crop(box).save(out_dir / f'{name}.png', optimize=True)
        print(f'{name}.png {box[2] - box[0]}x{box[3] - box[1]}')


if __name__ == '__main__':
    main()
