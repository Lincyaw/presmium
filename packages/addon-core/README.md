# @lincyaw/slidev-addon-core

The host adapter of the slides form: it gives plugin components the step state and services of Slidev through `@lincyaw/host`, starts the plugins of the document, and writes what classrooms follow into each slide.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
pnpm add -D @lincyaw/slidev-addon-core
```

List it in the headmatter of the documents that use it:

```yaml
plugins:
  - '@lincyaw/slidev-addon-core'
```

It is a Presmium plugin and a Slidev addon: its components work on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- The Slidev side of `@lincyaw/host` (steps, navigation, shared state, the toolbar), so plugin components render in the slides.

List it in every document that builds slides.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/directives.md) (Chinese): every directive with its options and an example

## License

Apache-2.0
