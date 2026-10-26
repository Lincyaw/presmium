# @lincyaw/kernel

Presmium's shared kernel: the IR and the plugin contracts, the service registry, anchors and checks. Plain TypeScript, used by the compiler, the renderers, the IR runtime and every plugin.

Part of [Presmium](https://github.com/Lincyaw/presmium), which publishes structured teaching documents as web pages, slides, Jupyter notebooks and narrated lectures.

## Install

Plugins declare it as a peer dependency, so they share the application's copy:

```json
"peerDependencies": { "@lincyaw/kernel": "^1.0.0" }
```

## Entries

- `@lincyaw/kernel`: the contracts (`PresmiumNodePlugin`, `PluginDefinition`, `DirectiveSpec`, `IRPass`, `Renderer`, `RenderContext`, `Check`, the service tokens), the canonical authoring types (`TeachingDocument`, `DocumentEditOperation`), `DOCUMENT_ENTRY`, `DOCUMENT_SCHEMA_VERSION`, `DOCUMENT_JSON_SCHEMA`, `validateDocument`, the derived IR types (`IRDocument` and its nodes), `KERNEL_VERSION`, `IR_VERSION`, and plain helpers such as `docBlocks`, `withProp`, `deckLocale`, `jsonResponse` and `problemResponse`.
- `@lincyaw/kernel/contracts`, `@lincyaw/kernel/ir`: the contracts (types, service tokens and the preview protocol's parsers) or the IR types alone; the helpers are only in `@lincyaw/kernel`.
- `@lincyaw/kernel/reading`: plain functions that read a compiled document, the IR (`chapters`, `blockText`, `narrationAt`, `tokenize`); they do no I/O.
- `@lincyaw/kernel/node`: helpers for Node code: `copyPublished` and `isInside` (its other exports are internal).
- `@lincyaw/kernel/runner.py`: the shared Python runner of the executors.

## Versions

`KERNEL_VERSION` is the version of the plugin contract, separate from the package version: 1.0.0 in Presmium 1.0, a minor version higher for each compatible addition to the contract, a major version (and a major version of the packages) for an incompatible change. Plugins declare `kernel: '^1.0.0'`, which any Presmium 1.x satisfies; a plugin whose range excludes it is not loaded. `DOCUMENT_SCHEMA_VERSION` versions the authoritative authoring document; `IR_VERSION` separately versions derived runtime snapshots. Source CAS versions and runtime snapshot IDs have separate lifecycles.

## Documentation

- [Plugin guide](https://github.com/Lincyaw/presmium/blob/main/site/plugins/locales/en/lecture.json)

## License

Apache-2.0
