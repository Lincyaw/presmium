#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/vendor/docs"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fetch() { # repo tag subdir name
  git -c advice.detachedHead=false clone -q --depth 1 --filter=blob:none --sparse --branch "$2" "https://github.com/$1.git" "$tmp/$4"
  git -C "$tmp/$4" sparse-checkout set "$3"
  rm -rf "$dest/$4" && mkdir -p "$dest/$4"
  (cd "$tmp/$4/$3" && find . -name '*.md' | cpio -pdm "$dest/$4" 2>/dev/null)
}

fetch_paths() { # repo tag name pattern... (docs kept in several places; repo layout preserved, English only)
  local repo="$1" tag="$2" name="$3"; shift 3
  git -c advice.detachedHead=false clone -q --depth 1 --filter=blob:none --sparse --branch "$tag" "https://github.com/$repo.git" "$tmp/$name"
  git -C "$tmp/$name" sparse-checkout set --no-cone "$@"
  rm -rf "$dest/$name" && mkdir -p "$dest/$name"
  (cd "$tmp/$name" && find . -path ./.git -prune -o -name '*.md' ! -name '*.zh.md' -print | cpio -pdm "$dest/$name" 2>/dev/null)
}

fetch slidevjs/slidev v53.0.0 docs slidev
fetch vuejs/vitepress v1.6.4 docs/en vitepress
fetch_paths deepseek-ai/deepseek-harness dsh-v0.2.1-alpha.4 dsh \
  '/README.md' '/SAFETY.md' '/CONTRIBUTING.md' '/docs/' '!/docs/persistence-changes/' '!/docs/postmortem/' \
  '/apps/cli/*.md' '/apps/cli/reference/' '/packages/*/README.md' '/packages/*/*/README.md' \
  '/packages/preset/agent-preset/skills/'
fetch_paths modelcontextprotocol/typescript-sdk v2.3.1 mcp \
  '/README.md' '/VERSIONING.md' '/docs/' '/packages/*/README.md' '/packages/middleware/*/README.md'
echo "docs written to $dest"
