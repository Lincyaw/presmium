"""Draws the demo figure of the paper-figure piece: a made-up two-panel results figure in the style of a paper's,
saved as a PDF whose text is real text, so every word has a box. `../../tools/figure.py` crops it into demo.png
and the word map demo.json, as it would crop a figure from a paper's arXiv source.

Run from this folder: the first line writes demo.pdf and prints the numbers the gallery document's marks use, the
second lists every word's box (how the crop was chosen), the third writes demo.png and demo.json.

    uv run --no-project --with matplotlib python -I demo-figure.py
    uv run --no-project --with pymupdf python -I ../../tools/figure.py demo.pdf /tmp/demo-full.png --words
    uv run --no-project --with pymupdf python -I ../../tools/figure.py demo.pdf demo.png --crop 4,4,514,190

The data are synthetic: a Chinchilla-style loss L(N, D) = E + A / N^a + B / D^b with C = 6 N D for four model sizes,
their lower envelope (the compute-optimal frontier), and an accuracy that falls with the loss. The figure stands in
for a paper's figure, which a document crops from the paper's own source instead.
"""
from pathlib import Path

import matplotlib

matplotlib.use("pdf")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.ticker import FixedLocator, NullLocator

HERE = Path(__file__).resolve().parent
plt.rcParams.update({"pdf.fonttype": 42, "font.size": 8, "axes.titlesize": 8.5, "axes.linewidth": 0.6,
                     "xtick.major.width": 0.6, "ytick.major.width": 0.6})

E, A, ALPHA, B, BETA = 1.69, 406.4, 0.34, 410.7, 0.28
SIZES = [(7e7, "70M"), (1.6e8, "160M"), (4.1e8, "410M"), (1e9, "1B")]
COLOURS = ["#9ecae1", "#6baed6", "#3182bd", "#08519c"]


def loss(n, c):
    return E + A / n ** ALPHA + B / (c / (6 * n)) ** BETA


def frontier(c):
    n = np.logspace(6, 12, 4000)
    return loss(n, c).min()


c = np.logspace(18, 22, 200)
fig, (ax, bx) = plt.subplots(1, 2, figsize=(7.2, 2.7), gridspec_kw={"width_ratios": [1.25, 1]})

for (n, name), colour in zip(SIZES, COLOURS):
    ax.plot(c, loss(n, c), color=colour, lw=1.3, label=name)
ax.plot(c, [frontier(v) for v in c], color="black", lw=1.0, ls="--", label="frontier")
ax.set_xscale("log")
ax.xaxis.set_major_locator(FixedLocator([1e18, 1e19, 1e20, 1e21, 1e22]))
ax.xaxis.set_minor_locator(NullLocator())
ax.set_xticklabels(["1e18", "1e19", "1e20", "1e21", "1e22"])
ax.set_xlim(1e18, 1e22)
ax.set_ylim(2.0, 4.0)
ax.set_yticks([2.0, 2.5, 3.0, 3.5, 4.0])
ax.set_xlabel("Training compute (FLOPs)")
ax.set_ylabel("Validation loss")
ax.set_title("(a) Loss vs. compute", loc="left")
ax.legend(frameon=False, fontsize=7, handlelength=1.6, loc="upper right")

for (n, name), colour in zip(SIZES, COLOURS):
    pts = np.array([loss(n, v) for v in [1e19, 1e20, 1e21, 1e22]])
    acc = 0.25 + 0.6 / (1 + np.exp(9 * (pts - 2.55)))
    bx.scatter(pts, acc, s=14, color=colour, zorder=3)
bx.axhline(0.25, color="0.45", lw=0.8, ls=":")
bx.text(3.36, 0.27, "chance", fontsize=7, color="0.35", ha="left")
bx.set_xlim(3.4, 2.1)
bx.set_xticks([3.2, 2.8, 2.4])
bx.set_ylim(0.15, 0.9)
bx.set_yticks([0.25, 0.5, 0.75])
bx.set_yticklabels(["25%", "50%", "75%"])
bx.set_xlabel("Validation loss")
bx.set_ylabel("Accuracy")
bx.set_title("(b) Accuracy vs. loss", loc="left")

for a in (ax, bx):
    a.spines[["top", "right"]].set_visible(False)
fig.tight_layout(w_pad=2.5)
fig.savefig(HERE / "demo.pdf", metadata={"CreationDate": None})  # the same bytes on every run

# The numbers the gallery document's marks use, and where matplotlib put them (in PDF points, origin top left), to
# compare with the axis transform a scene derives from the tick labels of the word map.
height = fig.get_size_inches()[1] * 72
for x, y in [(v, frontier(v)) for v in [1e18, 1e19, 1e20, 1e21, 1e22]]:
    px, py = ax.transData.transform((x, y)) * 72 / fig.dpi
    print(f"frontier({x:.0e}) = {y:.3f}  at ({px:.2f}, {height - py:.2f}) pt")
(x0, y0), (x1, y1) = ax.transData.transform([(1e18, 2.0), (1e22, 4.0)]) * 72 / fig.dpi
print(f"panel (a) plot box: x {x0:.2f}..{x1:.2f} pt, y {height - y1:.2f}..{height - y0:.2f} pt")
print(f"wrote {HERE / 'demo.pdf'}")
