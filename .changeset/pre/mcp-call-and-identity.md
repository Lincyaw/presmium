---
"@lincyaw/mcp": patch
"@lincyaw/workspace": patch
"@lincyaw/web": patch
---

`presmium mcp tools` and `presmium mcp call <tool> [<JSON arguments>] [--out <dir>]` use the MCP tools of the Presmium service running for the current directory from the command line: the result is written to stdout as JSON, and the pictures of `capture_slides`, `capture_reading` and `capture_overview` are saved as PNG files with `--out`. The saves of a local `presmium serve` or Presmium Studio are now committed with the repository's configured git `user.name` and `user.email` as their author (still `local author <local@presmium.invalid>` when git has none). A workspace document's slides publish the workspace's `site.params.logo` relative to `presmium.workspace.yaml` instead of warning that the file does not exist. Releases set `latest` with `node scripts/release-latest.mjs`, which waits until npm lists every public package's new version.
