# @lincyaw/addon-guide

Guidance: a simulated cursor, spotlights and hints that follow the steps.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
pnpm add -D @lincyaw/addon-guide
```

List it in the headmatter of the documents that use it:

```yaml
plugins:
  - '@lincyaw/addon-guide'
```

It is a Presmium plugin: its components work on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- `{cursor}`: a cursor that moves and clicks over the page, step by step.
- `{spotlight}` and `{hint}`: spotlight a block or lines of code, and show a hint.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/document.md) (Chinese): every directive with its options and an example

## License

Apache-2.0
