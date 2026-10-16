#!/usr/bin/env bash
# Download the Markdown docs of the host frameworks and integrated tools into vendor/docs (not committed).
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
# DeepSeek Harness: user and architecture docs, CLI reference, and every package README (MCP client, SDK, ACP, API, bundles, approvals, LLM, sessions).
fetch_paths deepseek-ai/deepseek-harness dsh-v0.2.1-alpha.4 dsh \
  '/README.md' '/SAFETY.md' '/CONTRIBUTING.md' '/docs/' '!/docs/persistence-changes/' '!/docs/postmortem/' \
  '/apps/cli/*.md' '/apps/cli/reference/' '/packages/*/README.md' '/packages/*/*/README.md' \
  '/packages/preset/agent-preset/skills/'
# MCP TypeScript SDK: guides (servers, serving over stdio and Streamable HTTP, clients) and package READMEs.
fetch_paths modelcontextprotocol/typescript-sdk v2.3.1 mcp \
  '/README.md' '/VERSIONING.md' '/docs/' '/packages/*/README.md' '/packages/middleware/*/README.md'
# deltabox-lite: review/rollback sessions and the process sandbox (CLI, Node binding, policies, platform notes).
fetch_paths delta-box/deltabox-lite v0.1.1 deltabox '/README.md' '/CHANGELOG.md' '/docs/'
# dsh-deltabox has no public repository; its README is only in the npm package (kept for the rejected option A).
curl -fsSL https://unpkg.com/dsh-deltabox@0.1.2/README.md -o "$dest/deltabox/dsh-deltabox.md"
echo "docs written to $dest"
