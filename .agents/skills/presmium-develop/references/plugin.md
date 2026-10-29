# The plugin contract

This reference connects a normalized document definition to its runtime component, services and outputs.
The hypothetical plugin `poll` (package `presmium-plugin-poll`, plugin id `poll`) supplies a `PmPoll`
component. An authored component block references a versioned definition and stores structured parameters.
The project created by `presmium new --type plugin` demonstrates the same boundary with
`components/GreetingCard.tsx`, `example/lecture.json` and the `waves` route.

The sole authoring entry is `lecture.json`. See `presmium-author/references/document.md` for the editable
document contract. References to mdast, runtime component props and fallback trees below describe compiler
and renderer interfaces; they are not another authoring format.

Types come from `@lincyaw/kernel` (Node and shared contracts; also `@lincyaw/kernel/contracts` for types
only) and `@lincyaw/host` (the browser side). Your editor's go-to-definition on these imports shows the full
declarations in `node_modules`.

## 1. The package

```
presmium-plugin-poll/
├── package.json
├── src/
│   ├── domain/index.ts    pure TS: plugin id, component names, parsing, step arithmetic, zh-CN and en text
│   ├── node/presmium.ts   the Node entry: default export PresmiumNodePlugin
│   └── client/            optional: plugin.ts (browser plugin), viewer.ts (viewer extension), React hooks
├── components/PmPoll.tsx  a component; its file name is its name
├── vite.config.ts         optional: Vite plugins and JSX configuration for the viewer's build
├── example/lecture.json     a document that lists the plugin by its directory
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
  that made it); a prerelease such as `1.0.0-rc.0` needs a range that names it (`^1.0.0-rc.0`). Presmium
  refuses to load a plugin whose peer ranges the installed packages do not satisfy, and says so in
  `presmium check` and the build.
- The dev dependencies install Presmium for the tests and `pnpm dev`: the CLI and the renderers (the
  packages that produce each form) the example uses.
- `./presmium` is the only export Presmium needs. The viewer (Presmium's browser app, which shows the web
  page and the slides) finds the browser files by path, not by
  `exports`: `components/*.tsx` (also `.ts`, `.js`, `.jsx`), `src/client/plugin.ts`,
  `src/client/viewer.ts`, `vite.config.ts`. Further exports (`./domain`, `./client`) are for code that
  imports your package.
- A package with browser files that releases everything in `dispose` (section 7) may declare
  `"presmium": { "preview": { "restartable": true } }`. The studio (the browser workbench `presmium studio`
  starts) then keeps a paused preview cached and restarts it; without it (or if any plugin of the document
  lacks it) the paused preview is destroyed.
- Runtime libraries of the browser or Node side are ordinary `dependencies`.

### Layers

| Directory | May import | Must not import |
|---|---|---|
| `src/domain/` | `@lincyaw/kernel`, pure computation libraries, files in `src/domain/` | React and `react-dom`, `@lincyaw/host`, Node built-ins (`node:fs` and `fs` alike) |
| `src/shared/` (optional: code that runs in Node and the browser) | `src/domain/`, `@lincyaw/kernel`, libraries that run in both | React, `@lincyaw/host`, `@lincyaw/kernel/node`, Node built-ins |
| `components/`, `src/client/` | `src/domain/`, `src/shared/`, `@lincyaw/kernel`, `@lincyaw/host`, React, browser libraries; `@lincyaw/viewer` as types only | Other plugins, `@lincyaw/server`, `@lincyaw/mcp`, `@lincyaw/workspace`, `@lincyaw/web` |
| `src/node/` | `src/domain/`, `src/shared/`, `@lincyaw/kernel`, `@lincyaw/kernel/node`, Node libraries | React and `react-dom` |

No file imports `vitepress`, `@slidev/*`, another plugin package or a dependency's internal paths (only what its `exports`
publishes), and relative imports stay inside the package. A contract two plugins share is a service token
(section 7).

## 2. The Node entry

```ts
// src/node/presmium.ts
import { createRequire } from 'node:module'
import { jsonResponse } from '@lincyaw/kernel'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
import { PLUGIN_ID } from '../domain/index.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: PLUGIN_ID,
  version,
  kernel: '^1.0.0',
  server() {
    let waves = 0
    return { routes: { waves: { role: 'reader', handle(request) {
      if (request.method === 'POST') waves++
      return jsonResponse({ waves })
    } } } }
  },
}
export default plugin
```

Author a component definition in `example/lecture.json` with implementation `{ type: "plugin", plugin: PLUGIN_ID, name: "GreetingCard" }`, a real parameter Schema and fallback. The matching public component file is `components/GreetingCard.tsx`.

The plugin id names the plugin everywhere: the `plugin` of its component nodes, its configuration
(the key `<id>` under `metadata.presmium`, written `presmium.<id>` below), its routes under
`/__presmium/<id>/`, its shared-state keys (`useSharedState`, section 7).

### `PresmiumNodePlugin` fields

| Field | Shape | Use |
|---|---|---|
| `id` | string | Required |
| `version`, `kernel` | string | Declare both: `version` equal to `package.json`, `kernel` the contract range (`^1.0.0`). A plugin whose range excludes the installed contract is not loaded |
| `passes` | `IRPass { name, order?, after?, run(doc, ctx) }` | Compile passes: functions that read and change the whole IR. They run after Presmium's own passes and before code blocks are executed at compile time, ordered by `order`; with `after: 'execute'` they run after execution, when code nodes have `outputs`. `ctx`: `deckDir` (the document folder), `workspaceRoot`, `lang`, `src` and `resolvers` (read files so that `presmium dev` watches them; see section 3), `lock` (the recorded anchors), `executors`, `cache`, `config` (`presmium.<id>`), `configFor(section)` (merged with the section configuration), `report`, `watch`, `service` |
| `executors` | `Executor` | Compile-time execution (section 4) |
| `checks` | `Check { id, run(ctx) }` | Run by `presmium check`; return `Finding[]`, each `{ checkId, severity: 'error' \| 'warning' \| 'info', message, source?: { file, line } }`. `ctx` has the compiled `ir`, `headmatter` (the metadata), `src`, `resolvers`, `lock`, `service` |
| `resolvers`, `anchors` | `AnchorResolver { scheme, resolve(anchor, src, recorded?, ref?) }`; `(ctx) => AnchorString[]` | An anchor is a reference `scheme:target` to a piece of a source file that survives edits, such as `region:src/sort.py#loop` on code blocks (presmium-author/references/document.md). `resolvers` adds a new scheme; `anchors` lists the anchors `presmium check --update-lock` records in `.presmium/anchors.lock.json`. A resolution is `exact`, `moved`, `fuzzy` or `lost`; only the first two may render, the others must report a diagnostic |
| `rendererExtensions` | `{ [rendererId]: { components: { [ComponentName]: (node, block, ctx) => unknown } } }` | How a static renderer writes a component (section 5) |
| `assets` | `(ctx: { deckDir, workspaceRoot, config }) => RuntimeAssets[]` | Files the browser code loads while it runs (a language runtime): `{ name, prefix, types, emitted?, source(file) }`, served at `<site base><prefix><file>` and copied into a built site (`emitted`, default all). Browser code builds the URL from `siteBase()` of `@lincyaw/host`, not `import.meta.env.BASE_URL` |
| `documentModules` | `(ctx: { deckDir, workspaceRoot, config }) => Record<string, string>` | Virtual modules the browser code imports whose content depends on the document (e.g. `'virtual:presmium-poll/data'`), by id, with their source; only the default export is read. The viewer is prebuilt once per set of plugins and gets these from the document's own bundle |
| `services` | `(ctx: NodeServiceContext) => [token, implementation][]` | Node services (objects registered under a token made with `defineService`, section 7) for passes, renderers, checks and server routes, which get them with `ctx.service?.(token)`. `ctx.config` is `presmium.<id>` of the document, `ctx.settings` the operator's `settings.<id>` in `presmium.workspace.yaml` (the operator is whoever runs `presmium serve` for a workspace; a document cannot change these settings), plus `lang`, `secret(name)`, `operatorDir`, `service`, `log`. Created per compilation; one implementation per token, duplicates are ignored with a warning |
| `server` | `(ctx: ServerContext) => { routes?, proxies?, close? }` | Routes under `/__presmium/<id>/` (section 6) |
| `exporters` | `Exporter[]` | Heavy outputs made on request as jobs (section 6) |
| `environments` | `{ [kind]: EnvironmentProvider { create(name, spec, ctx), probe? } }` | Named execution environments (a container, a remote machine) that a document declares under `execute.environments` in its metadata, each with a `kind`; the executor's id is `environmentExecutor(name)`; `probe` serves `presmium check --env` |
| `tools` | `AgentTool { name, description, input, kind, run(input, ctx) }` | Tools that the MCP server (the `mcp <url>` line of `presmium dev` and `presmium serve`) lists for AI agents: `name` lower case with underscores, `input` a JSON Schema of an object; `kind` `read` (any token may call it), `operate` or `spend` (only the author's token, and the author approves each call first); `ctx` has `document`, `member`, `service`, `signal`; return JSON data or text |
| `operator` | boolean | An operator plugin is loaded for every document of a workspace when the operator lists it in `presmium.workspace.yaml` under `settings: { presmium.workspace: { plugins: [...] } }` and installs it at the workspace root; on the `presmium serve` home page its server part gets an empty directory as `deckDir`, so routes there must not read or write files |

Shared helpers of `@lincyaw/kernel`: `docBlocks(doc)` and `irBlocks` (walk blocks, components' children
included), `nodeMdast` (a node as mdast), `mdastText` (the plain text of mdast), `errorMessage(error)`,
`isRecord`, `languageId(lang)` (`py`, `python3` are `python`; `js` is `javascript`; `ts` is `typescript`),
`deckLocale(lang)` (the document's `lang` to `'zh-CN'` or `'en'`), `jsonResponse`, `problemResponse`,
`sseResponse` (section 6), `defineService` (section 7), `stepStateAt` (`useStepState` outside a component).

## 3. Document definitions and the runtime snapshot

The only authored entry is `lecture.json`. A component block is `{ id, type: "component", definitionId, parameters }`; its definition declares `kind`, `schemaVersion`, `implementation`, `parameterSchema`, `states` and optional versioned `data`. Implementation references name a project file, installed module or plugin/component pair. The example document shows the exact structure.

The compiler validates authored parameters/state references and lowers them into a runtime `component` node with plugin, name, props, optional nested child blocks, assets, timing and static fallback. These runtime nodes are renderer input; never copy their numeric `at`, `span`, absolute paths or generated props back into the document as a second authority.

Resource mappings use dotted parameter paths. If a step introduces resources beyond the base component's declared paths, its compile pass derives `stepStates[].assets`, watches the real files and leaves their parameter values intact. Publication rewrites both the base props and those step parameters; the link checker checks every declared step resource. The built-in `PmMedia` pass derives its maps from the actual media parameters, including caption languages introduced only in one step.

Rich text is versioned Presmium structure, adapted through the editor's public API. A registered extension retains complete structured data and an explicit fallback; unknown extensions remain intact and report unavailable behavior. Component states have declared IDs. Migrated numeric implementations use explicit `legacyIndex` mappings, not fabricated semantic labels.

Document configuration is `metadata.presmium[pluginId]`; renderer configuration is `metadata.renderers[rendererId]`. Operator settings remain in workspace/operator configuration. Steps and narrations are explicit entities; timing/voice inheritance is owned only by `production`.

The old directive parsing API is not a document runtime entry. Do not add a directive-based author workflow or a MyST compatibility compiler. Existing library contracts that mention mdast describe derived rendering/fallback trees, not editable Markdown source.

## 4. Executors

An executor runs an authored code block whose `execution` declares `when` and optional executor/session
settings, and returns its output. At
compile time the Node entry's `executors` run code and the results are written into the IR; in the browser,
the run controls of a code block send code to the executor registered for its language.

```ts
interface Executor {
  readonly id: string
  readonly runsIn?: 'browser' | 'machine'   // shown in the header of the panel that shows a run
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
- In the browser, register an executor with the service that picks an executor per language: in the
  browser plugin's `setup` (section 7), `ctx.tryGet(EXECUTOR)?.register(executor, priority?)` (and
  unregister in `dispose`).

## 5. Static renderers: extensions and `fallback`

| Renderer | With an extension | Without one |
|---|---|---|
| `web`, `slides` | Not used: both are viewer pages that run the component | The component, by name; a missing component shows the `fallback` |
| Slides printed for PDF, PNG, PowerPoint | Not used | The `fallback` (`useStaticRender()` is true there) |
| `notebook` | The cells the extension returns; `undefined` falls back to `fallback`, `[]` writes nothing | The `fallback`; with none, a line linking to the web version, and the build report lists the block |

A notebook extension returns one cell or an array: a string is a Markdown cell; an object is
`{ cell_type: 'markdown' | 'code' | 'raw', source, metadata?, outputs?, execution_count? }`, or
`{ cell_type: 'markdown', mdast }`, which the renderer lowers to Markdown Jupyter shows, copying local files.
Before writing a code cell, compare the code's language with the notebook's Jupyter kernel
(`ctx.config.kernel`, which the document sets as `renderers.notebook.kernel`; default Python) with
`languageId`; do not assume Python.

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
        role: 'reader',                // who may call it: 'reader' | 'editor' (default) | 'owner'; others get 403
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

- The person who runs `presmium dev` or `presmium serve` on their own machine is the owner; a lower
  `role` opens the route to members with fewer rights (`reader` can only view, `editor` can edit).
- A request body above 1 MiB gets 413; set `maxBody` on the route for more.
- `ServerContext`: `deckDir`, `workspaceRoot`, `config`, `settings`, `lang`, `service(token)`, `secret(name)`,
  `operatorDir`, `home`, `log`. Ask the user before acting with `ctx.service(APPROVALS)?.request({ kind:
  'operate' | 'spend' | 'write' | 'agent', scope?, title, detail?, from, member? })` (`presmium dev
  --allow <kinds>` grants kinds without asking). Write document files through
  `ctx.service(DOCUMENT_FILES)` when the program running the server (`presmium serve`, the studio)
  provides it (paths relative to `workspaceRoot`), so the write is reviewed and versioned; write directly
  only when it is absent. Both tokens come from `@lincyaw/kernel`.
- Browser: `useServer()` returns `{ available, member, fetch(pluginId, path, init?), events(pluginId, path) }`
  (`events` is an `EventSource`; answer it with `sseResponse`). `fetch` sends `Accept-Language` with the page's
  language; answer in it. In a built site `available` is false: hide the control or degrade.

An `Exporter` is `{ id, label: { 'zh-CN': ..., en: ... }, available?(doc, config), run(ctx) }`; `ctx` gives
`deckDir`, `workspaceRoot`, `config`, an empty `outDir`, `signal` (stop your processes and reject),
`progress(phase, done?, total?)`, `log(line)`, `options` (the requester's choices, as the exporter documents
them) and `build(renderer, config?)`, which builds the document with a renderer at `/` and returns its output
directory. `run` returns `{ files, captions?, warnings? }`, the file to open first first. The author starts
exports from the studio; an AI agent from its MCP tools.

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
| `useCursor()`, `useViewRole()`, `usePresentationMode()` | `{ slide, step }`; `'audience' \| 'presenter' \| 'reader'`; `'slides' \| 'document'`. The current step (`useHost().useStep()`, `useHost()` being the object behind these functions) is `Infinity` in the fully expanded document view: a component with internal steps may then give readers its own stepper; the look is a function of (section step, local step) |
| `useSectionConfig(POLL_ID)` | The global configuration merged with the section configuration |
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
- `useDoc()` returns the current `IRDocument`. Runtime document metadata is in `doc.meta`, renderer options in
  `doc.config.renderers`; use `useCursor()` for the current position.
- Services with observable state expose `Store<T>` values. In a component call `useStore(store)`; in plugin
  setup or event handlers use `store.getSnapshot()` and `store.subscribe(listener)`, releasing subscriptions
  in `dispose`. `createStore(initial)` creates observable state; `store.set(valueOrUpdater)` updates it.
- In the workbench's preview, `<html>` has the class `pm-in-workbench`: hide there with CSS the controls
  that only make sense while presenting or recording.
- The overlay views (present, presenter) set `--pm-overlay-bar` on `<html>` (the height of their control
  bar): fixed elements keep clear of it with `bottom: calc(var(--pm-overlay-bar, 0rem) + var(--pm-space-4))`.

### Design system

`@lincyaw/host` loads the fonts, tokens (the `--pm-*` CSS variables) and component classes. Use tokens,
never raw colors:

| Group | Tokens |
|---|---|
| Color | `--pm-color-` `bg`, `surface`, `sunk`, `canvas`, `hover`, `pressed`, `code`, `ink`, `muted`, `muted-soft`, `line`, `line-strong`, `accent`, `accent-soft`, `accent-line`, `on-accent`, `selected`, `ok`, `ok-soft`, `warn`, `warn-soft`, `danger`, `danger-soft`, `add`, `del` |
| Font | `--pm-font-sans`, `--pm-font-serif`, `--pm-font-mono` |
| Size, leading | `--pm-text-xs`, `sm`, `md`, `lg`, `reading`, `title`, `display`; `--pm-leading-tight`, `ui`, `reading` |
| Space | `--pm-space-px`, `--pm-space-1` ... `--pm-space-12` (4 px grid) |
| Radius | `--pm-radius-control`, `small`, `card`, `panel`, `chip`, `pill`; nested: `control-inset`, `menu-item` |
| Size | `--pm-size-hairline` (1 px line), `stroke`, `dot`, `icon-sm`, `icon`, `badge`, `touch`, `row` |
| Shadow, motion | `--pm-shadow`, `--pm-shadow-float`; `--pm-duration-fast`, `--pm-duration`, `--pm-duration-slow`, `--pm-ease` (0 under reduced motion); `--pm-duration-spin`, `--pm-duration-pulse` for loops |

Dark mode is the class `dark` on `<html>`; the color tokens switch with it, as they do in the high-contrast
mode of the publishing plugin (`data-pm-contrast="high"` on `<html>`). Components: `PmButton`
(`variant` `default | primary | accent | ghost | danger`, `small`, `icon`; `aria-pressed="true"` shows on),
`PmIconButton` (`icon`, `label`), `PmField` (`label`, `inline`; inputs use `pm-ui-input`, `pm-ui-select`,
`pm-ui-textarea`), `PmBadge` (`tone`, `pill`), `PmCard` (`variant` `interactive | dashed`), `PmSegmented` and
`PmTabs` (`value`, `onValueChange`, `choices`/`tabs` of `{ value, label }`, `label`), `PmPopover`, `PmDrawer`, `PmDialog`
(`open`, `onOpenChange`, `label`, `closeLabel`; popovers also take `trigger`), `PmMenu` (`items`, `onSelect`), `PmEmpty`, `PmSkeleton` (`label`, `shape` `document | list | preview`), `PmNotice` (`tone`),
`PmIcon` (`name` from `ICONS`, semantic names such as `play`, `pause`, `check`, `close`, `plus`, `edit`,
`trash`, `copy`, `download`, `info`, `warning`, `error`, `chevron-left`, `chevron-right`, `more`; `iconMarkup(name)`
where only HTML text fits). Text reaches WCAG AA on its
background; borders that identify inputs and selected states use `line-strong` (3:1). A component inside the
document sets `--pm-text-sm` and `--pm-text-md` in `em` on its root so its controls scale with the slide;
toolbar popovers and panels keep the host's size.

The rules the shared controls follow, which a plugin's own CSS follows too:

- **Line wrapping.** Headings wrap balanced (`text-wrap: balance`) and paragraphs pretty (`text-wrap: pretty`), so a
  line of Chinese text does not end on one or two characters. The host applies this to `h1`–`h6`, `p`, `li`,
  captions and the `pm-ui-*` titles; a component that draws headings or paragraphs with other elements sets the same
  property on them. Code, numbers in table cells and form fields keep normal wrapping.
- **Nested radius.** A shape inside another, less than 2rem from its edge, takes the outer radius minus the gap
  (`calc(var(--pm-radius-control) - var(--pm-space-1))` for an item 4 px inside a control-radius panel); when that
  leaves 2 px or less it keeps its own radius. `--pm-radius-control-inset` and `--pm-radius-menu-item` name the
  pairs the host uses.
- **Complete states.** Every control has hover, pressed (`:active`, `--pm-color-pressed`), `:focus-visible` and
  disabled. `Pm*` controls already have them; reuse them instead of drawing your own. While content of a known
  shape loads, show `PmSkeleton` rather than a spinner; an empty panel shows `PmEmpty` with a short line that says
  how to get the first item; an error shows inline with `PmNotice` or the field's error, never `window.alert`,
  `confirm` or `prompt`.
- **Messages.** A success says what happened ("Poll saved to this slide"), an error says what failed and what to do
  next ("The vote was not sent. Check the connection and try again"). No exclamation marks or cute interjections;
  English messages in sentence case. Keep the zh-CN and en texts saying the same thing.
- **Interface text.** Every string a reader sees lives in the plugin's catalog with both `'zh-CN'` and `en`, with
  the same keys; none is written in JSX, an `aria-label`/`title`/`placeholder` literal or a thrown error that
  reaches the page. Use the words of Presmium's interface glossary (`docs/glossary.md` in the Presmium repository):
  document 文稿, page 页面, slide 幻灯片, block 内容块, step 步骤, script 讲稿, voiceover 配音, captions 字幕,
  comment 批注, Undo 撤消, Redo 恢复, Discard 放弃, Reload 重新加载, Presenter View 演示者视图, End Show 结束放映.
  No internal names on screen (IR, MCP, plugin package names, build, compile, token, git). English is US
  spelling; commands, pane and dialog titles are Title Case (`New Comment`, `Presenter View`), messages, field
  labels and options sentence case; a command that opens a dialog ends with “…”; Oxford comma; curly quotes
  “ ” and ’. Chinese uses full-width punctuation, “” quotes, one “…” for an ellipsis, a space between Chinese and
  Latin letters or digits (`第 3 页`), verb phrases on buttons, and no colloquial particles.
- **Motion.** Animate `transform` and `opacity` only, never `top`, `left`, `width`, `height`, margins or padding.
  Take every transition's time from a duration token so that reduced motion stills it, and switch looping
  animations off under `@media (prefers-reduced-motion: reduce)`. A component's step animation shows its final
  state when `usePrefersReducedMotion()` is true.

### The browser plugin: `src/client/plugin.ts`

```ts
import { createStore, currentLocale, TOOLBAR } from '@lincyaw/host'
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
- `PluginContext`: `config` (`presmium.<id>`), `mode`, `provide(token, impl)`, `get(token)` (a service listed in
  `requires`), `tryGet(token)` (undefined when missing), `events`, `log`, `environments`; your editor shows the
  rest of the type. A service is an object one plugin provides under a token and others look up; define a
  token in `src/domain/` with `defineService<T>('presmium-poll.store')`, and list it in `manifest.provides`
  (or `requires`) so the viewer starts plugins in dependency order.
- `dispose` releases Workers, timers, queued work, streams, media tracks and listeners: the host stops the
  plugins on `pagehide` and restarts them when the page returns from the back/forward cache. It also runs
  after `setup` fails, so it must tolerate partial initialization. Stopping waits for in-flight setup
  and releases dependent plugins before their providers.
- Toolbar items: `slot` is `tools` (default), `settings` or `status`; a component learns where it is drawn
  with `useToolbarPlacement()` (`bar` or `status`); an entry that opens a panel uses `PmToolbarEntry`
  (`name`, `label`, `closeLabel`, `icon`, `open`, `onOpenChange`).
- Host service tokens: `TOOLBAR`, `NAVIGATION` (`position`, `go(position)`), `OPERATIONS`, `STATUS`
  (register a summary `{ id, read() }`), `STEP_CLOCK`, `SYNC_TRANSPORTS` from `@lincyaw/host`; `EXECUTOR`,
  `SESSION`, `ASK` and the tokens of Presmium's other services from `@lincyaw/kernel` (go-to-definition
  shows each one's interface).
- Recorded operations: while a lecture is recorded, user actions reported as operations are kept and
  replayed with the recording. When the user does something worth replaying, `presmiumService(OPERATIONS)?.report({
  type, data })`, with data positioned by `'<section>/<block>'` and relative coordinates, not pixels. In
  `setup`, `ctx.tryGet(OPERATIONS)?.onReplay(type, { apply(data, seeking), clear() })`, unsubscribed in
  `dispose`. Replaying in order and folding after a jump (`clear()`, then replay with `seeking` true) must
  give the same picture.

### The viewer extension: `src/client/viewer.ts`

Default export `(ctx) => void`, typed with `import type { ViewerPlugin } from '@lincyaw/viewer'`. It runs once
before the viewer starts, in both forms; if it throws, it is skipped with an error. The built-in views are
`document` and `scrolly` (page views: the web page's reading layouts), `present` (the slides, an overlay
view) and `presenter` (the presenter view, opened with `p` in `present`); `views` options take these ids.

| `ctx` | Use |
|---|---|
| `registerView({ id, label, kind: 'page' | 'overlay', component, hidden? })` | A view; a page view gets the prop `sections` |
| `registerNodeRenderer(key, component)` | Renders a kind of block: `markdown`, `code`, `component`, `code:<lang>`, a component name, or `mime:<type>` for a rich-output MIME type; props `block`, `section`, `step` |
| `registerComponent(name, component)` | A component for `component` nodes beyond the `components/` convention |
| `registerAction({ id, keys, run(viewer, event?), views? })` | Key actions (`KeyboardEvent.key`, no modifiers); `run` returning `false` passes the key on; the optional `event` is the original keyboard event, so a single-press action consumes `event.repeat` without running again; a plugin's action runs before the built-in one on the same key (the lecture player takes Space and hands it back to the next step when nothing plays); keys that belong to a text field, an editor, an open menu or dialog, or a control reached with the keyboard never reach an action; default views are present and presenter |
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
