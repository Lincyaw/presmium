#!/usr/bin/env bash
# Download the Markdown docs of the host frameworks into vendor/docs (not committed).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/vendor/docs"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fetch() { # repo tag subdir name
  git clone -q --depth 1 --filter=blob:none --sparse --branch "$2" "https://github.com/$1.git" "$tmp/$4"
  git -C "$tmp/$4" sparse-checkout set "$3"
  rm -rf "$dest/$4" && mkdir -p "$dest/$4"
  (cd "$tmp/$4/$3" && find . -name '*.md' | cpio -pdm "$dest/$4" 2>/dev/null)
}

fetch slidevjs/slidev v53.0.0 docs slidev
fetch vuejs/vitepress v1.6.4 docs/en vitepress
echo "docs written to $dest"
