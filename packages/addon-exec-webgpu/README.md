# @lincyaw/slidev-addon-exec-webgpu

The browser's GPU: WGSL compute shaders, a Python bridge and jax-js, recorded in Chromium at build time.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
pnpm add -D @lincyaw/slidev-addon-exec-webgpu
```

List it in the headmatter of the documents that use it:

```yaml
plugins:
  - '@lincyaw/slidev-addon-exec-webgpu'
```

It is a Presmium plugin and a Slidev addon: its components work on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- An executor for `{run-panel} wgsl`: WebGPU compute shaders that run in the browser and are recorded in Playwright's Chromium at build time; list it together with `@lincyaw/slidev-addon-exec`.
- jax-js for JavaScript and TypeScript code, and the Python bridge `presmium_gpu`.
- Named environments of `kind: webgpu`.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/directives.md) (Chinese): every directive with its options and an example

## License

Apache-2.0
