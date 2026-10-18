# @presmium/slidev-addon-exec

Running code: run panels, step-by-step execution and recorded outputs; Python in the browser with Pyodide, offline too.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
pnpm add -D @presmium/slidev-addon-exec
```

List it in the headmatter of the documents that use it:

```yaml
plugins:
  - '@presmium/slidev-addon-exec'
```

It is a Presmium plugin and a Slidev addon: its components work on the web page and in the slides. It needs `@presmium/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- `{run-panel}`: a panel that runs code with parameters, at build time and in the browser.
- `{step-run}`: Python traced line by line in the browser, a line per step.
- Run buttons for code blocks with `:run: live` or `both`, and the browser executors.

## Configuration

`presmium.exec.timeoutMs`: the timeout of runs (per section with `{config}`).

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/directives.md) (Chinese): every directive with its options and an example
- [Interfaces and versions](https://github.com/Lincyaw/presmium/blob/main/docs/api.md)

## License

Apache-2.0
