# The plugin contract

This reference walks from the source syntax to the outputs, with a hypothetical plugin `poll` (package
`presmium-plugin-poll`). Types come from `@lincyaw/kernel` (Node and shared contracts; also
`@lincyaw/kernel/contracts` for types only) and `@lincyaw/host` (the browser side). Your editor's
go-to-definition on these imports shows the full declarations in `node_modules`.

## 1. The package

```
presmium-plugin-poll/
├── package.json
├── src/
│   ├── domain/index.ts    pure TS: plugin id, component names, parsing, step arithmetic, zh-CN and en text
│   ├── node/presmium.ts   the Node entry: default export PresmiumNodePlugin
│   └── client/            optional: plugin.ts (browser plugin), viewer.ts (viewer extension), composables
├── components/PmPoll.tsx  a component; its file name is its name
├── vite.config.ts         optional: Vite plugins and JSX configuration for the viewer's build
├── example/lecture.md     a document that lists the plugin by its directory
└── test/plugin.test.ts    integration tests
```

`package.json`:

```json
{
  "name": "presmium-plugin-poll",
  "version": "0.1.0",
  "type": "module",
  "keywords": ["presmium", "presmium-plugin"],
  "engines": { "node": ">=22.19" },
  "exports": {
    "./presmium": "./src/node/presmium.ts",
    "./package.json": "./package.json"
  },
  "files": ["components", "src"],
  "peerDependencies": {
    "@lincyaw/compiler": "^<version>",
    "@lincyaw/host": "^<version>",
    "@lincyaw/kernel": "^<version>",
    "@lincyaw/viewer": "^<version>",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@lincyaw/cli": "^<version>",
    "@lincyaw/host": "^<version>",
    "@lincyaw/kernel": "^<version>",
    "@lincyaw/render-notebook": "^<version>",
    "@lincyaw/render-slides": "^<version>",
    "@lincyaw/web": "^<version>",
    "vitest": "^5.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  }
}
```

- `<version>` is the Presmium version you build against (a new project gets the version of the `presmium`
  that made it); a prerelease such as `1.0.0-rc.0` needs a range that names it (`^1.0.0-rc.0`). Presmium refuses to load a plugin whose peer ranges the installed packages
  do not satisfy, and says so in `presmium check` and the build.
- The dev dependencies install Presmium for the tests and `pnpm dev`: the CLI and the renderers the
  example uses.
- `./presmium` is the only export Presmium needs. The viewer finds the browser files by path, not by
  `exports`: `components/*.tsx` (also `.ts`, `.js`, `.jsx`), `src/client/plugin.ts`,
  `src/client/viewer.ts`, `vite.config.ts`. Further exports (`./domain`, `./client`) are for code that
  imports your package.
- A package with browser files that releases everything in `dispose` (section 7) may declare
  `"presmium": { "preview": { "restartable": true } }`. The workbench then keeps a paused preview cached and
  restarts it; without it (or if any plugin of the document lacks it) the paused preview is destroyed.
- Runtime libraries of the browser or Node side are ordinary `dependencies`.

### Layers

| Directory | May import | Must not import |
|---|---|---|
| `src/domain/` | `@lincyaw/kernel`, pure computation libraries, files in `src/domain/` | React and `react-dom`, `@lincyaw/host`, Node built-ins (`node:fs` and `fs` alike) |
| `src/shared/` (optional: code that runs in Node and the browser) | `src/domain/`, `@lincyaw/kernel`, libraries that run in both | React, `@lincyaw/host`, `@lincyaw/kernel/node`, Node built-ins |
| `components/`, `src/client/` | `src/domain/`, `src/shared/`, `@lincyaw/kernel`, `@lincyaw/host`, React, browser libraries; `@lincyaw/viewer` as types only | Other plugins, `@lincyaw/server`, `@lincyaw/mcp`, `@lincyaw/workspace`, `@lincyaw/web` |
| `src/node/` | `src/domain/`, `src/shared/`, `@lincyaw/kernel`, `@lincyaw/kernel/node`, Node libraries | React and `react-dom` |

No file imports `vitepress`, `@slidev/*`, another plugin package, or a dependency's internal paths, and
relative imports stay inside the package. A contract two plugins share is a service token (section 7).

## 2. The Node entry

```ts
// src/node/presmium.ts
import { createRequire } from 'node:module'
import { deckLocale } from '@lincyaw/kernel'
import type { DirectiveSpec, PresmiumNodePlugin } from '@lincyaw/kernel'
import { MESSAGES, POLL_ID, parseChoices } from '../domain/index.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const poll: DirectiveSpec = {
  name: 'poll',
  arg: true,                          // the argument: the question
  body: true,                         // the body: one choice per line
  options: { anonymous: 'boolean' },  // option types: 'string' | 'number' | 'boolean' | 'list'
  toIR(input, ctx) {
    const t = MESSAGES[deckLocale(ctx.lang)]
    const choices = parseChoices(input.body)
    if (choices.length < 2) ctx.report({ checkId: POLL_ID, severity: 'error', message: '{poll} needs at least two choices' })
    return {
      node: {
        type: 'component',
        plugin: POLL_ID,
        name: 'PmPoll',
        props: { question: input.arg ?? '', choices, anonymous: input.options.anonymous === true },
        // What static outputs show (notebook, PDF): mdast
        fallback: {
          type: 'root',
          children: [
            { type: 'paragraph', children: [{ type: 'strong', children: [{ type: 'text', value: input.arg ?? t.poll }] }] },
            { type: 'list', ordered: false, children: choices.map(c => ({ type: 'listItem', children: [{ type: 'paragraph', children: [{ type: 'text', value: c }] }] })) },
          ],
        },
      },
      span: 0,                        // internal steps: the block has span + 1 states
    }
  },
}

const plugin: PresmiumNodePlugin = {
  id: POLL_ID,
  version,
  kernel: '^1.0.0',                   // the plugin contract (KERNEL_VERSION 1.0.0), not the packages' version
  directives: [poll],
}

export default plugin
```

The plugin id names the plugin everywhere: the `plugin` of its component nodes, its configuration
`presmium.<id>` in the frontmatter, its routes under `/__presmium/<id>/`, its shared-state keys.

### `PresmiumNodePlugin` fields

| Field | Shape | Use |
|---|---|---|
| `id` | string | Required |
| `version`, `kernel` | string | Declare both: `version` equal to `package.json`, `kernel` the contract range (`^1.0.0`). A plugin whose range excludes the installed contract is not loaded |
| `directives` | `DirectiveSpec[]` | MyST directives to IR nodes (section 3) |
| `roles` | `RoleSpec[]` | Inline roles `` {name key=value}`content` ``: `{ name, options?, children?(input, ctx) }`; in the IR a `presmiumRole` mdast node (`plugin`, `name`, `options`, `children`). Renderers show `children`; one without children shows a marker `〔name value〕` in the presenter view |
| `passes` | `IRPass { name, order?, after?, run(doc, ctx) }` | Compile passes over the whole IR, after the built-in passes and before compile-time execution, ordered by `order`; with `after: 'execute'` they run after execution, when code nodes have `outputs`. `ctx`: `deckDir`, `workspaceRoot`, `lang`, `src`, `resolvers`, `lock`, `executors`, `cache`, `config`, `configFor(section)`, `report`, `watch`, `service` |
| `executors` | `Executor` | Compile-time execution (section 4) |
| `checks` | `Check { id, run(ctx) }` | Run by `presmium check`; return `Finding[]` with `source: { file, line }`. `ctx` has the compiled `ir`, `headmatter`, `src`, `resolvers`, `lock`, `service` |
| `resolvers`, `anchors` | `AnchorResolver { scheme, resolve(anchor, src, recorded?, ref?) }`; `(ctx) => AnchorString[]` | A new anchor scheme `scheme:target`; the anchors `presmium check --update-lock` records in `.presmium/anchors.lock.json`. A resolution is `exact`, `moved`, `fuzzy` or `lost`; only the first two may render, the others must report a diagnostic |
| `rendererExtensions` | `{ [rendererId]: { components: { [ComponentName]: (node, block, ctx) => unknown } } }` | How a static renderer writes a component (section 5) |
| `assets` | `(ctx: { deckDir, workspaceRoot, config }) => RuntimeAssets[]` | Files the browser code loads while it runs (a language runtime): `{ name, prefix, types, emitted?, source(file) }`, served at `<site base><prefix><file>` and copied into a built site (`emitted`, default all). Browser code builds the URL from `siteBase()` of `@lincyaw/host`, not `import.meta.env.BASE_URL` |
| `documentModules` | `(ctx: { deckDir, workspaceRoot, config }) => Record<string, string>` | Virtual modules the browser code imports whose content depends on the document (e.g. `'virtual:presmium-poll/data'`), by id, with their source; only the default export is read. The viewer is prebuilt once per set of plugins and gets these from the document's own bundle |
| `services` | `(ctx: NodeServiceContext) => [token, implementation][]` | Node services for passes, renderers, checks and server routes (`ctx.service?.(token)`). `ctx.config` is `presmium.<id>` of the document, `ctx.settings` the operator's `settings.<id>` in `presmium.workspace.yaml` (a document cannot change it), plus `lang`, `secret(name)`, `operatorDir`, `service`, `log`. Created per compilation; one implementation per token, duplicates are ignored with a warning |
| `server` | `(ctx: ServerContext) => { routes?, proxies?, close? }` | Routes under `/__presmium/<id>/` (section 6) |
| `exporters` | `Exporter[]` | Heavy outputs made on request as jobs (section 6) |
| `environments` | `{ [kind]: EnvironmentProvider { create(name, spec, ctx), probe? } }` | Named execution environments of `execute.environments` in the frontmatter; the executor's id is `environmentExecutor(name)`; `probe` serves `presmium check --env` |
| `tools` | `AgentTool { name, description, input, kind, run(input, ctx) }` | Tools the MCP service lists for AI agents: `name` lower case with underscores, `input` a JSON Schema of an object; `kind` `read` (every token), `operate` or `spend` (author tokens, approved first); `ctx` has `document`, `member`, `service`, `signal`; return JSON data or text |
| `operator` | boolean | Loaded for every document when the operator lists it in `settings.presmium.workspace.plugins` and installs it at the workspace root; on the `presmium serve` home page its server part gets an empty directory as `deckDir`, so routes there must not read or write files |

Shared helpers of `@lincyaw/kernel`: `docBlocks(doc)` and `irBlocks` (walk blocks, components' children
included), `nodeMdast`, `mdastText`, `errorMessage(error)`, `isRecord`, `languageId(lang)` (`py`, `python3`
are `python`; `js` is `javascript`; `ts` is `typescript`), `deckLocale(lang)`, `jsonResponse`,
`problemResponse`, `sseResponse`, `defineService`, `stepStateAt`.

## 3. Directives and the IR

### `DirectiveSpec`

```ts
interface DirectiveSpec {
  name: string
  arg?: boolean | 'anchor'          // 'anchor': the argument is scheme:target; editors jump, hover and complete it
  body?: boolean
  options?: Record<string, 'string' | 'number' | 'boolean' | 'list'>
  toIR(input: DirectiveInput, ctx: DirectiveContext): DirectiveResult | Promise<DirectiveResult>
}
interface DirectiveInput { name: string, arg?: string, options: Record<string, unknown>, body: string }
interface DirectiveResult { node: IRNode, role?: 'visual' | 'narration', span?: number }   // role default 'visual'
```

- The compiler handles `:reveal:`, `:label:` and `:audience:` itself; they never reach `toIR`. With
  `options` declared, undeclared options get a warning.
- A name equal to a built-in directive (`slide`, `only`, `hints`, `config`, `component`, `audience`) or to
  another plugin's directive is an error.
- Plugin directives are allowed at the top level of a section and inside `{slide}` and `{only}`; elsewhere
  they are dropped with a warning.
- `ctx` (`DirectiveContext`): `file`, `deckDir`, `workspaceRoot` (the git root, or the document directory),
  `lang` (pick output text with `deckLocale(ctx.lang)`), `config` (the plugin's global configuration merged
  with the section's `{config}`), `source` (`{ file, line, endLine? }`), `parse(markdown)` (MyST to mdast,
  e.g. for a body with formatting), `report(finding)`, `watch(...files)`.
- Read workspace files in a pass through `ctx.src` or `ctx.resolvers`, which the compiler records so
  `presmium dev` recompiles on change; declare any file read another way with `ctx.watch`. A plugin that
  resolves a branch or tag to a commit itself must also watch that git ref.

### IR shapes

```ts
interface IRDocument { ir: 1, meta: { title, entry, lang?, ... }, config: { plugins, presmium, renderers, execute? }, sections: IRSection[], diagnostics: Finding[] }
interface IRSection { id, index, title, depth, source, steps, hints, config?, blocks: IRBlock[], audience? }
interface IRBlock {
  id: string                         // stable within the section
  role: 'visual' | 'narration'       // shown content, or narration
  at: number                         // the step it appears at
  until?: number                     // the step it disappears at
  span?: number                      // internal steps
  only?: string[]                    // renderer ids it is limited to
  audience?: string[]
  source: { file: string, line: number, endLine?: number }
  node: MarkdownNode | CodeNode | ComponentNode
}
interface MarkdownNode { type: 'markdown', mdast: MdastNode, reveal?: 'items' }
interface CodeNode { type: 'code', lang, value, title?, origin?, highlight?: number[][], run?, outputs?, variants?, echo?: false }
interface ComponentNode {
  type: 'component'
  plugin: string                     // the plugin id
  name: string                       // the component's file name in components/
  props: Record<string, unknown>     // JSON data
  children?: IRBlock[]               // child blocks, rendered into the component's default slot
  ownsCode?: boolean                 // false: child code keeps its run controls and recorded output
  fallback?: MdastNode               // what static outputs show
  assets?: Record<string, string>    // prop name to a local file URL the renderers publish and rewrite
  layer?: 'overlay'                  // drawn above the content, takes no space (e.g. a cursor)
  durations?: number[]
}
interface MdastNode { type: string, children?: MdastNode[], value?: string, [key: string]: unknown }
```

- Steps: a block appears at step `at`. A block with `span: n` has `n + 1` internal states; state k shows at
  step `at + k`. Narration after a block binds to its steps one paragraph per step. A component's
  `useStepState({ from: k })` is relative to the block's `at`.
- Child blocks: a directive builds them itself, e.g. `children: [{ id: 'source', role: 'visual', at: 0,
  source: ctx.source, node: codeNode }]`. A component owns the code of its children by default: the viewer
  gives that code no run controls and shows no recorded output. Put code the component runs in a prop; never
  read it back from the rendered DOM. A container that only arranges content sets `ownsCode: false`.
- A component that uses local files (images, media) puts the URL in a prop and lists it in `assets` (prop
  name to URL); renderers publish the file and rewrite the prop.
- The document's own `components/*.tsx` are registered under the plugin id `deck` and placed with the
  built-in `{component}` directive; a component of the document overrides a plugin component of the same
  name. Two plugins with the same component name: the first in `plugins` wins, with a warning.

### Configuration

| Scope | Written | Read |
|---|---|---|
| Global | Frontmatter `presmium: { <id>: {...} }` | `ctx.config` in directives and passes; `PluginContext.config` in the browser plugin |
| Section | `{config}` with a YAML body keyed by plugin id, e.g. ``presmium.poll: { anonymous: true }`` | Merged over the global one for directives and passes in that section; components read the merge with `useSectionConfig(POLL_ID)` |
| One node | Directive options, component props | Props |

## 4. Executors

```ts
interface Executor {
  readonly id: string
  readonly runsIn?: 'browser' | 'machine'   // shown in the run panel's header
  supports(lang: string): boolean
  run(request: RunRequest, signal?: AbortSignal, ctx?: RunContext): Promise<RunResult>
  fingerprint?(lang: string): string | Promise<string>   // identity of the runtime: part of the cache key
  revision?(lang: string): string | Promise<string>      // revision of the executor's own code: part of the key
  endSession?(session: string): Promise<void>
  params?(lang: string): ParamsDisplay | undefined
}
```

- `RunRequest`: `lang`, `code`, `args?` (become variables), `stdin?`, `timeoutMs?`, `files?` (written into the
  working directory), `executor?`, `session?`, `place?`. Runs with the same `session` share an interpreter
  and run in order.
- `RunResult`: `ok`, `stdout`, `stderr`, `exitCode`, `durationMs`, `timedOut`, `source: 'live' | 'recorded'`,
  `executorId`, `outputs?` (nbformat rich outputs: `stream`, `display_data`, `execute_result`, `error`).
  `failedRun` of `@lincyaw/kernel` builds a failed result.
- The code sees only `ctx.env` (do not read `process.env`; without `ctx`, give only `PATH`, `LANG` and a
  temporary `HOME`). With `ctx.sandbox`, start child processes through it, passing input and results as
  files. Messages an executor writes into outputs are English and contain no paths of the build machine.
- Results are recorded in `.presmium/freeze/` of the document and reused; a different `revision` re-runs.
- In the browser, register an executor with the router: in `setup`,
  `ctx.tryGet(EXECUTOR)?.register(executor, priority?)` (and unregister in `dispose`).

## 5. Static renderers: extensions and `fallback`

| Renderer | With an extension | Without one |
|---|---|---|
| `web`, `slides` | Not used: both are viewer pages that run the component | The component, by name; a missing component shows the `fallback` |
| Slides printed for PDF, PNG, PowerPoint | Not used | The `fallback` (`useStaticRender()` is true there) |
| `notebook` | The cells the extension returns; `undefined` falls back to `fallback`, `[]` writes nothing | The `fallback`; with none, a line linking to the web version, and the build report lists the block |

A notebook extension returns one cell or an array: a string is a Markdown cell; an object is
`{ cell_type: 'markdown' | 'code' | 'raw', source, metadata?, outputs?, execution_count? }`, or
`{ cell_type: 'markdown', mdast }`, which the renderer lowers to Markdown Jupyter shows, copying local files.
Before writing a code cell, compare the code's language with the notebook kernel's (`ctx.config.kernel`,
default Python) with `languageId`; do not assume Python.

```ts
rendererExtensions: {
  notebook: { components: { PmPoll: (node, block, ctx) => `**${String(node.props.question)}**` } },
},
```

The third argument is the renderer's `RenderContext` (`outDir`, `workDir`, `deckDir`, `config`, `lang`,
`localAsset`, ...): choose output text with `deckLocale(ctx.lang)`. An extension that throws gets a warning
at the block and the renderer writes the fallback.

## 6. Server routes and exporters

```ts
server(ctx) {                          // once per document: presmium dev serves one, presmium serve each opened
  let votes: Record<string, number> = {}
  return {
    routes: {
      votes: {
        role: 'reader',                // who may call it: 'reader' | 'editor' (default) | 'owner'
        async handle(request, { member, document, rest }) {
          if (request.method === 'POST') { const { choice } = await request.json() as { choice: string }; votes[choice] = (votes[choice] ?? 0) + 1 }
          return jsonResponse(votes)   // no-store; problemResponse(status, message) for errors
        },
      },
    },
    proxies: [],                       // { path, target, headers?, role? }; '..' or an encoded '/' in the path is a 400
    close() {},
  }
},
```

- A request body above 1 MiB gets 413; set `maxBody` on the route for more.
- `ServerContext`: `deckDir`, `workspaceRoot`, `config`, `settings`, `lang`, `service(token)`, `secret(name)`,
  `operatorDir`, `home`, `log`. Ask the user before acting with `ctx.service(APPROVALS)?.request({ kind:
  'operate' | 'spend' | 'write' | 'agent', scope?, title, detail?, from, member? })`. Write document files
  through `ctx.service(DOCUMENT_FILES)` when the host provides it (paths relative to `workspaceRoot`), so
  the write is reviewed and versioned; write directly only when it is absent.
- Browser: `useServer()` returns `{ available, member, fetch(pluginId, path, init?), events(pluginId, path) }`
  (`events` is an `EventSource`; answer it with `sseResponse`). `fetch` sends `Accept-Language` with the page's
  language; answer in it. In a built site `available` is false: hide the control or degrade.

An `Exporter` is `{ id, label: { 'zh-CN': ..., en: ... }, available?(doc, config), run(ctx) }`; `ctx` gives
`deckDir`, `workspaceRoot`, `config`, an empty `outDir`, `signal` (stop your processes and reject),
`progress(phase, done?, total?)`, `log(line)`, `options` (the requester's choices, as the exporter documents
them) and `build(renderer, config?)`, which builds the document with a renderer at `/` and returns its output
directory. `run` returns `{ files, captions?, warnings? }`, the file to open first first. The author starts
exports from the workbench; the AI from its tools.

## 7. The browser side

### Components

`components/PmPoll.tsx` runs in the web page and the slides alike. It imports only React, `@lincyaw/host`,
`@lincyaw/kernel` and `src/domain/`.

```tsx
import { PmButton, useMessages, useStepState, useSharedState } from '@lincyaw/host'
import { MESSAGES, POLL_ID } from '../src/domain/index.ts'

export default function PmPoll({ question, choices }: {
  question: string, choices: string[], anonymous: boolean
}) {
  const t = useMessages(MESSAGES)
  const results = useStepState({ from: 1 }) // the block's second state (span >= 1)
  const [picked, setPicked] = useSharedState(`${POLL_ID}:picked`, '', { scope: 'local' })
  return <section>
    <h3>{question}</h3>
    {choices.map(choice => <PmButton key={choice} aria-pressed={picked === choice}
      onClick={() => setPicked(choice)}>{choice}</PmButton>)}
    {results.reached && <p>{t.vote}: {picked}</p>}
  </section>
}
```

| `@lincyaw/host` | Use |
|---|---|
| `useStepState({ from, to? })` | `{ active, reached, done }` of internal steps `[from, to)`, relative to the block's `at`; do not subtract `at` yourself |
| `useStepScope()`, `useBlockStepRange()` | `scope.step(k)` is the absolute step of internal step k; `useStepState(useBlockStepRange())` is active while the block (within its parents) is shown: stop media and background work outside it |
| `useStepTime({ until? })` | Milliseconds since the component's step began; `Infinity` when settled (stepped back, document view, reduced motion, after `until`, a slide that is not the current one). The lecture replay and video export drive it. Pause your animation library's timeline and seek to this time; never play by the page clock |
| `useService(STEP_CLOCK)?.wait(promise)` | Register async preparation of a picture (loading a module, WebGL); the video export waits for it before each frame |
| `usePrefersReducedMotion()` | When true, show the final state directly |
| `useActions(elementRef, { name: (seeking) => ... }, { clear })` | Named actions: call the returned `run(name)` from buttons. A recorded lecture replays them, and the narration's ``{cue to=<block>}`click <name>` `` runs them; on a jump the host calls `clear` and replays in order. The look must be a function of the actions so far |
| `useCursor()`, `useViewRole()`, `usePresentationMode()` | `{ slide, step }`; `'audience' | 'presenter' | 'reader'`; `'slides' | 'document'`. `useHost().useStep()` is `Infinity` in the fully expanded document view: a component with internal steps may then give readers its own stepper; the look is a function of (section step, local step) |
| `useSectionConfig(POLL_ID)` | The global configuration merged with the section's `{config}` |
| `useSharedState(key, initial, { scope })` | Returns `[value, setValue]`: JSON state shared by key (start the key with the plugin id): `'view'` this view only, `'local'` (default) all windows of this machine, `'remote'` also other devices through sync transports (a classroom) |
| `useMessages(catalog)`, `useLocale()`, `currentLocale()` | Text by the page's language (`'zh-CN'` or `'en'`); `currentLocale()` outside components |
| `useStaticRender()` | True on the printed slides (PDF, PNG, PowerPoint exports); the host already swaps components with a `fallback` there |
| `useServer()` | Server access (section 6); outside components call `serverClient()` |
| `useService(TOKEN)`, `presmiumService(TOKEN)` | A service implementation (undefined until the kernel started); the second outside components |
| `siteBase()` | The document's site path, ending in `/`, for runtime files and `media/` |
| `useAppearance()` | Whether the page is dark, and a toggle |

- The viewer wraps every plugin component in `PmBoundary`; do not add one yourself.
- Components are React function components. Derive step-dependent visibility from `useStepState` or
  `useStep`; do not keep a separate animation counter. Render block content through `children`.
- `useDoc()` returns the current `IRDocument`. Document frontmatter is in `doc.meta`, renderer options in
  `doc.config.renderers`; use `useCursor()` for the current position.
- Services with observable state expose `Store<T>` values. In a component call `useStore(store)`; in plugin
  setup or event handlers use `store.getSnapshot()` and `store.subscribe(listener)`, releasing subscriptions
  in `dispose`. `createStore(initial)` creates observable state; `store.set(valueOrUpdater)` updates it.
- In the workbench's preview, `<html>` has the class `pm-in-workbench`: hide there with CSS the controls
  that only make sense while presenting or recording.
- The overlay views (present, presenter) set `--pm-overlay-bar` on `<html>` (the height of their control
  bar): fixed elements keep clear of it with `bottom: calc(var(--pm-overlay-bar, 0rem) + var(--pm-space-4))`.

### Design system

`@lincyaw/host` loads the fonts, tokens and component classes. Use tokens, never raw colors:

| Group | Tokens |
|---|---|
| Color | `--pm-color-` `bg`, `surface`, `sunk`, `canvas`, `hover`, `code`, `ink`, `muted`, `line`, `line-strong`, `accent`, `accent-soft`, `accent-line`, `on-accent`, `selected`, `ok`, `ok-soft`, `warn`, `warn-soft`, `danger`, `danger-soft`, `add`, `del` |
| Font | `--pm-font-sans`, `--pm-font-serif`, `--pm-font-mono` |
| Size, leading | `--pm-text-xs`, `sm`, `md`, `lg`, `reading`, `title`, `display`; `--pm-leading-tight`, `ui`, `reading` |
| Space | `--pm-space-px`, `--pm-space-1` ... `--pm-space-12` (4 px grid) |
| Radius | `--pm-radius-control`, `small`, `card`, `panel`, `chip`, `pill` |
| Size | `--pm-size-hairline` (1 px line), `stroke`, `dot`, `icon-sm`, `icon`, `badge`, `touch`, `row` |
| Shadow, motion | `--pm-shadow`, `--pm-shadow-float`; `--pm-duration-fast`, `--pm-duration`, `--pm-ease` (0 under reduced motion) |

Dark mode is the class `dark` on `<html>`; the color tokens switch with it. Components: `PmButton`
(`variant` `default | primary | accent | ghost | danger`, `small`, `icon`; `aria-pressed="true"` shows on),
`PmIconButton` (`icon`, `label`), `PmField` (`label`, `inline`; inputs use `pm-ui-input`, `pm-ui-select`,
`pm-ui-textarea`), `PmBadge` (`tone`, `pill`), `PmCard` (`variant` `interactive | dashed`), `PmSegmented` and
`PmTabs` (`value`, `onValueChange`, `choices`/`tabs` of `{ value, label }`, `label`), `PmPopover`, `PmDrawer`, `PmDialog`
(`open`, `onOpenChange`, `label`, `closeLabel`; popovers also take `trigger`), `PmMenu` (`items`, `onSelect`), `PmEmpty`, `PmNotice` (`tone`),
`PmIcon` (`name` from `ICONS`, semantic names such as `play`, `pause`, `check`, `close`, `plus`, `edit`,
`trash`, `copy`, `download`, `info`, `warning`, `error`, `chevron-left`, `chevron-right`, `more`; `iconMarkup(name)`
where only HTML text fits). Text reaches WCAG AA on its
background; borders that identify inputs and selected states use `line-strong` (3:1). A component inside the
document sets `--pm-text-sm` and `--pm-text-md` in `em` on its root so its controls scale with the slide;
toolbar popovers and panels keep the host's size.

### The browser plugin: `src/client/plugin.ts`

```ts
import { currentLocale, TOOLBAR } from '@lincyaw/host'
import type { PluginDefinition, Unsubscribe } from '@lincyaw/kernel'
import { version } from '../../package.json'
import { MESSAGES, POLL_ID, POLL_STORE } from '../domain/index.ts'
import PollPanel from './PollPanel.tsx'

let off: Unsubscribe[] = []

const plugin: PluginDefinition = {
  restartable: true,                  // only if dispose stops everything and setup can run again
  manifest: { id: POLL_ID, version, kernel: '^1.0.0', provides: [POLL_STORE], requires: [{ token: TOOLBAR, optional: true }] },
  setup(ctx) {
    ctx.provide(POLL_STORE, createStore(ctx.config))
    const toolbar = ctx.tryGet(TOOLBAR)
    if (toolbar) off.push(toolbar.register({ id: POLL_ID, title: MESSAGES[currentLocale()].poll, component: PollPanel, slot: 'tools', icon: 'check' }))
  },
  dispose() { off.forEach(f => f()); off = [] },
}
export default plugin
```

- The viewer imports this file for every package in `plugins` and starts all of them in dependency order,
  in both forms. A plugin without browser services needs no `plugin.ts`.
- `PluginContext`: `config` (`presmium.<id>`), `mode`, `provide(token, impl)`, `get`, `tryGet`, `events`,
  `log`, `environments`. Define a token in `src/domain/` with `defineService<T>('presmium-poll.store')`.
- `dispose` releases Workers, timers, queued work, streams, media tracks and listeners: the host stops the
  plugins on `pagehide` and restarts them when the page returns from the back/forward cache.
- Toolbar items: `slot` is `tools` (default), `settings` or `status`; a component learns where it is drawn
  with `useToolbarPlacement()` (`bar` or `status`); an entry that opens a panel uses `PmToolbarEntry`
  (`name`, `label`, `closeLabel`, `icon`, `open`, `onOpenChange`).
- Host service tokens: `TOOLBAR`, `NAVIGATION` (`position`, `go(position)`), `OPERATIONS`, `STATUS`
  (register a summary `{ id, read() }`), `STEP_CLOCK`, `SYNC_TRANSPORTS` from `@lincyaw/host`; `EXECUTOR`,
  `SESSION`, `ASK` and the other business contracts from `@lincyaw/kernel`.
- Recorded operations: when the user does something worth replaying, `presmiumService(OPERATIONS)?.report({
  type, data })`, with data positioned by `'<section>/<block>'` and relative coordinates, not pixels. In
  `setup`, `ctx.tryGet(OPERATIONS)?.onReplay(type, { apply(data, seeking), clear() })`, unsubscribed in
  `dispose`. Replaying in order and folding after a jump (`clear()`, then replay with `seeking` true) must
  give the same picture.

### The viewer extension: `src/client/viewer.ts`

Default export `(ctx) => void`, typed with `import type { ViewerPlugin } from '@lincyaw/viewer'`. It runs once
before the viewer starts, in both forms; if it throws, it is skipped with an error.

| `ctx` | Use |
|---|---|
| `registerView({ id, label, kind: 'page' | 'overlay', component, hidden? })` | A view; a page view gets the prop `sections` |
| `registerNodeRenderer(key, component)` | Renders a kind of block: `markdown`, `code`, `component`, `code:<lang>`, a component name, or `mime:<type>` for a rich-output MIME type; props `block`, `section`, `step` |
| `registerComponent(name, component)` | A component for `component` nodes beyond the `components/` convention |
| `registerAction({ id, keys, run(viewer), views? })` | Key actions (`KeyboardEvent.key`, no modifiers); `run` returning `false` passes the key on; default views are present and presenter |
| `registerLayer({ id, component, views?, scope? })` | A layer of the overlay views, prop `view`: `scope` `'viewport'` (default; players, blackout), `'view'` (inside the view), `'slide'` (on each slide, in canvas coordinates, with props `section` and `step`), `'bar'` (a control in the view's bar) |
| `useViewer()`, `SectionView`, `BlockView` | The runtime state (document, view, position), and building blocks of views |

### `vite.config.ts`

Default export `{ plugins }`. The viewer's document builds add these Vite plugins for both browser and
server-side rendering. React JSX uses the automatic runtime; a React Vite plugin is not required. A Vite
plugin that serves virtual modules adds those files to `optimizeDeps.entries` in its `config()` hook. The
prebuilt viewer is cached in `$XDG_CACHE_HOME/presmium/viewer-app/` (by default
`~/.cache/presmium/viewer-app/`).

## 8. Text in two languages

```ts
// src/domain/index.ts
import type { Locale } from '@lincyaw/kernel/contracts'
export const MESSAGES: Record<Locale, { poll: string, vote: string, votes(n: number): string }> = {
  'zh-CN': { poll: '投票', vote: '投票', votes: n => `${n} 票` },
  'en': { poll: 'Poll', vote: 'Vote', votes: n => (n === 1 ? '1 vote' : `${n} votes`) },
}
```

The page's language is `<html lang>`, set from the document's `lang` (default `zh-CN`): `zh*` is Chinese,
`en*` English, anything else follows `navigator.language`, then English. Server routes answer in the
request's `Accept-Language`. Diagnostics (`ctx.report` messages) are English.
