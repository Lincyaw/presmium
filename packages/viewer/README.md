# @presmium/viewer

Presmium's IR runtime: renders compiled documents in the browser with Vue, in pluggable runtime views (the document, scrollytelling, the present view, the presenter view), and applies live updates without reloading.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

The web renderer `@presmium/web` brings it. Plugins that extend it declare it as a peer dependency (`"@presmium/viewer": "^1.0.0"`).

## Viewer plugins

A plugin's `src/client/viewer.ts` exports a `ViewerPlugin`, which registers views, node renderers, components, actions and layers:

```ts
import type { ViewerPlugin } from '@presmium/viewer'

const plugin: ViewerPlugin = (ctx) => {
  ctx.registerAction({ id: 'my.next', keys: ['n'], run: viewer => viewer.next() })
}
export default plugin
```

## Documentation

- [Plugin guide](https://github.com/Lincyaw/presmium/blob/main/site/plugins/lecture.en.md)
- [Interfaces and versions](https://github.com/Lincyaw/presmium/blob/main/docs/api.md): what is public, experimental or internal, and the version rules

## License

Apache-2.0
