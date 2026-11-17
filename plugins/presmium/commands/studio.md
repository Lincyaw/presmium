---
description: Open the Presmium Studio for a document or workspace and give the person its address
argument-hint: "[directory] [--port <n>]"
allowed-tools: Bash(pnpm --config.minimum-release-age-exclude=*)
---

Start the Presmium Studio in the background with `pnpm --config.minimum-release-age-exclude='@lincyaw/*' --config.minimum-release-age-exclude=create-presmium dlx @lincyaw/presmium studio $ARGUMENTS` (default: the current directory). It prints one address: wait for it and give it to the person to open in the browser. Editing and preview do not need a model. Stop it when the person asks.

The two `--config.minimum-release-age-exclude` options let pnpm take Presmium's newest release, which its default `minimumReleaseAge` would hold back for a day.
