# @lincyaw/addon-exec

Running code: run panels, step-by-step execution and recorded outputs; Python in the browser with Pyodide, offline too.

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Install

```sh
pnpm add -D @lincyaw/addon-exec
```

Add this package to `metadata.plugins` in the document's `lecture.json`.

It is a Presmium plugin: its components work on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- Run-panel components with a canonical child code block, structured parameters and rich execution outputs. The compiler derives displayed code from that child, including referenced project code.
- Step-run components for Python execution traces.
- Run controls for code blocks whose `execution.when` is `live` or `both`, through the configured real executor.

## Configuration

`presmium.exec.timeoutMs`: the timeout of runs (with section overrides in `sections[id].config`).

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/locales/en/lecture.json) (Chinese: `site/guide/lecture.json`)
- [Document contract](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/document.md): normalized entities, parameters, states and shared validation

## License

Apache-2.0
