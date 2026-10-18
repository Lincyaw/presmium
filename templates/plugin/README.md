# {{name}}

A [Presmium](https://github.com/Lincyaw/presmium) plugin. A document that lists it in `plugins` can write

```markdown
:::{greeting} reader
:::
```

and gets a greeting card in the web page and in the slides (one Vue component for both), a paragraph in
the notebook. Under `presmium dev` and `presmium serve` the card can wave, through the plugin's server
route.

## Develop

```sh
npm install
npm test           # the integration tests: the real presmium CLI on example/lecture.md
npm run dev        # the example in the web page and the slides, live
npm run check      # presmium check of the example
npm run build      # the example's web page, slides and notebook, in example/dist/
```

| Path | What |
|---|---|
| `src/domain/index.ts` | The plugin's id and its text in Chinese and English: pure TypeScript |
| `src/node/presmium.ts` | What the compiler loads: the `{greeting}` directive and the server route `waves` |
| `components/GreetingCard.vue` | The component, in the web page and the slides; it uses `@presmium/host` only |
| `example/lecture.md` | A document that uses the plugin, by its directory |
| `test/plugin.test.ts` | Integration tests (Vitest) |

`AGENTS.md` is the guide for coding agents, with the skills in `.agents/skills`.

## Use it in a document

```sh
npm install {{name}}
```

```yaml
plugins:
  - '@presmium/slidev-addon-core'
  - '{{name}}'
```

The plugin shares Presmium with the document that loads it: `@presmium/kernel`, `host`, `viewer` and
`compiler` are peer dependencies, and Presmium reports a plugin whose peers the installed Presmium does
not satisfy, without loading it. Before publishing, choose a license (`license` in `package.json`).
