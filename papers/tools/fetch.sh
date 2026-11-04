#!/usr/bin/env bash
# Fetch a paper's arXiv source for a film: the LaTeX and its figures, previews of every figure, and the list of
# figures with their captions, so the author can choose what to crop (tools/figure.py).
#
#   tools/fetch.sh <arxiv-id> <slug>
#   tools/fetch.sh 2611.02270 hinted-scaling-laws
#
# Writes papers/.cache/<id>/: source/ (the unpacked e-print), abstract.html, previews/<figure>.png. The source is
# untrusted data: it is only unpacked and read, never built or run. A GitHub repository the abstract page or the
# source mentions is printed, not cloned: clone it into .cache/<id>/repo yourself when the film needs its data.
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "usage: tools/fetch.sh <arxiv-id> <slug>" >&2
  exit 2
fi
id=$1 slug=$2
here=$(cd "$(dirname "$0")/.." && pwd)
cache=$here/.cache/$id
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
mkdir -p "$cache/source" "$cache/previews"

echo "downloading https://arxiv.org/e-print/$id"
curl -sSfL -A "$ua" -o "$cache/e-print" "https://arxiv.org/e-print/$id"
curl -sSfL -A "$ua" -o "$cache/abstract.html" "https://arxiv.org/abs/$id" || true

# The e-print is a gzipped tar of the LaTeX source, a single gzipped .tex, or a PDF when no source was submitted.
kind=$(file -b "$cache/e-print")
case $kind in
  gzip*)
    if tar -tzf "$cache/e-print" >/dev/null 2>&1; then
      tar -xzf "$cache/e-print" -C "$cache/source" --no-same-owner --no-same-permissions
    else
      gunzip -c "$cache/e-print" > "$cache/source/main.tex"
    fi ;;
  *tar*) tar -xf "$cache/e-print" -C "$cache/source" --no-same-owner --no-same-permissions ;;
  PDF*) cp "$cache/e-print" "$cache/source/paper.pdf"; echo "arXiv has no LaTeX source for $id, only the PDF" ;;
  *) echo "unexpected e-print: $kind" >&2; exit 1 ;;
esac
echo "source in $cache/source ($(find "$cache/source" -name '*.tex' | wc -l) .tex files)"

# Repositories named on the abstract page or in the source.
repos=$( { grep -rhoE 'github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+' "$cache/source" --include='*.tex' 2>/dev/null || true
  grep -hoE 'github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+' "$cache/abstract.html" 2>/dev/null || true; } \
  | sed -E 's/[.}]+$//' | grep -viE 'github\.com/(arxiv|login|features)' | sort -u)
if [ -n "$repos" ]; then
  echo; echo "repositories mentioned:"; echo "$repos" | sed 's/^/  https:\/\//'
  echo "  (clone the one with the paper's data into $cache/repo)"
fi

# Every \includegraphics with the caption of its figure, and a preview of each figure file.
echo; echo "figures (file: caption):"
python3 -I - "$cache/source" <<'PY'
import re, sys
from pathlib import Path
root = Path(sys.argv[1])
seen = []
for tex in sorted(root.rglob('*.tex')):
    text = tex.read_text(errors='replace')
    for env in re.finditer(r'\\begin\{(figure\*?|wrapfigure|table\*?)\}(.*?)\\end\{\1\}', text, re.S):
        body = env.group(2)
        cap = re.search(r'\\caption\{', body)
        caption = ''
        if cap:
            depth, i = 1, cap.end()
            while i < len(body) and depth:
                depth += {'{': 1, '}': -1}.get(body[i], 0); i += 1
            caption = re.sub(r'\s+', ' ', body[cap.end():i - 1]).strip()
        for g in re.finditer(r'\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}', body):
            seen.append(g.group(1))
            print(f"  {g.group(1)}  [{tex.relative_to(root)}]\n      {caption[:220]}{'…' if len(caption) > 220 else ''}")
Path(root.parent / 'figures.txt').write_text('\n'.join(seen) + '\n')
PY

n=0
while IFS= read -r ref; do
  [ -z "$ref" ] && continue
  file=""
  for cand in "$cache/source/$ref" "$cache/source/$ref.pdf" "$cache/source/$ref.png" "$cache/source/$ref.jpg"; do
    [ -f "$cand" ] && { file=$cand; break; }
  done
  [ -z "$file" ] && { echo "  not found: $ref" >&2; continue; }
  name=$(basename "${file%.*}")
  case $file in
    *.pdf) uv run --no-project --with pymupdf python -I "$here/tools/figure.py" "$file" "$cache/previews/$name.png" --width 1400 >/dev/null 2>&1 \
             || echo "  could not render $file" >&2 ;;
    *) cp "$file" "$cache/previews/$name.${file##*.}" ;;
  esac
  n=$((n + 1))
done < "$cache/figures.txt"
echo; echo "$n previews in $cache/previews (each PDF also has its word map next to it, for choosing a crop)"
echo "next: node tools/new-paper.mjs $slug --arxiv $id …   then crop with tools/figure.py <figure.pdf> $slug/figures/<name>.png --crop x0,y0,x1,y1"
