# @lincyaw/addon-exec-wasi

Running C, C++, Ruby and SQL in WebAssembly, with the same runtime at build time and in the browser: no toolchain on the build machine, offline in the browser.

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Install

```sh
pnpm add -D @lincyaw/addon-exec-wasi
```

Add this package to `metadata.plugins` in the document's `lecture.json`.

It is a Presmium plugin: its components work on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- The executor `presmium.wasi` for code blocks in `c`, `cpp`, `ruby` and `sql`.
- Named environments of `kind: wasi`.

## Configuration

`presmium.execWasi.loadTimeoutMs`: how long the browser may take to download a runtime (default 120000). Only code run in the browser makes the build publish the runtime (about 52 MB for C and C++).

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/locales/en/lecture.json) (Chinese: `site/guide/lecture.json`)
- [Document contract](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/document.md): normalized entities, parameters, states and shared validation

## License

Apache-2.0
