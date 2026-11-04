#!/usr/bin/env python3
"""Tile pictures (captures, video frames) into one contact sheet, each labelled with its file name.

    uv run --no-project --with pillow python -I tools/sheet.py <out.png> <in.png> [...] [--cols 2] [--width 720]
"""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("images", nargs="+")
ap.add_argument("--cols", type=int, default=2)
ap.add_argument("--width", type=int, default=720)
a = ap.parse_args()
tiles = []
for f in a.images:
    im = Image.open(f).convert("RGB")
    im = im.resize((a.width, round(im.height * a.width / im.width)))
    ImageDraw.Draw(im).rectangle([0, 0, 7 * len(Path(f).name) + 8, 16], fill=(255, 235, 0))
    ImageDraw.Draw(im).text((4, 2), Path(f).name, fill=(0, 0, 0))
    tiles.append(im)
h = max(t.height for t in tiles)
rows = (len(tiles) + a.cols - 1) // a.cols
sheet = Image.new("RGB", (a.width * a.cols + 4 * (a.cols - 1), h * rows + 4 * (rows - 1)), (120, 120, 120))
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % a.cols) * (a.width + 4), (i // a.cols) * (h + 4)))
sheet.save(a.out)
print(f"wrote {a.out} ({sheet.width} x {sheet.height})")
