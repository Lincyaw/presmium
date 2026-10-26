# @lincyaw/addon-code

Code references into a git repository: region, symbol and pattern anchors, pinned commits with permanent links, drift checks and step-by-step highlights.

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Install

```sh
pnpm add -D @lincyaw/addon-code
```

Add this package to `metadata.plugins` in the document's `lecture.json`.

It is a Presmium plugin: its components work on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- A code block `origin` references `region:<file>#<name>`, `symbol:<file>#<Class.method>` or `pattern:<file>#<ast-grep pattern>`. Optional pins, variants and `highlightRegions` preserve authored references; execution uses the block's `execution` contract.
- `presmium check` reports moved, ambiguous and lost anchors and drift since the pinned commit; `presmium check --update-lock` rewrites `.presmium/anchors.lock.json`.

## Configuration

`presmium.code.repo`: the repository URL of permanent links (with section overrides in `sections[id].config`).

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/locales/en/lecture.json) (Chinese: `site/guide/lecture.json`)
- [Document contract](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/document.md): normalized entities, parameters, states and shared validation

## License

Apache-2.0
