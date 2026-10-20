# @lincyaw/slidev-addon-code

Code references into a git repository: region, symbol and pattern anchors, pinned commits with permanent links, drift checks and step-by-step highlights.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
pnpm add -D @lincyaw/slidev-addon-code
```

List it in the headmatter of the documents that use it:

```yaml
plugins:
  - '@lincyaw/slidev-addon-code'
```

It is a Presmium plugin and a Slidev addon: its components work on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- `{code-ref}`: quote code by `region:<file>#<name>`, `symbol:<file>#<Class.method>` or `pattern:<file>#<ast-grep pattern>`, with `:pin:`, `:steps:`, `:variants:` and `:run:`.
- `presmium check` reports moved, ambiguous and lost anchors and drift since the pinned commit; `presmium check --update-lock` rewrites `.presmium/anchors.lock.json`.

## Configuration

`presmium.code.repo`: the repository URL of permanent links (per section with `{config}`).

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/directives.md) (Chinese): every directive with its options and an example

## License

Apache-2.0
