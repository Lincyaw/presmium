# @lincyaw/host

Presmium's host interface for plugin components: step state, services, shared state, interface text, the site path and the design system, the same in the web form and in the slides (both are the viewer).

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

Plugins declare it as a peer dependency (`"@lincyaw/host": "^1.0.0"`); a document's own components in `components/` need it in the document's `package.json`.

## Usage

```vue
<script setup lang="ts">
import { useMessages, useStepState } from '@lincyaw/host'

const shown = useStepState({ from: 1 })
const t = useMessages({ 'zh-CN': { done: '完成' }, 'en': { done: 'Done' } })
</script>

<template>
  <p v-if="shown.reached">{{ t.done }}</p>
</template>
```

Components get everything through this package, so both forms render them; browser code finds the site path with `siteBase()`, not `import.meta.env.BASE_URL`. It also provides the design system: the `Pm*` components (`PmButton`, `PmDialog`, `PmIcon` and others) in Vue, over the `--pm-*` tokens, the classes and the fonts (IBM Plex Sans, IBM Plex Mono and Source Serif 4, SIL Open Font License 1.1) of `@lincyaw/design`, which it loads into every page.

The interactive primitives wrap Reka UI; positioning, dismissal, keyboard navigation and focus management come from the library. Theme observation uses VueUse, and the shared icon names map to Lucide.

## Experimental parts

`useToolbarPlacement` and `provideToolbarPlacement` are experimental and outside the 1.x semver promise; their declarations carry the TSDoc tag `@experimental`, and the interface list names them.

## Documentation

- [Plugin guide](https://github.com/Lincyaw/presmium/blob/main/site/plugins/lecture.en.md)

## License

Apache-2.0
