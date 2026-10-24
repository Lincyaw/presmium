# @lincyaw/addon-publish

Publishing: offline sites, a high-contrast switch, PDF and image export (`presmium-export`) and visual diffs (`presmium-diff`).

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

It is a Presmium plugin and a Slidev addon: its components work on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- A service worker that keeps built sites readable offline (`presmium.publish.offline: false` turns it off).
- A high-contrast switch, and remote images localized into `.presmium/assets/`.
- `presmium-export`: PDF and PNG of the slides; `presmium-diff`: visual differences between two builds.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/directives.md) (Chinese): every directive with its options and an example

## License

Apache-2.0
