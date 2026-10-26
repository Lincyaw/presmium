# {{name}}

A [Presmium](https://github.com/Lincyaw/presmium) plugin. A document lists it in `metadata.plugins` and defines a component with implementation `{ "type": "plugin", "plugin": "{{id}}", "name": "GreetingCard" }` in `lecture.json`. A component block references that definition and supplies its `name` parameter.

The same React greeting card appears in the web page and slides; its static fallback appears in a notebook. Under `presmium dev` and `presmium serve` the card can wave through the plugin server route.

## Develop

```sh
pnpm install
pnpm test          # the integration tests: the real presmium CLI on example/lecture.json
pnpm dev           # the example in the web page and the slides, live
pnpm check         # presmium check of the example
pnpm build         # the example's web page, slides and notebook, in example/dist/
```

| Path | What |
|---|---|
| `src/domain/index.ts` | The plugin's id and its text in Chinese and English: pure TypeScript |
| `src/node/presmium.ts` | What the compiler loads: the server route `waves` and other Node contributions |
| `components/GreetingCard.tsx` | The component, in the web page and the slides; it uses `@lincyaw/host` only |
| `example/lecture.json` | A document that uses the plugin, by its directory |
| `test/plugin.test.ts` | Integration tests (Vitest) |

`AGENTS.md` is the guide for coding agents, with the skills in `.agents/skills`.

## Use it in a document

```sh
pnpm add -D {{name}}
```

```json
{ "metadata": { "plugins": ["{{name}}"] } }
```

This is the relevant metadata fragment; keep the complete existing document and add a definition/component block as in `example/lecture.json`.

The plugin shares Presmium with the document that loads it: `@lincyaw/kernel`, `host`, `viewer` and
`compiler` are peer dependencies, and Presmium reports a plugin whose peers the installed Presmium does
not satisfy, without loading it. Before publishing, choose a license (`license` in `package.json`).
