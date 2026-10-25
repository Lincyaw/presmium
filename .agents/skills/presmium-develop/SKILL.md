---
name: presmium-develop
description: "Develop, evaluate and debug a Presmium plugin: directives that compile MyST to IR nodes, Vue components shown in the web page and the slides through @lincyaw/host, static fallbacks and notebook output, browser services, server routes, compile passes, executors and exporters, with peer dependencies, bilingual text, reversible steps and the design system. Use when creating or changing a Presmium plugin project (one made by `presmium new --type plugin`), reading why a plugin does not load, render or step correctly, or proving a plugin works with integration tests that run the real presmium CLI, builds, dev servers and browsers. 开发、调试、测试 Presmium 插件时使用。"
---

# Developing a Presmium plugin

Presmium compiles a MyST Markdown document (`lecture.md`) to an intermediate representation (IR), a JSON
document of sections and blocks. Renderers turn the IR into outputs: the web page and the slides are both
pages of Presmium's prebuilt viewer, which renders the IR in the browser; the notebook and the exports (PDF,
PNG, PowerPoint) are static. A plugin is an npm package that a document lists under `plugins` in its
frontmatter. It can add:

- directives (`:::{name}`) that become IR nodes, usually a `component` node;
- Vue components that show those nodes, one component for the web page and the slides alike;
- a static fallback (mdast) and notebook cells for the outputs that cannot run a component;
- browser services, toolbar entries, recorded operations and viewer extensions;
- server routes under `presmium dev` and `presmium serve`, compile passes, executors, checks, exporters.

Start from the behavior the user wants (who does what, and what they see in which output), then pick the
smallest extension point that gives it. Do not implement every extension point for one feature.

## The project

A project made by `presmium new --type plugin` contains:

| Path | What |
|---|---|
| `package.json` | `exports["./presmium"]` is the Node entry; `files` lists `components` and `src`; Presmium's packages are peer dependencies |
| `src/domain/index.ts` | Pure TypeScript shared by both sides: the plugin id, component names, data shapes, the zh-CN and en text |
| `src/node/presmium.ts` | The Node entry: default export `PresmiumNodePlugin` (directives, server routes, ...) |
| `components/*.vue` | Components; the file name is the component name a `component` node refers to |
| `src/client/plugin.ts` | Optional: the browser plugin (`PluginDefinition`) that provides services |
| `src/client/viewer.ts` | Optional: a viewer extension (views, key actions, layers, node renderers) |
| `vite.config.ts` | Optional: Vite plugins and Vue compiler options for the viewer's build |
| `example/lecture.md` | A document that lists the plugin by its directory (`plugins: [..]`) |
| `test/*.test.ts` | Integration tests (Vitest) that run the real CLI on the example |
| `AGENTS.md` | The project's own conventions; read it first |

`pnpm dev` runs `presmium dev example --to web,slides`, `pnpm check` and `pnpm build` run `presmium check
example` and `presmium build example`, `pnpm test` runs the tests. The example names the plugin by its
directory, so it runs the sources as they are, neither packed nor installed.

The full contract, with the shapes of every field and example code, is in
[the plugin reference](references/plugin.md). How to prove behavior is in [testing](references/testing.md).

## From the task to the extension point

| The user wants | Write | Done when |
|---|---|---|
| New syntax that shows something interactive | A directive that returns a `component` node with props and a `fallback`; a component in `components/` | `presmium check` is clean, the component works in the web page and the slides, the notebook shows the fallback |
| A notebook cell other than the fallback | `rendererExtensions.notebook.components.<Name>` | The `.ipynb` holds the cells |
| Something the page does across components (a service, a toolbar entry) | `src/client/plugin.ts` with `setup`/`dispose` | It starts in both forms and `dispose` releases everything |
| Data kept or computed on the machine | A server route (`server()`), called with `useServer().fetch` | Works under `presmium dev`; the component hides or degrades it in a built site (`useServer().available` is false) |
| Work on the whole IR at compile time | A compile pass (`passes`) | The IR (`presmium ir`) shows the change; dependent files are watched |
| Running code of a language at build time | An executor (`executors`) | Outputs are recorded in the IR and cached |
| A diagnostic on the document | `ctx.report` in a directive or a `checks` entry | `presmium check` prints it with the source line |
| A heavy output made on request (video, PDF) | `exporters` | The job writes its files into `ctx.outDir` |
| A new view, key, or layer over the presentation | `src/client/viewer.ts` | Shows in the views it targets, in both forms |

Writing documents is the `presmium-author` skill (for `example/lecture.md`); animations are
`presmium-animate`; presenting is `presmium-present`.

## Rules that affect users

- **Layering.** `src/domain/` is pure TypeScript: no Vue, no `@lincyaw/host`, no Node built-ins (`node:fs`
  and `fs` alike). `components/` and `src/client/` use `src/domain/`, `@lincyaw/kernel`, `@lincyaw/host`,
  Vue and browser libraries, and get step state, configuration, text and services from `@lincyaw/host`
  only, so they run in both forms. `src/node/` uses no Vue. `@lincyaw/viewer` is imported as types only.
  Never import another plugin package, `@lincyaw/server`, `@lincyaw/web`, `@lincyaw/workspace`, `vitepress`,
  `@slidev/*`, or any package's internal paths; use public exports. Two plugins cooperate through a service
  token, not imports.
- **Peer dependencies.** `@lincyaw/kernel`, `host`, `viewer`, `compiler` (and `vue`) are peer dependencies,
  so the plugin shares one copy (injection keys, service tokens) with the Presmium that loads it. Presmium
  checks the ranges before importing the plugin and reports `plugin "<name>" (...) is not loaded: it needs
  <package> <range> (peerDependencies), and <version> is installed`; the build goes on without the plugin.
  The Node entry declares `kernel: '^1.0.0'` (the plugin contract) and its `version` read from
  `package.json`; a `kernel` range that excludes the installed contract is reported the same way.
- **Reversible steps.** A component's look is a pure function of the step (`useStepState`), and an
  animated one a pure function of (step, time in step) (`useStepTime`). Stepping back, jumping, the lecture
  replay and the frame-by-frame video export then all show the same picture. User actions that change the
  look are named actions (`useActions`) or recorded operations, replayed in order.
- **Two languages.** Each plugin keeps its own zh-CN and en text. Components pick by the page's language
  with `useMessages(CATALOG)` (outside components `CATALOG[currentLocale()]`); never read `<html lang>`
  yourself. Text written into outputs at compile time follows the document's `lang`:
  `CATALOG[deckLocale(ctx.lang)]`. The document's default language is `zh-CN`.
- **Static outputs.** Give every component node a `fallback` (mdast) that says what the component shows.
  The notebook and the PDF, PNG and PowerPoint exports use it; without one the notebook writes a line that
  links to the web version and the build report lists the block.
- **Design system.** Colors, fonts, spacing, radii and shadows come from the `--pm-*` tokens, so dark mode
  and the publishing high-contrast mode follow; controls are `Pm*` components or `pm-ui-*` classes; icons are
  `PmIcon` names, never emoji or glyphs such as ✓ ▶. Components in a document set `--pm-text-sm` and
  `--pm-text-md` in `em` on their root, so they scale with the slides.
- **Resources.** Workers, timers, subscriptions, media and streams stop when the component unmounts or the
  plugin's `dispose` runs (the page is stopped on `pagehide` and started again from the back/forward cache).
  Behavior that only recovers after a reload is a bug.
- **Errors stay local.** The viewer wraps each plugin component in an error boundary; a failing component
  shows its error in place and in the presenter view's count. Do not wrap it again yourself.
- **Sources ship as `.ts` and `.vue`**, not compiled; relative imports end in `.ts`; use only erasable
  TypeScript syntax.

## Evaluate and debug with real runs

Reproduce with the smallest document first (the example, or a copy of it in a temporary directory), then
read the first diagnostic, not the last.

| Command | Shows |
|---|---|
| `presmium check example` | Compile diagnostics and the plugins' checks, with file and line; exit code 0 no errors, 1 error findings, 2 usage or internal error; `--json` for a machine-readable result |
| `presmium ir example` | The compiled IR as JSON (`--out <file>` writes it): the nodes your directive produced, their `at`, `span`, props and fallback |
| `presmium build example --to notebook --out <dir>` | `<dir>/ir.json` and the notebook; the fastest build that exercises the directive and the fallback |
| `presmium build example` | Every renderer of the document into `example/dist/` (`web/`, `slides/`, `notebook/`) |
| `presmium dev example --to web,slides` | Dev servers that recompile on save; it prints one line per renderer (`web  <url>`, `slides  <url>`) and `server  <url>`, the Presmium server with the plugin's routes |

Common failures and where they come from:

| Symptom | Cause to check |
|---|---|
| ``{name}: unknown directive; is the plugin that provides it listed in `plugins`?`` | The document does not list the plugin, the path in `plugins` is wrong, or the plugin was not loaded (look for a `presmium.plugins` error above it) |
| `plugin "..." is not loaded: ...` | Peer dependency ranges or the `kernel` range do not match the installed Presmium; or the Node entry threw on import |
| `{name} is only supported at the top level of a section or in {slide} and {only}` | The directive is nested in another directive or a list |
| The block shows the fallback or a "web version" line in the web page | No component with the node's `name` in `components/` (the name is the file name), or the node's `plugin` is not the plugin's `id` |
| The component shows an error box | Its `setup` or template threw; the message is in the box and in the browser console (`[presmium] ...`) |
| The component's look does not undo on step back | State kept in the component instead of derived from `useStepState`/`useStepTime` |
| The route answers 404 or the button is missing | No Presmium server (a built site); the route name or plugin id differ; the route's `role` is above the caller's |
| A file the plugin reads does not trigger recompilation | It was read without `ctx.src`/`ctx.resolvers` and not declared with `ctx.watch` |
| A dev page reloads once on first open | Vite found dependencies late; run with `DEBUG=vite:deps` and look for "new dependencies found" |

In the browser, check both forms (the web page and the slides at `?slide=<n>&step=<k>`), stepping forward,
back and jumping; light and dark; a narrow window (below 768 px); the presenter view's start report lists
each browser plugin as started, degraded, disabled or failed.

## Done

Write the change, then prove it with the cheapest test that crosses the real boundary
([testing](references/testing.md)): one or two integration cases per thing the plugin promises, run
alone. Report the behavior after the change, why it sits at that extension point, what was run (passed,
skipped, not run), and what remains unverified (external services, other browsers, a packed install).
Before publishing: choose a `license`, keep `files` to `components` and `src`, keep the keywords
`presmium` and `presmium-plugin`, and document the directive's syntax in the README for document authors.
