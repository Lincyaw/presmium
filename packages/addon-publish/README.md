# @lincyaw/addon-publish

Publishing: offline sites, a high-contrast switch, export of the slides as PDF, PowerPoint and pictures (`presmium-export`) and visual diffs (`presmium-diff`).

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
pnpm add -D @lincyaw/addon-publish
```

List it in the headmatter of the documents that use it:

```yaml
plugins:
  - '@lincyaw/addon-publish'
```

It is a Presmium plugin: its components work on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- A service worker that keeps built sites readable offline (`presmium.publish.offline: false` turns it off).
- A high-contrast switch, and remote images localized into `.presmium/assets/`.
- `presmium-export`: the slides printed in Chromium as PDF, PowerPoint (a picture of each slide, the narration as the speaker notes) or PNG (`--format pdf|pptx|png`, `--output`, `--with-clicks`, `--range`, `--dark`, `--timeout`, `--json`); `presmium-diff`: visual differences between two commits, in the slides and the web form. Both run Chromium from `playwright-chromium`, installed in the document's project (`pnpm add -D playwright-chromium`, then `pnpm exec playwright install chromium`).

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/directives.md) (Chinese): every directive with its options and an example

## License

Apache-2.0
