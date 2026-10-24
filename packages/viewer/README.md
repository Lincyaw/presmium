# @lincyaw/viewer

Presmium's IR runtime: renders compiled documents in the browser with Vue, in pluggable runtime views (the document, scrollytelling, the present view, the presenter view), and applies live updates without reloading. The web form and the slides are both this runtime: a slide is a section on a canvas of a fixed size, scaled as a whole. Runnable code blocks can be edited in place before they run (CodeMirror 6, loaded the first time a block is edited).

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

The web renderer `@lincyaw/web` brings it. Plugins that extend it declare it as a peer dependency (`"@lincyaw/viewer": "^1.0.0"`).

## Viewer plugins

A plugin's `src/client/viewer.ts` exports a `ViewerPlugin`, which registers views, node renderers, components, actions and layers. A layer's `scope` puts it over the window (`viewport`, the default), over the view (`view`), on each slide (`slide`, in the canvas's coordinates, its props also giving the slide's `section` and `step`) or in the presentation bar (`bar`):

```ts
import type { ViewerPlugin } from '@lincyaw/viewer'

const plugin: ViewerPlugin = (ctx) => {
  ctx.registerAction({ id: 'my.next', keys: ['n'], run: viewer => viewer.next() })
}
export default plugin
```

## Documentation

- [Plugin guide](https://github.com/Lincyaw/presmium/blob/main/site/plugins/lecture.en.md)

## License

Apache-2.0
