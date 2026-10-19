# @presmium/compiler

Presmium's compiler: MyST source to the IR, plugin loading, compile-time execution and its cache, checks and publication checks, translations and the students' version, and running the renderers.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

It comes with `@presmium/cli`. Plugins that use its helpers declare it as a peer dependency (`"@presmium/compiler": "^1.0.0"`).

## Usage

```ts
import { build, Compiler } from '@presmium/compiler'

const compilation = await new Compiler('lecture.md').compile()
console.log(compilation.doc.sections.map(section => section.title))
const findings = await compilation.check()
await build(compilation, { outDir: 'dist', to: ['web'] })
```

`Compiler`, `Compilation`, `build`, `dev` and the options are public; the other exports serve Presmium's own packages.

## Documentation

- [Plugin guide](https://github.com/Lincyaw/presmium/blob/main/site/plugins/lecture.en.md)

## License

Apache-2.0
