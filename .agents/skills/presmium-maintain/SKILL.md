---
name: presmium-maintain
description: "Work on the Presmium repository itself: evaluate its architecture, locate faults and change the workbench and the dsh bundle, the viewer, the renderers, the workspace service, packaging and releases, and the repository's tests; debug the studio (service logs, pnpm debug:studio evidence, preview loading and stalls) and measure performance. Use in the Presmium monorepo when a change touches packages/, docs/, scripts/ or e2e/, not for a plugin project made by `presmium new --type plugin` (that is presmium-develop). 维护和开发 Presmium 仓库本身时使用。"
---

# Maintaining the Presmium repository

This skill is for work inside the Presmium monorepo. It is not shipped to users. The plugin contract
(package layout, directives, IR nodes, components, browser plugins, viewer extensions, server routes,
executors, exporters, static fallbacks, bilingual text, the design system for components) is in the
shipped skill `presmium-develop`; read `presmium-develop/references/plugin.md` and
`presmium-develop/references/testing.md` for those, and this skill for what only applies to the
repository. Writing documents is `presmium-author`, animations `presmium-animate`, teaching
`presmium-present`.

Start from the behavior the user wants to change, then find the boundary responsible for it. A delivery
says who sees what change after which action, and how the really assembled system proves it.

## From the task to what to read

| Task | Look at first | Done when |
|---|---|---|
| Analyse the architecture, weigh a design trade-off | The target users' tasks, domain boundaries, the actual dependencies and contracts | Benefit, cost, preconditions and priority argued from code evidence; verified problems kept apart from risks |
| Fix a check, build or preview problem | The user's command, a minimal document, the first diagnostic, the compile or render entry | The original action succeeds; the related media and fallback paths still work |
| Add a directive, component or interaction | `presmium-develop/references/plugin.md`, an existing plugin with similar behavior, [adding packages and directives](references/packaging.md) | It compiles, both browser forms work, static outputs degrade sensibly, docs and skills list it |
| Extend a renderer or the runtime view | The `Renderer` or `ViewerPluginContext` contract and a similar implementation | No reading back of the source; support levels and missing content are reported; positions and steps are right |
| Change editing, preview sync or agent behavior | Workspace routes, the preview protocol, the host adapter; [workbench and dsh](references/workbench.md) | After a save, an outside change, a reconnect or a review, source and preview still agree |
| Change loading, dependencies or publishing | The package's `exports`, peer dependencies, the consumer install tests; [packaging](references/packaging.md) | Installed outside the monorepo it still builds and runs |
| A preview is slow, stalls or shows nothing in the studio | [Debugging and performance](references/debugging.md), `docs/debugging.md` | Evidence from logs and `pnpm debug:studio` names the step that fails; the same run passes after the fix |

Architecture reviews and read-only investigations need no code change.

## Read enough to decide

Read the root `AGENTS.md` (a link to `CLAUDE.md`) first. Then, by task: `docs/domain-model.md`
(responsibilities and invariants), `docs/architecture.md` (boundaries and trade-offs), `docs/ir.md` (syntax
to IR); for the workbench also `docs/design-dsh.md`; for studio debugging `docs/debugging.md`. Public
interfaces and the versioning rules for users are in `site/reference/lecture.md`.

The source is the contract: `packages/kernel/src/contracts/` (exported together from `contracts.ts`) for
plugins and services, `packages/kernel/src/ir.ts` for documents and rendering,
`packages/host/src/contracts.ts` for the browser host. Read the types and callers you need; do not copy the
package list into an answer. When a doc and the code disagree, say so and state the impact.

For framework interfaces read the local docs in `vendor/docs/` (DeepSeek Harness under `dsh/`, the MCP
TypeScript SDK under `mcp/`; run `pnpm docs:fetch` when missing), not the frameworks' compiled output.
Undocumented framework interfaces the code still relies on, and the tests that guard them, are listed in
`docs/architecture.md` 9.1; the dsh limitations and their workarounds in `docs/design-dsh.md` section 16.

## Put the behavior at the right boundary

The MyST source is the document's single source of truth; the compiler turns it into IR; the web page, the
slides, the notebook and the exports consume the IR. The web page is the primary medium; for an interactive
feature also decide what a user sees in static output, without an executor and offline.

Prefer an existing plugin, service or render extension point and customize it through public interfaces.
When a new capability is needed:

- Syntax, references, execution output and diagnostics belong to the compile side; files it depends on are
  registered through `ctx.src`, `ctx.resolvers` or `ctx.watch`, so edits trigger recompilation.
- Components and browser logic get steps, configuration and services only through `@lincyaw/host`. One step
  gives one look, also after going forward and back.
- Plugins cooperate through service contracts in `@lincyaw/kernel` or `@lincyaw/host`, never by importing
  one another. `src/domain` stays pure TypeScript; Node and browser adapters each handle their external
  systems.
- Changing the source is the job of the workbench and the workspace service; outputs talk to the workbench
  through the versioned preview protocol (`docs/design-dsh.md` section 4). DeepSeek Harness interfaces appear
  only in `packages/dsh` and the launcher `packages/studio`.

No dependency internals, no forks or patches. No package uses `vitepress` or `@slidev/*`: the web page and
the slides are both pages of Presmium's own prebuilt viewer (`docs/architecture.md` 1.1).
`scripts/check-layering.mjs` enforces the layers of `docs/architecture.md` section 3.

## Conventions that affect users

- **Two languages.** Every package keeps its own zh-CN and en text; browser code uses `useMessages` and
  `useLocale`, compiled output follows the document's `lang` (`docs/architecture.md` 5.7). The workbench
  needs both sets complete.
- **Tokens only.** Styles reference `packages/design/src/tokens.css`: no raw colors, no px (except in
  `@media` breakpoints), no ms/s; add a missing token there first (dark mode overrides only colors and
  shadows); icon sizes come from size tokens in CSS, not numbers in components. Color token names are also in
  `tokens.ts` `COLORS` and the design-system table of `docs/architecture.md`. After touching workbench or
  studio-frame styles run `node scripts/check-tokens.mjs`; move older styles of other packages into its
  scope when you change them.
- **Fix the primitive before the page.** A UI problem is first checked against `@lincyaw/design`'s
  `pm-ui-*` and the workbench's shared components (`packages/workbench/src/components.tsx`); add the
  capability there, not a second implementation in one panel. A UI change is done only after it was seen in
  light and dark, on desktop and below 768 px.
- **Resources and fallbacks.** New components have an understandable static fallback; Workers, timers and
  subscriptions are released when their lifetime ends. Behavior that only recovers after a reload is not
  done.
- **One copy of shared packages.** Host and contract packages are peer dependencies, so there is one set of
  React contexts, service tokens and one runtime. Sources ship as `.ts` and `.tsx`; relative imports end in `.ts`.
- **Single user.** The workspace service is a tool for one user. Student content is removed by building
  with `--audience student`, not by hiding it in the page or assuming roles in the author's service.

## UI dependencies

Reuse maintained components for generic interaction; Presmium keeps document operations, save conflicts,
compilation, reviews and preview sync, and does not reimplement focus, keyboard, positioning or dragging
that a dependency already handles.

- **Workbench (React):** dialogs and menus wrap Radix Primitives (`packages/workbench/src/components.tsx`);
  split panes use react-resizable-panels; the first-run welcome uses Harness's own `Modal`
  (`@deepseek-ai/dsh-client-ui-primitives`, see `packages/dsh/src/client/brand.tsx`). Use the existing
  design tokens.
- **Outputs (React):** dialogs, drawers, menus, popovers, tabs, segmented controls and presentation focus
  scopes wrap Radix Primitives through `@lincyaw/host`. Components read services and steps through the host,
  and subscribe to observable services with `useStore`; plugin setup uses the corresponding pure APIs.
  Theme observation goes through the host; icons use `@lincyaw/design` semantic names mapped to Lucide.
  The question-answer stream parses SSE with eventsource-parser.
- The full dependency table with licenses and what was rejected is `docs/architecture.md` section 12.

## Run the studio from the repository

`pnpm studio [directory]` starts the workbench; open the full address it prints, stop with `Ctrl+C`.
Editing and preview need no model. Without a directory it prepares, on first run, an independent copy of
the example in `.presmium/example-workspace` (its own git repository, with the speech cache and an
`AGENTS.md` for the AI) via `examples/animations/try.mjs`, and reuses it afterwards.

`examples/animations/` is the only public example: two Chinese lectures whose animations are written in
code (bubble sort, and animations written in code); their narration audio comes from the speech cache committed
with each lecture (`<lecture>/.presmium/speech/` and `speech.lock.json`), so builds need no speech engine.
After changing narration, rebuild the lecture with a configured speech engine, commit the updated cache and
lock, then run `pnpm demo:check` where no engine is configured to confirm the cache is complete. Feature
verification uses `e2e/fixtures/<group>/`; the old BPE lecture stays only in `e2e/fixtures/regression/` for
regression.

From source, `pnpm add -g ./packages/presmium` makes the global CLI this checkout; `pnpm add -g
./packages/studio` does the same for `presmium-studio`. Commands written for users use only pnpm and the
`presmium` CLI, never npm, npx or monorepo paths.

## Verify the behavior you changed

Verify by running the real thing: build the document, start the service, open it in a browser, and measure
when speed is at stake. Run only the targeted integration tests and lightweight structure checks directly affected by the change,
with one worker. Existing effective behavior tests remain in place; fixtures and expected behavior move with
public APIs. Do not run full test, demo or e2e suites without an explicit request. See
[testing in the repository](references/testing.md) for test locations, fixtures and environment conditions. Plugin components cover both forms and the needed static
fallback; live preview covers saving and keeping the position; shared loading or packaging covers the
consumer install; dsh changes run the matching upgrade gate (`docs/design-dsh.md` section 12).

When only skill documents change, run `node scripts/check-skills.mjs` and check the task paths and examples
by hand; passing the format check does not make the guidance correct.

## Hand over

When behavior or commands change, update the docs and skills that really guide that task, keep one complete
definition and point to it from elsewhere. Skills live in `.agents/skills` (`.claude/skills` links to it);
skills listed in `packages/dsh/package.json` `presmium.skills` are shipped and must stay self-contained,
without references to repository files. New directives go into the author skill's directive reference
([packaging](references/packaging.md)); public interfaces are mirrored in the site docs; changes to public
packages get a changeset.

Report the behavior after the change, why it sits at that boundary, what was actually run (passed, skipped,
not run), and which conditions remain unverified. Architecture advice names the concrete condition that
would trigger a refactor; do not argue for a rewrite only because there are many packages or contracts.
Without a request to commit or publish, leave a reviewable change.
