---
description: Start a new Presmium document, workspace or plugin project in a directory
argument-hint: "[directory] [--type document|workspace|site|plugin] [--title <text>]"
allowed-tools: Bash(pnpm --config.minimum-release-age-exclude=*)
---

Create a new Presmium project with `pnpm --config.minimum-release-age-exclude='@lincyaw/*' --config.minimum-release-age-exclude=create-presmium dlx @lincyaw/presmium new $ARGUMENTS`. When no `--type` is given, ask whether the person wants a single document, a workspace of several documents, a website or a plugin, and pass `--title` when they named one. Run it non-interactively, then tell the person what was created and the next step: write the content (the `presmium-author` skill), add animation (`presmium-animate`) or draw SVG figures (`presmium-figure`), and preview with `/presmium:studio`.

The two `--config.minimum-release-age-exclude` options let pnpm take Presmium's newest release, which its default `minimumReleaseAge` would hold back for a day.
