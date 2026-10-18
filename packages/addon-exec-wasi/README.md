# @presmium/slidev-addon-exec-wasi

Running C, C++, Ruby and SQL in WebAssembly, with the same runtime at build time and in the browser: no toolchain on the build machine, offline in the browser.

Part of [Presmium](https://github.com/presmium/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
npm install -D @presmium/slidev-addon-exec-wasi
```

List it in the headmatter of the documents that use it:

```yaml
plugins:
  - '@presmium/slidev-addon-exec-wasi'
```

It is a Presmium plugin and a Slidev addon: its components work on the web page and in the slides. It needs `@presmium/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- The executor `presmium.wasi` for code blocks in `c`, `cpp`, `ruby` and `sql`.
- Named environments of `kind: wasi`.

## Configuration

`presmium.execWasi.loadTimeoutMs`: how long the browser may take to download a runtime (default 120000). Only code run in the browser makes the build publish the runtime (about 52 MB for C and C++).

## Documentation

- [Author guide](https://github.com/presmium/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/presmium/presmium/blob/main/.agents/skills/presmium-author/references/directives.md) (Chinese): every directive with its options and an example
- [Interfaces and versions](https://github.com/presmium/presmium/blob/main/docs/api.md)

## License

Apache-2.0
