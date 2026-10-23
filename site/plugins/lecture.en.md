---
title: Plugin guide
lang: en
description: Extend Presmium with components, directives, services, server routes, views and renderers
translationOf: { entry: lecture.md, digest: 30337fc3c95304d3cbd7fe948e88112844860573c793ad5fa33703906c3cf9de }
---

(plugins)=
# Plugin guide

Presmium's components, directives, executors, services and renderers all come from plugins, and official and third-party plugins use the same contracts. A plugin is an npm package: its Node entry turns directives of the source into IR, runs passes and checks at compile time, and provides services and server routes; in the browser its components are the same Vue components in the web form and in the slides, and they get the step state and services through `@lincyaw/host` only.

This guide follows an imagined poll plugin, `presmium.poll`, from the package's layout to its tests. The full signatures are in the API reference (API in the navigation bar), and the version rules in [Interfaces and versions](../reference/lecture.md#versions).

(plugin-package)=
# The plugin package

(plugin-package-layout)=
## Layout

```text
presmium-plugin-poll/
├── package.json
├── src/
│   ├── domain/          plain TS: the plugin id, parsing, step arithmetic, Chinese and English text
│   ├── node/presmium.ts the Node entry: exports a PresmiumNodePlugin by default
│   └── client/          the browser side: plugin.ts (kernel plugin), viewer.ts (optional, extends the IR runtime)
├── components/PmPoll.vue a component, named after its file
├── setup/main.ts        registers the kernel plugin in the slides (Slidev's convention)
└── test/                integration tests
```

(plugin-package-json)=
## package.json

```json
{
  "name": "presmium-plugin-poll",
  "version": "1.0.0",
  "type": "module",
  "keywords": ["slidev-addon", "presmium"],
  "exports": {
    "./presmium": "./src/node/presmium.ts",
    "./client": "./src/client/plugin.ts",
    "./package.json": "./package.json"
  },
  "files": ["components", "setup", "src"],
  "slidev": {},
  "peerDependencies": {
    "@lincyaw/host": "^1.0.0",
    "@lincyaw/kernel": "^1.0.0"
  },
  "devDependencies": {
    "@lincyaw/cli": "^1.0.0",
    "@lincyaw/host": "^1.0.0",
    "@lincyaw/kernel": "^1.0.0",
    "@lincyaw/web": "^1.0.0",
    "vitest": "^4.0.0"
  }
}
```

- Every plugin package is a Slidev addon too (the `slidev` field, `components/`, `setup/`), so the slides know its components.
- `@lincyaw/kernel`, `@lincyaw/host`, `@lincyaw/viewer` and `@lincyaw/compiler`, those the plugin uses, are peer dependencies: the plugin shares the application's one copy of Presmium. When the installed Presmium does not satisfy them, the loader reports `presmium.plugins` and leaves the plugin out; the build does not crash.
- The source is published as `.ts` and `.vue`, not compiled first; relative imports name the `.ts` extension.

(plugin-package-version)=
## version and kernel

The Node entry and the browser plugin's manifest both declare `version` and `kernel`: `version` is the package's own version, `kernel` the range of plugin contract versions it supports. The plugin contract of Presmium 1.x is version `1.0.0`, so write `kernel: '^1.0.0'`. A plugin whose range excludes the current contract version is not loaded.

(plugin-package-layers)=
## Layers

| Where | May import | Must not import |
|---|---|---|
| `src/domain/` | `@lincyaw/kernel`, libraries of plain computation | vue, `@lincyaw/host`, `@slidev/*`, vitepress, Node's built-in modules |
| `components/`, `src/client/` | `src/domain/`, `@lincyaw/kernel`, `@lincyaw/host`, vue | `@slidev/*`, vitepress |
| `setup/` | all of the above, plus the public exports of `@slidev/client` and `@slidev/types` | Slidev's other packages, vitepress |
| `src/node/` | `src/domain/`, `@lincyaw/kernel`, Node libraries | vue |

Never import a framework's internal paths, nor another plugin package: contracts two plugins share belong in the kernel (business services) or the host (host tokens).

(plugin-components)=
# Components

(plugin-components-host)=
## Through the host only

Components live in `components/`, and the web form and the slides both use them. A component gets the step state and services from `@lincyaw/host` only and never uses Slidev or VitePress directly, so either form can render it:

```vue
<script setup lang="ts">
import { useMessages, useStepState } from '@lincyaw/host'
import { MESSAGES } from '../src/domain/messages.ts'

defineProps<{ question: string, choices: string[] }>()
// The block's second state (step 1 inside it): the results
const results = useStepState({ from: 1 })
const t = useMessages(MESSAGES)
</script>

<template>
  <section class="pm-poll">
    <h3>{{ question }}</h3>
    <ol>
      <li v-for="choice in choices" :key="choice">{{ choice }}</li>
    </ol>
    <p v-if="results.reached">{{ t.results }}</p>
  </section>
</template>
```

(plugin-components-rules)=
## Rules

- **The look is a pure function of the step**: the same step always looks the same, going back included. `useStepState({ from, to })` gives the state of a range of steps inside the block (`active`, `reached`, `done`), counted from the step at which the block appears; `useStepScope` registers the block's k-th step with the host.
- **Follow the block's visible range**: `useStepState(useBlockStepRange())` includes the block's and its parents' `at` and `until` limits; `until` is the first hidden step. Use it to stop background resources such as media. `useStepState({ from, to })` continues to describe the component's own steps within its block.
- **Reduced motion**: animations read `usePrefersReducedMotion()` and show the final state when it is on.
- **Animations in time**: `useStepTime({ until })` gives the milliseconds since the component's step began, `Infinity` once the step is settled (after going back, in the document view, under reduced motion, from `until` on); a lecture's playback and video export drive it with the lecture's time. The look is a pure function of (step, time in the step): pause the animation library's timeline and seek it when the time changes.
- **Named actions**: `useActions(element, { name: (seeking) => … }, { clear })` names the component's actions, and its buttons call the returned `run(name)`; a recorded lecture keeps the click, and ``{cue to=<block>}`click <name>` `` in the narration runs it when it is said.
- **Configuration and services**: `useSectionConfig(plugin id)` is the global configuration merged with the section's `{config}`; `useService(token)` gets a browser service; `useSharedState` keeps state in step across windows or devices, under a key that starts with the plugin id.
- **Static export**: when exporting PDF and PNG, the host replaces a component that has a fallback with its fallback; read `useStaticRender()` to decide yourself.
- **Error isolation**: renderers wrap every plugin component in a boundary, so a component that throws breaks only itself; do not wrap it again.
- **Styles**: colors, fonts and spacing come only from the design system's tokens (`var(--pm-color-ink)`, `var(--pm-space-3)` and so on), controls are the host's components such as `PmButton`, `PmField` and `PmDialog`, icons are `PmIcon`, and dark mode follows the tokens.

(plugin-components-register)=
## Registering the browser side

`src/client/plugin.ts` exports the kernel plugin (`PluginDefinition`) by default: its manifest names `id`, `version`, `kernel` and the services it provides and requires; `setup(ctx)` calls `ctx.provide(token, implementation)`, and `dispose` releases workers and timers. The web form imports it by itself; in the slides, `setup/main.ts` registers it with `registerPresmiumPlugin`.

Set `presmium: { preview: { restartable: true } }` in the plugin package or document directory's `package.json` only when its browser modules can safely be rebuilt after unmounting. This promise covers components, viewer and client modules, and code injected through Vite. Kernel plugins must also set `restartable: true` on `PluginDefinition`, promising that `dispose` stops all background work and the same definition can run `setup` again. The workbench uses these declarations to retain loaded web preview modules: leaving a lecture unmounts its components and stops the kernel; returning starts it again. A missing declaration or failed module load causes the preview to be destroyed and reloaded. Execution, streaming answers, recording, and media must still be cleaned up.

(plugin-directives)=
# Directives and roles

(plugin-directives-spec)=
## From source to IR

A directive is a `DirectiveSpec`: a name, an argument, a body, options and `toIR`. `toIR` returns an IR node (usually a component node) and the number of steps it takes:

```ts
import { createRequire } from 'node:module'
import type { DirectiveSpec, PresmiumNodePlugin } from '@lincyaw/kernel'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const poll: DirectiveSpec = {
  name: 'poll',
  arg: true,
  body: true,
  options: { anonymous: 'boolean' },
  toIR(input, ctx) {
    const choices = (input.body ?? '').split('\n').map(line => line.trim()).filter(Boolean)
    if (choices.length < 2) ctx.report({ checkId: 'presmium.poll', severity: 'error', message: '{poll} needs at least two choices' })
    return {
      node: {
        type: 'component',
        plugin: 'presmium.poll',
        name: 'PmPoll',
        props: { question: input.arg ?? '', choices },
        fallback: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: input.arg ?? '' }] }] },
      },
      span: 1,
    }
  },
}

const plugin: PresmiumNodePlugin = { id: 'presmium.poll', version, kernel: '^1.0.0', directives: [poll] }
export default plugin
```

- `span` is the number of steps inside the block: the block has `span + 1` states (here the question and the results), and narration binds to them in order.
- `fallback` is the mdast static media (the notebook, PDF) show; without one, renderers write a line that links the web page.
- Components manage their child code by default. Containers that only organize content set `ownsCode: false` so child code keeps its own run controls and output in web and slides.
- `ctx` has the document's language `lang`, the section's configuration `config`, `parse` to turn MyST in the body into mdast, `report` for findings and `watch` to declare files it depends on.
- A directive named like a built-in one or another plugin's is an error; options it did not declare get a warning.

(plugin-directives-roles)=
## Inline roles

A `RoleSpec` in `roles` declares an inline role ``{name key=value}`content` ``, a `presmiumRole` node in the IR: pages show the content, and a role without content shows a mark in the presenter window and the notes. The lecture plugin's `{cue}` and `{say}` are roles.

(plugin-directives-passes)=
## Passes and checks

Passes in `passes` run once the whole document is compiled; they can rewrite the IR and read files of the workspace (through `ctx.src` and the anchor resolvers, so the compiler records them as dependencies). A pass with `after: 'execute'` runs after compile-time execution and reads the code's outputs. Checks in `checks` run in `presmium check` and return findings with their source position.

(plugin-services)=
# Services

(plugin-services-tokens)=
## Tokens and interfaces

A service is a token made with `defineService<T>(id)` and an implementation of it. Plugins talk to each other through services only: the provider declares the token in its manifest's `provides` and calls `ctx.provide` in `setup`; the user declares it in `requires` (optionally `optional`) and gets it with `ctx.get`, or `useService` in a component. The kernel starts plugins in dependency order; a plugin that lacks a required service is disabled, and the start report says why.

(plugin-services-node)=
## Node services and executors

`services(ctx)` of the Node entry returns a list of `[token, implementation]`; passes, renderers, checks and server routes get them with `ctx.service(token)`. `ctx.config` is the plugin's configuration in the document, `ctx.settings` the operator's settings in the workspace configuration's `settings.<plugin id>` (which documents cannot change), and `ctx.secret(name)` reads the operator's credentials.

Executors in `executors` run code at compile time: they use only the environment variables `RunContext` gives, start child processes through the process sandbox when there is one, and their `fingerprint` and `revision` go into the key of the execution cache. `environments` provides executors for one kind of the environments in the headmatter's `execute.environments`.

(plugin-routes)=
# Server routes

(plugin-routes-server)=
## On the Presmium server

`server(ctx)` of the Node entry returns routes and reverse proxies under `/__presmium/<plugin id>/`, in both `presmium dev` and `presmium serve`. Routes take and give Fetch API requests and responses:

```ts
import { jsonResponse } from '@lincyaw/kernel'

const plugin: PresmiumNodePlugin = {
  id: 'presmium.poll',
  version,
  kernel: '^1.0.0',
  server: () => ({
    routes: {
      // GET /__presmium/presmium.poll/votes
      votes: {
        role: 'reader',
        handle: async () => jsonResponse({ votes: [] }),
      },
    },
  }),
}
```

- `role` defaults to `editor`; request bodies are at most 1 MiB unless the route sets `maxBody`. Answer with the kernel's `jsonResponse(data)` and `problemResponse(status, message)`.
- Operations that change state ask for approval through `APPROVALS` first; writes to a document's directory go through the `DOCUMENT_FILES` service, not straight to files.
- The browser calls a route with `useServer().fetch(plugin id, path)`. In static outputs `useServer().available` is false, and the component degrades.

(plugin-routes-tools)=
## Agent tools

An `AgentTool` in `tools` becomes an MCP tool: `name`, `description`, the JSON Schema of its input and its `kind`. Every token may use `read` tools; `operate` and `spend` tools are approved before they run.

(plugin-views)=
# Views

(plugin-views-viewer)=
## Extending the IR runtime

The IR runtime `@lincyaw/viewer` renders the web form. A plugin's `src/client/viewer.ts` exports a viewer plugin `(ctx) => void` by default, which can register runtime views (`registerView`, such as the present view), node renderers (`registerNodeRenderer`), components (`registerComponent`), actions (`registerAction`) and layers (`registerLayer`). It imports `@lincyaw/viewer` for its types only:

```ts
import type { ViewerPlugin } from '@lincyaw/viewer'

const plugin: ViewerPlugin = (ctx) => {
  // In the present view, the key R shows the next step
  ctx.registerAction({ id: 'poll.next', keys: ['r'], run: viewer => viewer.next() })
}
export default plugin
```

(plugin-views-operations)=
## Operations that replay

Lectures record and replay what happens on the page. When the user does something worth replaying, report `{ type, data }` through `OPERATIONS` (with sections, blocks and relative coordinates, never pixels), and register its replay with `onReplay` in the kernel plugin's `setup`. Replaying operations one by one and replaying them at once after a seek must give the same picture.

(plugin-renderers)=
# Renderers

(plugin-renderers-new)=
## A new renderer

A renderer is the `renderer` field of a Node entry: `id`, `support(node)` (`full`, `degraded` or `none`), `build(doc, ctx)` and, optionally, `dev(doc, ctx)`. `build` gets the IR without the blocks `{only}` left out, writes its output to `ctx.outDir` and its intermediate files to `ctx.workDir`. Local files that blocks name are found with `ctx.localAsset` and published with the output; text written into the output is Chinese or English by `deckLocale(ctx.lang)`. `presmium build --to <id>` selects it, and a document's `renderers.<id>.package` can name its package.

(plugin-renderers-extensions)=
## Extending the existing renderers

`rendererExtensions` decides how a plugin's components appear in the slides and the notebook: a `slides` extension returns Slidev Markdown, a `notebook` extension returns cells (a string is a Markdown cell, an object may be a code cell). Without an extension, the slides write the component's tag and the notebook shows its `fallback`.

```ts
rendererExtensions: {
  notebook: { components: { PmPoll: node => `**${String(node.props.question)}**` } },
},
```

(plugin-messages)=
# Interface text

(plugin-messages-catalog)=
## Chinese and English

Each plugin keeps its own zh-CN and en text, in `src/domain/`:

```ts
export const MESSAGES = {
  'zh-CN': { results: '投票结果' },
  'en': { results: 'Results' },
}
```

Components use `useMessages(MESSAGES)`, other code `MESSAGES[currentLocale()]`. The page's `<html lang>` (from the document's `lang`) decides the language, and the browser's language when there is no text in it; never decide the language yourself. Text written into outputs at compile time (directives, passes, renderers) is chosen by `deckLocale(ctx.lang)`.

(plugin-testing)=
# Testing plugins

(plugin-testing-integration)=
## Integration tests only

A plugin's tests run the real CLI, build real outputs and open a real browser; they do not test single functions in isolation, nor mock Slidev or VitePress, and each acceptance criterion gets one or two cases. `presmium(cwd, args)` of `@lincyaw/cli/testing` runs the real `presmium` command in a child process:

```ts
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@lincyaw/cli/testing'
import { expect, it } from 'vitest'

const PLUGIN = fileURLToPath(new URL('..', import.meta.url))

it('builds the poll into the web page', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'poll-'))
  writeFileSync(join(dir, 'lecture.md'), `---\nplugins: ['${PLUGIN}']\n---\n\n## Poll\n\n\`\`\`{poll} Which one?\nA\nB\n\`\`\`\n`)
  const { code, stdout, stderr } = await presmium(dir, ['build', '--to', 'web'])
  expect(code, stdout + stderr).toBe(0)
  expect(readFileSync(join(dir, 'dist/ir.json'), 'utf8')).toContain('PmPoll')
})
```

A document's `plugins` may name a plugin's directory by its absolute path. Test the behavior in both browser forms with Playwright on built sites: build a test document in `beforeAll`, then open its web page and its slides.

(plugin-testing-publish)=
## Before publishing

After `pnpm pack`, `pnpm add -D <tarball>` in another project: `presmium check` should find no problem and the build should pass; then look at the component on the web page and in the slides. The plugin project `presmium new --type plugin` makes already has this layout and an integration test that runs.
