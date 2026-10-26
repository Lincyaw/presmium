# @lincyaw/addon-exec-webgpu

The browser's GPU: WGSL compute shaders, a Python bridge and jax-js, recorded in Chromium at build time.

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Install

```sh
pnpm add -D @lincyaw/addon-exec-webgpu
```

Add this package to `metadata.plugins` in the document's `lecture.json`.

It is a Presmium plugin: its components work on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- An executor for WGSL code in a run-panel component: WebGPU compute shaders run in the browser and can be recorded in Playwright's Chromium at build time; list it together with `@lincyaw/addon-exec`.
- jax-js for JavaScript and TypeScript code, and the Python bridge `presmium_gpu`.
- Named environments of `kind: webgpu`.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/locales/en/lecture.json) (Chinese: `site/guide/lecture.json`)
- [Document contract](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/document.md): normalized entities, parameters, states and shared validation

## License

Apache-2.0
