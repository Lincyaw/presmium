---
description: Start a new Presmium document, workspace or plugin project in a directory
argument-hint: "[directory] [--type lecture|workspace|site|plugin] [--title <text>]"
allowed-tools: Bash(pnpm dlx @lincyaw/presmium new:*)
---

Create a new Presmium project with `pnpm dlx @lincyaw/presmium new $ARGUMENTS`. When no `--type` is given, ask whether the person wants a single lecture, a workspace of several documents, a website or a plugin, and pass `--title` when they named one. Run it non-interactively, then tell the person what was created and the next step: write the content (the `presmium-author` skill), add animation (`presmium-animate`) or draw SVG figures (`presmium-figure`), and preview with `/presmium:studio`.
