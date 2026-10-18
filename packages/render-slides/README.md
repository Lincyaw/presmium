# @presmium/render-slides

Presmium's slides renderer: writes the IR as a Slidev deck and builds it, with Presmium's default theme Book (书卷). Narration becomes speaker notes, and plugin components render through the slides host adapter.

Part of [Presmium](https://github.com/presmium/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
npm install -D @presmium/cli @presmium/render-slides @presmium/slidev-addon-core
```

List `@presmium/slidev-addon-core` in the document's `plugins`: it is the host adapter of the slides.

## Configuration

In the headmatter, `renderers.slides` takes Slidev's headmatter options (`theme`, `routerMode`, `exportFilename` and others), plus `base`, `port` and `addons`. Without `theme`, the slides use the default theme; `theme: default` is Slidev's own.

## Documentation

- [Author guide](https://github.com/presmium/presmium/blob/main/site/guide/lecture.en.md)
- [Interfaces and versions](https://github.com/presmium/presmium/blob/main/docs/api.md)

## License

Apache-2.0
