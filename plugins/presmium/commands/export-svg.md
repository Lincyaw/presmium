---
description: Export every step-built SVG figure of a Presmium document as SVG files
argument-hint: "[document directory] [--output <dir>] [--dark] [--range <1,3-5>]"
---

Export the document's SVG figures as the `presmium-figure` skill describes: each `<svg data-figure="name">` at each step that changes it becomes `<name>-<n>.svg`. Read that skill first if the document has no figure yet.

1. In the document's project, make sure `@lincyaw/addon-publish` and `playwright-chromium` are installed (`pnpm add -D @lincyaw/addon-publish playwright-chromium`, then `pnpm exec playwright install chromium`).
2. Run `pnpm exec presmium-export --format svg $ARGUMENTS` in the document directory, with `--output` set to a folder of its own (every `.svg` already in it is removed first; default folder name: `figures`).
3. Report the files written. Open two or three of them on their own and check that each picture is complete and its text fits.
