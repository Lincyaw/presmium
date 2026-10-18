# @presmium/slidev-addon-guide

Guidance: a simulated cursor, spotlights and hints that follow the steps.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
npm install -D @presmium/slidev-addon-guide
```

List it in the headmatter of the documents that use it:

```yaml
plugins:
  - '@presmium/slidev-addon-guide'
```

It is a Presmium plugin and a Slidev addon: its components work on the web page and in the slides. It needs `@presmium/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- `{cursor}`: a cursor that moves and clicks over the page, step by step.
- `{spotlight}` and `{hint}`: spotlight a block or lines of code, and show a hint.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/directives.md) (Chinese): every directive with its options and an example
- [Interfaces and versions](https://github.com/Lincyaw/presmium/blob/main/docs/api.md)

## License

Apache-2.0
