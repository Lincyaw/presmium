# @presmium/kernel

Presmium's shared kernel: the IR and the plugin contracts, the service registry, anchors and checks. Plain TypeScript, used by the compiler, the renderers, the IR runtime and every plugin.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

Plugins declare it as a peer dependency, so they share the application's copy:

```json
"peerDependencies": { "@presmium/kernel": "^1.0.0" }
```

## Entries

- `@presmium/kernel`: the contracts (`PresmiumNodePlugin`, `PluginDefinition`, `DirectiveSpec`, `IRPass`, `Renderer`, `RenderContext`, `Check`, the service tokens), the IR types (`IRDocument` and its nodes), `KERNEL_VERSION`, `IR_VERSION`, and plain helpers such as `docBlocks`, `withProp`, `deckLocale`, `json` and `problem`.
- `@presmium/kernel/contracts`, `@presmium/kernel/ir`: the contracts or the IR types alone.
- `@presmium/kernel/reading`: plain functions that read compiled documents (`chapters`, `blockText`, `narrationAt`, `tokenize`).
- `@presmium/kernel/node`: helpers for Node code: `copyPublished` (its other exports are internal).
- `@presmium/kernel/runner.py`: the shared Python runner of the executors.

## Versions

`KERNEL_VERSION` is the version of the plugin contract, separate from the package version: 1.0.0 in Presmium 1.0, a minor version higher for each compatible addition to the contract, a major version (and a major version of the packages) for an incompatible change. Plugins declare `kernel: '^1.0.0'`, which any Presmium 1.x satisfies; a plugin whose range excludes it is not loaded. `IR_VERSION` is the version of the IR's JSON format.

## Documentation

- [Plugin guide](https://github.com/Lincyaw/presmium/blob/main/site/plugins/lecture.en.md)
- [Interfaces and versions](https://github.com/Lincyaw/presmium/blob/main/docs/api.md): what is public, experimental or internal, and the version rules

## License

Apache-2.0
