#!/usr/bin/env python3
"""Crop one region of a figure PDF (from a paper's arXiv source) into a PNG for a scene, with a map of every word in it.

    uv run --no-project --with pymupdf python -I figure.py <figure.pdf> <out.png> \
        [--crop x0,y0,x1,y1] [--width 2400] [--page 0] [--words]

`--words` prints the page size and the box of every word (in the region, or on the whole page without `--crop`);
that is how a crop is chosen. `--crop` is in the PDF's points, origin top left. The PNG is `--width` pixels wide
(2400 is the widest a Presmium build publishes). Beside it the script writes `<out>.json`, the word map:

    { "source": "<figure.pdf>", "crop": [x0, y0, x1, y1], "size": [px wide, px high], "aspect": width / height,
      "words": [{ "text": "1e21", "x": 0.61, "y": 0.83, "w": 0.04, "h": 0.05 }, ...] }

Each word's box is in fractions of the crop (left, top, width, height), so a scene places a mark on a tick label or a
legend entry without guessing pixels, and two tick labels of an axis give that axis's transform from data values to
the figure (the label's centre is its tick). A word cut by the crop's edge is kept, with a box reaching past 0 or 1.
Figures whose text was converted to outlines have no words; ask for the figure's source or use another figure.
"""
import argparse
import json
from pathlib import Path

import pymupdf

ap = argparse.ArgumentParser()
ap.add_argument("pdf")
ap.add_argument("out")
ap.add_argument("--crop")
ap.add_argument("--width", type=int, default=2400)
ap.add_argument("--words", action="store_true")
ap.add_argument("--page", type=int, default=0)
a = ap.parse_args()

page = pymupdf.open(a.pdf)[a.page]
full = page.rect
clip = pymupdf.Rect(*map(float, a.crop.split(","))) if a.crop else full
words = [w for w in page.get_text("words") if pymupdf.Rect(w[:4]).intersects(clip)]
if a.words:
    print(f"page {full.width:.1f} x {full.height:.1f} pt")
    for w in words:
        print(f"{w[0]:7.1f} {w[1]:7.1f} {w[2]:7.1f} {w[3]:7.1f}  {w[4]}")
zoom = a.width / clip.width
pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=clip, alpha=False)
Path(a.out).parent.mkdir(parents=True, exist_ok=True)
pix.save(a.out)
fx = lambda x: round((x - clip.x0) / clip.width, 5)
fy = lambda y: round((y - clip.y0) / clip.height, 5)
info = {
    "source": Path(a.pdf).name, "crop": [round(v, 2) for v in clip], "size": [pix.width, pix.height],
    "aspect": round(clip.width / clip.height, 5),
    "words": [{"text": w[4], "x": fx(w[0]), "y": fy(w[1]), "w": round((w[2] - w[0]) / clip.width, 5), "h": round((w[3] - w[1]) / clip.height, 5)} for w in words],
}
Path(a.out).with_suffix(".json").write_text(json.dumps(info, ensure_ascii=False, indent=1) + "\n")
print(f"wrote {a.out} ({pix.width} x {pix.height}) and its word map")
