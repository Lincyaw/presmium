---
name: presmium-develop
description: "Develop, evaluate and debug a Presmium plugin: directives that compile MyST to IR nodes, React components shown in the web page and the slides through @lincyaw/host, static fallbacks and notebook output, browser services, server routes, compile passes, executors and exporters, with peer dependencies, bilingual text, reversible steps and the design system. Use when creating or changing a Presmium plugin project (one made by `presmium new --type plugin`), reading why a plugin does not load, render or step correctly, or proving a plugin works with integration tests that run the real presmium CLI, builds, dev servers and browsers. 开发、调试、测试 Presmium 插件时使用。"
---

# Developing a Presmium plugin

## What Presmium does with a plugin

These words are used throughout this skill and its references:

- **Document**: what an author writes and builds: a folder with a `lecture.md` (MyST Markdown with YAML
  frontmatter), plus its media. Commands of the `presmium` CLI take a document folder as their `[deck]`
  argument.
- **Section**: the part of a document under one `##` heading; one slide when presented. **Block**: one piece
  of a section: on-screen content (ordinary text, code, images, tables, formulas or directives), or
  **narration** (the script spoken or shown as captions). New documents use `contentModel: blocks`:
  ordinary Markdown is on-screen content and explicit `{narration}` binds the script to a step. Legacy
  documents without that field retain their implicit paragraph-narration rules.
- **Step**: a position inside a section when presenting; pressing next moves one step. A block appears at
  a step and may have internal steps of its own.
- **Directive**: a MyST block `:::{name} argument` ... `:::` (or ```` ```{name} ````); **role**: an inline
  ``{name}`text` ``.
- **IR** (intermediate representation): the JSON that Presmium compiles a document into: a list of sections,
  each a list of blocks, each holding one **node**, which is what the block shows: Markdown, code, or a
  `component` node (a React component by name, with props). `presmium ir` prints it.
- **mdast**: the JSON syntax tree of Markdown (the format of remark and unified: `{ type: 'paragraph',
  children: [{ type: 'text', value: '...' }] }`). Markdown inside the IR is mdast.
- **Form**: what a document is built into: the web page, the slides, the notebook (`.ipynb`), the lecture
  (narration synthesized or recorded and played over the presentation, and its video). A **renderer** is
  the part of Presmium that produces one form; its id (`web`, `slides`, `notebook`, `lecture`) is what
  `renderers` in the frontmatter and `--to` take.
- **Viewer**: Presmium's prebuilt browser app that shows the IR. The web page and the slides are both
  viewer pages, so they run your React components. The notebook and the exports (PDF, PNG, PowerPoint) are
  static: they cannot run a component and show its **fallback**, an mdast tree the directive supplies.

A **plugin** is an npm package that a document lists under `plugins` in its frontmatter. The compiler
imports the plugin's Node file (the **Node entry**) to learn its directives; the viewer loads its React
components and browser files. What a plugin can add is listed in "From the task to the file" below.

Start from the behavior the user wants (who does what, and what they see in which form), then pick the
smallest extension point that gives it. Do not implement every extension point for one feature.

## The project

`presmium new --type plugin` made this project. It is a complete, working plugin: the directive
`{greeting}` becomes the component `GreetingCard`, which says hello; under `presmium dev` the card has a
Wave button that calls the plugin's server route `waves`, which counts the waves.

| Path | What it is | Edit it to |
|---|---|---|
| `package.json` | `exports["./presmium"]` points to the Node entry; `files` lists `components` and `src`; Presmium's packages (`@lincyaw/kernel`, `host`, `viewer`, `compiler`) and `react`/`react-dom` are peer dependencies, and the `presmium` CLI with its renderers are dev dependencies | Add runtime libraries (`dependencies`), rename the package |
| `src/domain/index.ts` | Pure TypeScript shared by both sides: the plugin id `PLUGIN_ID`, the component name, data shapes, the zh-CN and en text `GREETING_MESSAGES` | Change text, add shared types and parsing |
| `src/node/presmium.ts` | The Node entry: its default export (type `PresmiumNodePlugin`) declares the directive `greeting` and the server route `waves` | Change what the directive accepts and produces; add routes, passes, checks |
| `components/GreetingCard.tsx` | The component; the file name is the name a `component` node refers to | Change what the reader sees and does in the web page and the slides |
| `example/lecture.md` | A document that uses the directive; its `plugins` lists `..`, the plugin's own directory | Add the syntax you are building, to try it |
| `test/plugin.test.ts` | Integration tests (Vitest) that run the real CLI on the example | Prove the new behavior |
| `vitest.config.ts`, `tsconfig.json`, `pnpm-workspace.yaml` | Test timeout (180 s), TypeScript settings, which packages may run install scripts | Rarely |
| `README.md` | For people who use the plugin: its syntax and how to install it | Document the directive for document authors |
| `AGENTS.md`, `.agents/skills/` | The project's conventions; this skill and `presmium-author` | Read first |

Files you add when the feature needs them (Presmium finds the first, second and fourth by these exact paths):

| Path | What it is |
|---|---|
| `src/client/plugin.ts` | The browser plugin: starts once per page, provides services and toolbar entries |
| `src/client/viewer.ts` | A viewer extension: new views, key actions, layers, renderers for kinds of blocks |
| `src/shared/` | Code that runs in both Node and the browser |
| `vite.config.ts` | Vite plugins and JSX configuration for the viewer's build |

The **plugin id** is the package name with a leading `@` removed and `/` turned into `.` (`@me/poll` gives
`me.poll`); `presmium new` writes it into `src/domain/index.ts` as `PLUGIN_ID`, where you may change it. It names the plugin everywhere: in
`component` nodes, in its configuration `presmium: { <id>: ... }` in the frontmatter, in its route URLs.

The full contract, with the shape of every field and example code, is in
[the plugin reference](references/plugin.md). How to prove behavior is in [testing](references/testing.md).

## Run it and see it

```sh
pnpm install
pnpm test     # the integration tests (three cases)
pnpm dev      # presmium dev example --to web,slides
```

`pnpm dev` compiles the example, starts dev servers that recompile on save, and prints one line per
address:

```
web  <url>        the web page
slides  <url>     the slides
server  <url>     the Presmium server, which serves the plugin's routes
mcp  <url>/mcp (its token is in example/.presmium/server.json)
watching; IR in example/.presmium/dev/ir.json
```

The `mcp` line is the server AI agents connect to; you can ignore it. Open the `web` address: the
section "Hello" shows the card "Hello, reader!" with a Wave button. Open the `slides` address and press
the right arrow until that slide; it shows the same card.

Saving `example/lecture.md` recompiles and updates the pages. The Node entry is imported once, when
`presmium dev` starts: after changing `src/node/` or the `src/domain/` code it uses, stop the command
(Ctrl+C) and run `pnpm dev` again; the same holds after changing `plugins` or `renderers` in the
frontmatter (it warns you). After changing a component, reload the page if it has not updated by itself.

The `presmium` CLI is a dev dependency of the project: in a shell write `pnpm exec presmium <command>`
(or use the `pnpm check`, `pnpm build`, `pnpm dev` scripts). The commands below are written `presmium ...`
for short. The example lists the plugin by its directory, so every command runs the sources as they
are, neither packed nor installed.

## From the task to the file

| The user wants | What it is | Write | Done when |
|---|---|---|---|
| New syntax that shows something interactive | A **directive** turns the MyST block into an IR node; a **component** shows it | A `DirectiveSpec` in `src/node/presmium.ts` that returns a `component` node with props and a `fallback`; a `.tsx` file in `components/` | `presmium check example` prints `no problems`; the component works in the web page and the slides; the notebook shows the fallback |
| A notebook cell other than the fallback | A **renderer extension**: a function the notebook renderer calls for your component | `rendererExtensions.notebook.components.<ComponentName>` in the Node entry | The built `.ipynb` holds the cells |
| Something the page does across components (shared state, a toolbar entry) | A **browser plugin** that provides **services**: objects registered under a token that components and other plugins look up | `src/client/plugin.ts` with `setup` and `dispose` | It is listed as started in the presenter view's start report, in both forms, and `dispose` releases everything |
| Data kept or computed on the machine | A **server route**: an HTTP handler under `<server>/__presmium/<plugin id>/<route>` | `server()` in the Node entry; components call it with `useServer().fetch` | Works under `presmium dev`; in a built site, which has no server, `useServer().available` is false and the component hides or degrades the control |
| Work on the whole IR at compile time | A **compile pass**: a function that reads and changes the whole IR after the directives have run | `passes` in the Node entry | `presmium ir example` shows the change; editing a file the pass reads recompiles under `presmium dev` |
| Running code of a language at build time | An **executor**: runs code blocks and returns their output | `executors` in the Node entry | The outputs are in the IR (`outputs` of the code node) and cached in `.presmium/freeze/` |
| A diagnostic on the document | A **finding**: a message with severity and source line | `ctx.report` in a directive, or a `checks` entry | `presmium check example` prints it with the source line |
| A heavy output made on request (video, PDF) | An **exporter**: a job started from the studio (Presmium's browser workbench) or by an AI agent | `exporters` in the Node entry | The job writes its files into `ctx.outDir` |
| A new view, key, or layer over the presentation | A **viewer extension** | `src/client/viewer.ts` | Shows in the views it targets, in both forms |

Writing documents (for `example/lecture.md`) is the `presmium-author` skill.

## Rules that affect users

- **Layering.** `src/domain/` is pure TypeScript: no React, no `@lincyaw/host`, no Node built-ins (`node:fs`
  and `fs` alike). `components/` and `src/client/` use `src/domain/`, `@lincyaw/kernel`, `@lincyaw/host`,
  React and browser libraries, and get step state, configuration, text and services from `@lincyaw/host`
  only, so they run in both forms. `src/node/` uses no React. `@lincyaw/viewer` is imported as types only.
  Never import another plugin package, `@lincyaw/server`, `@lincyaw/web`, `@lincyaw/workspace`, `@lincyaw/mcp`, `vitepress`,
  `@slidev/*`, or any package's internal paths; use public exports. Two plugins cooperate through a service
  token, not imports. The full table is in [the plugin reference](references/plugin.md#layers).
- **Peer dependencies.** `@lincyaw/kernel`, `host`, `viewer`, `compiler` (and `react`, `react-dom`) are peer dependencies,
  so the plugin shares one copy (React context, service tokens) with the Presmium that loads it. Presmium
  checks the ranges before importing the plugin and reports `plugin "<name>" (...) is not loaded: it needs
  <package> <range> (peerDependencies), and <version> is installed`; the build goes on without the plugin.
  The Node entry declares `kernel: '^1.0.0'` (the plugin contract) and its `version` read from
  `package.json`; a `kernel` range that excludes the installed contract is reported the same way.
- **Reversible steps.** (The `use*` functions here come from `@lincyaw/host`; the plugin reference's
  section 7 lists them.) A component's look is a pure function of the step (`useStepState`), and an
  animated one a pure function of (step, time in step) (`useStepTime`). Stepping back, jumping, the lecture
  replay and the frame-by-frame video export then all show the same picture. User actions that change the
  look are named actions (`useActions`) or recorded operations (actions the lecture recording keeps and
  replays), replayed in order.
- **Two languages.** Each plugin keeps its own zh-CN and en text, as `GREETING_MESSAGES` does. Components
  pick by the page's language with `useMessages(CATALOG)` (outside components `CATALOG[currentLocale()]`);
  never read `<html lang>` yourself. Text written into outputs at compile time follows the document's
  `lang`: `CATALOG[deckLocale(ctx.lang)]`. The document's default language is `zh-CN`.
- **Static forms.** Give every component node a `fallback` (mdast) that says what the component shows.
  The notebook and the PDF, PNG and PowerPoint exports use it. Without one the notebook writes "The
  interactive component <name> can only be used in the web version." (a link when the document sets
  `renderers.notebook.webUrl`) and the build lists the block.
- **Design system.** Colors, fonts, spacing, radii and shadows come from the `--pm-*` CSS variables
  (tokens) that `@lincyaw/host` loads, so dark mode and the high-contrast mode follow; controls are the
  `Pm*` React components of `@lincyaw/host` (`PmButton`, ...) or its `pm-ui-*` CSS classes; icons are `PmIcon`
  names, never emoji or glyphs such as ✓ ▶. Components in a document set `--pm-text-sm` and `--pm-text-md`
  in `em` on their root, so they scale with the slides (see `GreetingCard.tsx`).
- **Resources.** Workers, timers, subscriptions, media and streams stop when the component unmounts or the
  plugin's `dispose` runs (the page is stopped on `pagehide` and started again from the back/forward cache).
  Behavior that only recovers after a reload is a bug.
- **Errors stay local.** The viewer wraps each plugin component in an error boundary; a failing component
  shows its error in place and is counted in the presenter view. Do not wrap it again yourself.
- **Sources ship as `.ts` and `.tsx`**, not compiled; relative imports end in `.ts`; use only erasable
  TypeScript syntax (types that can be deleted without changing the code: no `enum`, no `namespace`, no
  constructor parameter properties).

## Evaluate and debug with real runs

Reproduce with the smallest document first (the example, or a copy of it in a temporary directory), then
read the first diagnostic, not the last.

| Command | Shows |
|---|---|
| `presmium check example` | Compile diagnostics and the plugins' checks, with file and line, or `no problems`; exit code 0 no errors, 1 error findings, 2 usage or internal error; `--json` for a machine-readable result |
| `presmium ir example` | The compiled IR as JSON (`--out <file>` writes it): the nodes your directive produced, their `at` (the step they appear at), `span` (internal steps), props and fallback |
| `presmium build example --to notebook --out <dir>` | `<dir>/ir.json` and the notebook; the fastest build that exercises the directive and the fallback |
| `presmium build example` | Every renderer of the document into `example/dist/` (`web/`, `slides/`, `notebook/`) |
| `presmium dev example --to web,slides` | Dev servers that recompile on save (see "Run it and see it"); the current IR is in `example/.presmium/dev/ir.json`. `--to notebook` starts only the Presmium server, enough to call routes |

Common failures and where they come from:

| Symptom | Cause to check |
|---|---|
| ``{name}: unknown directive; is the plugin that provides it listed in `plugins`?`` | The document does not list the plugin, the path in `plugins` is wrong, or the plugin was not loaded (look above it for a finding with check id `presmium.plugins`) |
| `plugin "..." is not loaded: ...` | Peer dependency ranges or the `kernel` range do not match the installed Presmium |
| `cannot load plugin "...": <error>` | The Node entry threw while being imported, or its default export is not a plugin object |
| `{name} is only supported at the top level of a section or in {slide} and {only}; it is dropped` | The directive is nested in another directive or a list |
| The web page shows the fallback, or "Unregistered component <name>", instead of the component | No file `components/<name>.tsx` (the node's `name` is the file name), or the node's `plugin` is not the plugin's id |
| The component shows an error box | Its render function or an effect threw; the message is in the box and in the browser console (`[presmium] ...`) |
| The component's look does not undo on step back | State kept in the component instead of derived from `useStepState`/`useStepTime` |
| The route answers 404, or the button is missing | No Presmium server (a built site); the route name or plugin id differ |
| The route answers 403 | The route's `role` (`reader`, `editor` or `owner`) is above the caller's; the person running `presmium dev` or `presmium serve` is the owner |
| A file the plugin reads does not trigger recompilation | The pass read it without `ctx.src`/`ctx.resolvers` (which record what they read), or the directive did not declare it with `ctx.watch` |
| A dev page reloads once on first open | Vite found dependencies late; run with `DEBUG=vite:deps` and look for "new dependencies found" |

In the browser, check both forms, stepping forward, back and jumping. The slides take
`?slide=<n>&step=<k>` (slide from 1, step from 0) to open a slide at a step. Check light and dark and a
window narrower than 768 px. In the slides, press `p` to open the presenter view: its start report
lists each browser plugin as started, degraded, disabled or failed, and it counts component errors.

## Done

Write the change, then prove it with the cheapest test that crosses the real boundary
([testing](references/testing.md)): one or two integration cases per thing the plugin promises, run
alone. Report the behavior after the change, why it sits at that extension point, what was run (passed,
skipped, not run), and what remains unverified (external services, other browsers, a packed install).
Before publishing: choose a `license`, keep `files` to `components` and `src`, keep the keywords
`presmium` and `presmium-plugin`, and document the directive's syntax in the README for document authors.
