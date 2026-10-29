---
name: presmium-maintain
description: "Work on the Presmium repository itself: evaluate its architecture, locate faults and change the workbench and the DeepSeek Harness (dsh) bundle, the viewer, the renderers, the workspace service, packaging and releases, and the repository's tests; debug the studio (service logs, pnpm debug:studio evidence, preview loading and stalls) and measure performance. Use in the Presmium monorepo when a change touches packages/, docs/, scripts/ or e2e/, not for a plugin project made by `presmium new --type plugin` (that is presmium-develop). 维护和开发 Presmium 仓库本身时使用。"
---

# Maintaining the Presmium repository

This skill is for work inside the Presmium monorepo. It is not shipped to users. The plugin contract
(package layout, directives, IR nodes, components, browser plugins, viewer extensions, server routes,
executors, exporters, static fallbacks, bilingual text, the design system for components) is in the
shipped skill `presmium-develop`; read `presmium-develop/references/plugin.md` and
`presmium-develop/references/testing.md` for those, and this skill for what only applies to the
repository. Writing documents is `presmium-author`, animations `presmium-animate`, presenting and the
narrated lecture `presmium-present`.

Words used throughout, as in the user-facing skills: a **document** is a folder with `lecture.json` (what the
CLI's `[deck]` argument names); a **workspace** is a folder with `presmium.workspace.yaml` holding several
documents; a **form** is what a document is built into (`web`, `slides`, `notebook`, `lecture`); the
**lecture** is only the narrated playback and its video; the **studio** is the browser workbench that
`presmium studio` (in the repository `pnpm studio`) starts. The **IR** (intermediate representation) is the
derived runtime snapshot. The sole editable document IR is `lecture.json`, defined by `packages/kernel/src/contracts/document.ts` and validated by `validateDocument`; runtime types are in `packages/kernel/src/ir.ts`.

Start from the behavior the user wants to change, then find the package responsible for it ([Put the
behavior at the right boundary](#put-the-behavior-at-the-right-boundary)). Your report states who sees
what change after which action, and which real run showed it.

## From the task to what to read

| Task | Look at first | Done when |
|---|---|---|
| Analyse the architecture, weigh a design trade-off | `docs/domain-model.md`, `docs/architecture.md`, the contract files ([Read enough to decide](#read-enough-to-decide)), the actual imports | Benefit, cost, preconditions and priority argued from code evidence; verified problems kept apart from risks; no code change needed |
| Fix a check, build or preview problem | The user's command on a minimal document, the first diagnostic, then `packages/compiler` or the renderer of the failing form (`packages/web`, `packages/render-slides`, `packages/render-notebook`) | The original command succeeds; the other forms and the static fallbacks still work |
| Add a directive, component or interaction | `presmium-develop/references/plugin.md`, an existing plugin with similar behavior, [packaging](references/packaging.md) | It compiles, works in the web page and the slides, static outputs degrade sensibly, docs and skills list it |
| Extend a renderer or the runtime view | The `Renderer` contract (`packages/kernel/src/ir.ts`) or the `ViewerPluginContext` contract (`packages/viewer/src/client/viewer-plugins.ts`) and a similar implementation | The renderer works from the IR only, never re-reads authoring files; support levels and missing content are reported; positions and steps are right |
| Change editing, preview sync or agent behavior | Workspace routes (`packages/workspace/src/node/routes.ts`), the preview protocol, the host adapter; [workbench and dsh](references/workbench.md) | After a save, an outside change, a reconnect or a review, source and preview still agree |
| Change the workbench's look or a UI primitive | `docs/design-system.md`, `packages/design/src/tokens.css`, `pm-ui-*` of `@lincyaw/design`, `packages/workbench/src/components.tsx`; [Repository conventions](#repository-conventions) | Public components and Figma variants implement the spec before business layout; relevant checks pass; seen in light and dark, on desktop and below 768 px |
| Upgrade dsh | [workbench and dsh](references/workbench.md#upgrading-dsh), `docs/design-dsh.md` sections 12 and 16 | The five upgrade-gate groups pass (see [Verify](#verify-the-behavior-you-changed)) |
| Change loading, dependencies or publishing; add an official package; release | The package's `exports`, peer dependencies, `.changeset/README.md`; [packaging](references/packaging.md) | Installed outside the monorepo it still builds and runs; structure checks pass |
| Build or change the VS Code extension | [packaging](references/packaging.md#the-vs-code-extension), `packages/vscode/README.md` | The VSIX's service starts a preview outside the repository and the package works in an ordinary VS Code window |
| A preview is slow, stalls or shows nothing in the studio | [Debugging and performance](references/debugging.md), `docs/debugging.md` | Evidence from logs and `pnpm debug:studio` names the step that fails; the same run passes after the fix |
| Measure or improve performance | [Debugging and performance](references/debugging.md#performance-changes), `docs/architecture.md` 1.1 | Before and after measured alternately under the same load; outputs unchanged |
| Change only skills or docs | [Hand over](#hand-over) | `node scripts/check-skills.mjs` prints `skills ok`; task paths and examples checked by hand |
| Run existing tests (only when the owner asks) | [Testing in the repository](references/testing.md) | Only the targeted cases ran; passed, skipped and not run reported separately |

"Done" is shown by a real run, not by a test suite: see [Verify the behavior you
changed](#verify-the-behavior-you-changed).

## Read enough to decide

Read the root `AGENTS.md` (a link to `CLAUDE.md`) first; its verification rules are authoritative.
Then, by task: `docs/domain-model.md` (responsibilities and invariants), `docs/architecture.md` (boundaries
and trade-offs), `docs/ir.md` (syntax to IR); for the workbench also `docs/design-dsh.md` and
`docs/rfc-workbench-uiux.md` (the UI/UX decision source; targets are distinct from implemented behavior)
and `docs/design-system.md` (formal controls, style ownership, asset registry and migration requirements);
for studio debugging `docs/debugging.md`. The docs are in Chinese and cited here by section number.
What 1.x keeps stable for users and the rules for package versions, `IR_VERSION` and `KERNEL_VERSION`
are in `site/reference/lecture.json` (the page "接口与版本").

The compiler honors an explicit `workspaceRoot`; otherwise it finds the nearest ancestor
`presmium.workspace.yaml` without crossing the git root, then falls back to the git root or document
directory. Anchor paths use this logical workspace root. A nested workspace's pinned git reads and
permanent links must translate to actual repository paths without widening ordinary file reads.

The source is the contract: `packages/kernel/src/contracts/` (re-exported together by
`packages/kernel/src/contracts.ts`, the package's `./contracts` entry) for plugins and services,
`packages/kernel/src/ir.ts` for documents and rendering, `packages/host/src/contracts.ts` for the browser
host. Read the types and callers you need; do not copy the package list into an answer. When a doc and the
code disagree, say so and state the impact.

For framework interfaces read the local docs in `vendor/docs/` (DeepSeek Harness under `dsh/`, the MCP
TypeScript SDK under `mcp/`; run `pnpm docs:fetch` when missing), not the frameworks' compiled output.
Undocumented framework interfaces the code still relies on, and the tests that guard them, are listed in
`docs/architecture.md` 9.1; the dsh limitations and their workarounds in `docs/design-dsh.md` section 16.

## Put the behavior at the right boundary

The normalized editable document IR in `lecture.json` is the single source of truth; the compiler derives a runtime snapshot; the web page, the
slides, the notebook and the exports consume the IR. The web page is the primary form; for an interactive
feature also decide what a user sees in static output, without an executor and offline.

Prefer an existing plugin, service or render extension point and customize it through public interfaces.
When a new capability is needed:

- Syntax, references, execution output and diagnostics belong to the compile side. Files the compile
  depends on are registered so edits trigger recompilation: a directive calls `ctx.watch(...files)` on its
  `DirectiveContext`; a compile pass reads through `ctx.src` and `ctx.resolvers` and calls `ctx.watch` on its
  `PassContext` (both in `packages/kernel/src/ir.ts`).
- Components and browser logic get steps, configuration and services only through `@lincyaw/host`. One step
  gives one look, also after going forward and back.
- Plugins cooperate through service contracts in `@lincyaw/kernel` or `@lincyaw/host`, never by importing
  one another. `src/domain` stays pure TypeScript; Node and browser adapters each handle their external
  systems.
- Changing the source is the job of the workbench and the workspace service; outputs talk to the workbench
  through the versioned preview protocol (`docs/design-dsh.md` section 4). DeepSeek Harness interfaces appear
  only in `packages/dsh` and the launcher `packages/studio`.

Studio's browser-only MCP actions use the existing shared workspace WebSocket and the ephemeral
`AuthoringClients` owner (`docs/rfc-mcp-authoring-actions.md` 9.1). Read client state, request an explicit
action, then read its receipt; admission is not completion. Exact source, client epoch, connection and
input revision are required. Only the browser channel may acknowledge, and it waits for executing
admission before invoking the existing source/playback control. Never add an MCP ACK tool, a per-tab
browser SSE, automatic compile/mode switch, estimated playing state or replay after disconnect.
`source.flush` covers the canonical source actor only. Explicit comment and component-property draft inspect/read use the
existing banks and bounded request results; passive state never contains draft content. Recording, unwired
form drafts, new-comment recovery and active-comment discard remain unavailable until their real owners are wired.
Mounted native reply/edit recovery and inactive exact-backup discard reuse the comment owner; actual editor
adoption must be verified before done, without a guessed selected thread or automatic submission.
Explicit component-property restore/discard reuse that bank with exact references, strict recovery forks
and current-input protection; they never Apply canonical parameters.

No dependency internals, no forks or patches. No package uses `vitepress` or `@slidev/*`: the web page and
the slides are both pages of Presmium's own prebuilt viewer (`docs/architecture.md` 1.1).
`scripts/check-layering.mjs` enforces this and the layers of `docs/architecture.md` section 3.

## Repository conventions

- **Two languages.** Every package keeps its own zh-CN and en text; browser code uses `useMessages` and
  `useLocale` from `@lincyaw/host`, compiled output follows the document's `lang` (`docs/architecture.md`
  5.7). The workbench needs both sets complete.
- **Tokens only.** Styles reference `packages/design/src/tokens.css`: no raw colors, no px (except in
  `@media` breakpoints), no ms/s; add a missing token there first (dark mode overrides only colors and
  shadows); icon sizes come from size tokens in CSS, not numbers in components. Color token names are also in
  `tokens.ts` `COLORS` and the design-system table of `docs/architecture.md` (5.10). After touching workbench
  or studio-frame styles run `node scripts/check-tokens.mjs`; move older styles of other packages into its
  scope when you change them.
- **Fix the primitive before the page.** Follow `docs/design-system.md`. Check `@lincyaw/design`'s
  `pm-ui-*` and the workbench's shared components (`packages/workbench/src/components.tsx`); add missing
  capability and the matching Figma component variant there before composing business screens. Business
  CSS owns layout, not private overrides of a public control's colors, dimensions, typography, borders or
  states, whether by descendant selector, business class or inline style. Migrate legacy styles in the
  touched scope instead of adding another override. A UI change is done only after it was seen in light
  and dark, on desktop and below 768 px; a wireframe or a passing token check is not visual acceptance.
- **Design rules.** `docs/design-system.md` 5.4–5.8 holds five norms; follow them in shared controls first:
  nested radius (inner = outer − gap when the gap is under 2rem and the result over 2px; tokens
  `--pm-radius-control-inset`, `--pm-radius-menu-item` in `tokens.css`), line wrapping (headings balance,
  paragraphs pretty; rules in `packages/design/src/typography.css`), complete states (hover, pressed with
  `--pm-color-pressed`, focus-visible, disabled; `PmSkeleton` for loading of a known shape, `PmEmpty` with a
  guiding line for empty panels, inline errors, never `window.alert`/`confirm`), message style (specific
  success and error text with a next step, no exclamation marks, English sentence case, zh-CN and en together)
  and motion (transform and opacity only, durations from tokens, loops off under reduced motion).
  `scripts/check-tokens.mjs` reports raw values and transitions or `@keyframes` of layout properties in its
  scope; the other rules are checked by looking.
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
  split panes use react-resizable-panels; sortable page lists wrap dnd kit through `PmSortableList`
  (body block dragging stays with BlockNote); the first-run welcome uses Harness's own `Modal`
  (`@deepseek-ai/dsh-client-ui-primitives`, see `packages/dsh/src/client/brand.tsx`). Use the existing
  design tokens.
- **Outputs (React):** dialogs, drawers, menus, popovers, tabs, segmented controls and presentation focus
  scopes wrap Radix Primitives through `@lincyaw/host`. Components read services and steps through the host,
  and subscribe to observable services with `useStore`; plugin setup uses the corresponding pure APIs.
  Theme observation goes through the host; icons use `@lincyaw/design` semantic names mapped to Lucide.
  The synchronized content tabs and step state remain Presmium-owned.
  The question-answer stream parses SSE with eventsource-parser.
- The full dependency table with licenses and what was rejected is `docs/architecture.md` section 12.

## Run the studio from the repository

`pnpm studio [directory]` starts the workbench; open the full address it prints, stop with `Ctrl+C`.
Editing and preview need no model. Without a directory it prepares, on first run, an independent copy of
the example in `.presmium/example-workspace` (its own git repository, with the speech cache and an
`AGENTS.md` for the AI) via `examples/animations/try.mjs`, and reuses it afterwards.

`examples/animations/` is the public example workspace: two complete Chinese courses (bubble sort and
animations written in code), plus nine topic guides indexed by `examples/animations/FEATURES.md` and
`features.json`. The guides cover the official plugins and public components, with real prerequisites
and explicit capability limits. `demo:check` and `demo:ir` still target the original two courses;
`demo:build` includes every document's web page and adds slides, notebook and narrated lecture for the
two complete courses only.

The original courses have matching narration audio committed in `<document>/.presmium/speech/` and
`speech.lock.json`; builds need no speech engine while those requests remain unchanged. After editing
narration, explicitly generate the affected targets with a real engine, commit their matching cache and
lock, and check the changed document without an engine using `presmium check <document>`.
Verification documents and deliberate failure cases stay in `e2e/fixtures/<group>/`; the old BPE
course stays only in `e2e/fixtures/regression/`. Existing user copies in `.presmium/example-workspace`
are reused and must not be overwritten to refresh the examples.

From source, `pnpm add -g ./packages/presmium` makes the global CLI this checkout; `pnpm add -g
./packages/studio` does the same for `presmium-studio`. Commands written for users use only pnpm and the
`presmium` CLI, never npm, npx or monorepo paths.

## Verify the behavior you changed

Follow the verification rule in the root `AGENTS.md`: write no new tests and run no test suites as
routine verification; handle existing tests as that rule specifies. Verify by running the real thing: build the document, start the service, open it in
a browser, and measure when speed is at stake. Existing tests stay runnable for when the owner asks for
them; [testing in the repository](references/testing.md) says where they live, the e2e fixtures and helpers,
ports, external conditions and the cost rules.

What the real run must show, by kind of change:

- A plugin component: it works in the web page and in the slides, and its static fallback (notebook, PDF or
  print) is understandable.
- Live preview: after a save the preview shows the new content at the same position.
- Shared loading or packaging: a consumer install outside the monorepo (`pnpm consumer [<directory>]`)
  builds and runs.
- A dsh version upgrade: `docs/design-dsh.md` section 12 requires its upgrade gate, which is a set of test
  cases ([workbench and dsh](references/workbench.md#upgrading-dsh)); since the rule above forbids routine
  suites, confirm with the owner before running it.

When only skill documents change, run `node scripts/check-skills.mjs` and check the task paths and examples
by hand; passing the format check does not make the guidance correct.

## Hand over

When behavior or commands change, update the docs and skills that really guide that task in the same
change, keep one complete definition and point to it from elsewhere. Which skills are shipped, and what
that requires of them, is in [packaging, Skills](references/packaging.md#skills). New directives go into
the author skill's directive reference ([packaging, A new directive](references/packaging.md#a-new-directive));
public interfaces are mirrored in the site docs; changes to public packages get a changeset
([packaging, Changesets](references/packaging.md#changesets-and-releases)).

Report the behavior after the change, why it sits at that boundary, what was actually run (passed, skipped,
not run), and which conditions remain unverified. Architecture advice names the concrete condition that
would trigger a refactor; do not argue for a rewrite only because there are many packages or contracts.
Without a request to commit or publish, leave a reviewable change.
