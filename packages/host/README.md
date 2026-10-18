# @presmium/host

Presmium's host interface for plugin components: step state, services, shared state, interface text and the design system, the same in the web form (VitePress) and in the slides (Slidev).

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

Plugins declare it as a peer dependency (`"@presmium/host": "^1.0.0"`); a document's own components in `components/` need it in the document's `package.json`.

## Usage

```vue
<script setup lang="ts">
import { useMessages, useStepState } from '@presmium/host'

const shown = useStepState({ from: 1 })
const t = useMessages({ 'zh-CN': { done: '完成' }, 'en': { done: 'Done' } })
</script>

<template>
  <p v-if="shown.reached">{{ t.done }}</p>
</template>
```

Components get everything through this package, never from `@slidev/*` or `vitepress`, so both forms render them. It also provides the design system: the `Pm*` components (`PmButton`, `PmDialog`, `PmIcon` and others) in Vue, over the `--pm-*` tokens, the classes and the fonts (IBM Plex Sans, IBM Plex Mono and Source Serif 4, SIL Open Font License 1.1) of `@presmium/design`, which it loads into every page.

## Experimental parts

The parts that exist for the local workbench only (`EDIT_MODE`, the toolbar slots and places of the workbench and edit mode, `trackAgentTask`) are experimental and outside the 1.x semver promise; their declarations carry the TSDoc tag `@experimental`, and the interface list names them.

## Documentation

- [Plugin guide](https://github.com/Lincyaw/presmium/blob/main/site/plugins/lecture.en.md)
- [Interfaces and versions](https://github.com/Lincyaw/presmium/blob/main/docs/api.md): what is public, experimental or internal, and the version rules

## License

Apache-2.0
