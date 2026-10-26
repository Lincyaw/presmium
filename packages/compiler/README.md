# @lincyaw/compiler

Presmium's compiler validates the canonical `lecture.json` teaching document and lowers it to a runtime snapshot. Plugin loading, execution, checks and renderers consume that derived snapshot.

Part of [Presmium](https://github.com/Lincyaw/presmium), which publishes structured teaching documents as web pages, slides, Jupyter notebooks and narrated lectures.

## Install

It comes with `@lincyaw/cli`. Plugins that use its helpers declare it as a peer dependency (`"@lincyaw/compiler": "^1.0.0"`).

## Usage

```ts
import { build, Compiler } from '@lincyaw/compiler'

const compilation = await new Compiler('lecture.json').compile()
console.log(compilation.doc.sections.map(section => section.title))
const findings = await compilation.check()
await build(compilation, { outDir: 'dist', to: ['web'] })
```

`lecture.json` is the only runtime authoring entry. The compiler uses the same `validateDocument` contract as UI and agent changes. MyST files require a one-time offline migration; they are not an alternate entry. Rich text lowers directly from its typed tree, without a Markdown round trip.

Stable authoring step IDs and complete visual states are retained in the derived IR. A JSON pointer in diagnostics identifies the source entity; it is not a mutable source-line binding.

`Compiler`, `Compilation`, `build`, `dev` and the options are public; the other exports serve Presmium's own packages.

## Documentation

- [Plugin guide](https://github.com/Lincyaw/presmium/blob/main/site/plugins/locales/en/lecture.json)

## License

Apache-2.0
