---
name: presmium-maintain
description: "Work on the Presmium repository itself: evaluate its architecture, locate faults and change the workbench and the DeepSeek Harness (dsh) bundle, the viewer, the renderers, the workspace service, packaging and releases, and the repository's tests; debug the studio (service logs, pnpm debug:studio evidence, preview loading and stalls) and measure performance. Use in the Presmium monorepo when a change touches packages/, docs/, scripts/ or e2e/, not for a plugin project made by `presmium new --type plugin` (that is presmium-develop). 维护和开发 Presmium 仓库本身时使用。"
---

# Maintaining the Presmium repository

This skill is for the Presmium monorepo and is not shipped. The plugin contract is in
`presmium-develop/references/plugin.md`; documents are `presmium-author`, animations `presmium-animate`,
presenting `presmium-present`.

Terms: a **document** is a folder with `lecture.json`; a **workspace** is a folder with
`presmium.workspace.yaml` holding several documents; a **form** is what a document is built into (`web`,
`slides`, `notebook`, `lecture`); the **studio** is the browser workbench started by `presmium studio`
(`pnpm studio` in the repository). `lecture.json` is the sole editable document IR
(`packages/kernel/src/contracts/document.ts`, validated by `validateDocument`); the compiler derives a
runtime snapshot (`packages/kernel/src/ir.ts`).

## From the task to what to read

| Task | Look at first |
|---|---|
| Architecture or design trade-off | `docs/domain-model.md`, `docs/architecture.md`, contract files, actual imports |
| Check, build or preview fails | The user's command on a minimal document, the first diagnostic, `packages/compiler` or the failing renderer |
| New directive, component or interaction | `presmium-develop/references/plugin.md`, a similar plugin, [packaging](references/packaging.md) |
| Renderer or runtime view | `Renderer` in `packages/kernel/src/ir.ts`, `ViewerPluginContext` in `packages/viewer/src/client/viewer-plugins.ts` |
| Editing, preview sync, agent behavior, dsh upgrade | `packages/workspace/src/node/routes.ts`, [workbench](references/workbench.md) |
| Workbench look or a UI primitive | `docs/design-system.md`, `packages/design/src/tokens.css`, `packages/workbench/src/components.tsx` |
| Loading, publishing, a new package, VS Code extension | [packaging](references/packaging.md), `.changeset/README.md` |
| Slow, stalled or blank preview; performance | [debugging](references/debugging.md), `docs/debugging.md` |
| Hosted cloud | [cloud](references/cloud.md), `docs/cloud.md` |
| Run existing tests (only when the owner asks) | [testing](references/testing.md) |

Start from the behavior the user wants changed and find the package responsible. Done means a real run
shows it ([Verify](#verify-the-behavior-you-changed)).

## Read enough to decide

Read the root `AGENTS.md` (a link to `CLAUDE.md`) first; its verification rules are authoritative. The
design docs in `docs/` are in Chinese and cited by section number. Version rules for packages, `IR_VERSION` and
`KERNEL_VERSION` are in the site page `site/reference/lecture.json` ("接口与版本").

The source is the contract: `packages/kernel/src/contracts/` (re-exported by
`packages/kernel/src/contracts.ts`), `packages/kernel/src/ir.ts`, `packages/host/src/contracts.ts`. When
a doc and the code disagree, say so and state the impact. For framework interfaces read `vendor/docs/`
(`dsh/`, `mcp/`; `pnpm docs:fetch` when missing), never compiled output. Undocumented framework
interfaces the code relies on are in `docs/architecture.md` 9.1; dsh limitations in `docs/studio.md`
section 15.

## Put the behavior at the right boundary

`lecture.json` is the single source of truth; the web page (primary form), slides, notebook and exports
consume the IR. For an interactive feature also decide what a user sees in static output, offline and
without an executor. Prefer an existing plugin, service or extension point.

- Syntax, references, execution output and diagnostics belong to the compile side. Files a compile depends
  on are registered with `ctx.watch(...)` on `DirectiveContext` or `PassContext`.
- Components get steps, configuration and services only through `@lincyaw/host`. One step gives one look,
  also after going forward and back.
- Plugins cooperate through service contracts in `@lincyaw/kernel` or `@lincyaw/host`, never by importing
  one another; host and contract packages are peer dependencies. `src/domain` stays pure TypeScript.
- Changing the source is the job of the workbench and the workspace service; outputs talk to the workbench
  through the preview protocol (`docs/studio.md` section 4). DeepSeek Harness interfaces appear only in
  `packages/dsh` and `packages/studio`.
- No dependency internals, forks or patches; no `vitepress` or `@slidev/*`. `scripts/check-layering.mjs`
  enforces the layers of `docs/architecture.md` section 3.

## Repository conventions

The language, token and primitive rules are in `CLAUDE.md`; in practice:

- **Two languages.** Terms come from `docs/glossary.md` (add new ones there first). After changing
  interface text run `node scripts/check-i18n.mjs --strict`; judged false positives go into
  `scripts/check-i18n.allow.json` with a reason.
- **Tokens and primitives.** Run `node scripts/check-tokens.mjs` after touching workbench or studio-frame
  CSS. Fill gaps in `pm-ui-*` or `packages/workbench/src/components.tsx` (states, loading, motion:
  `docs/design-system.md` section 4) before composing screens. A UI change is done after it was seen in
  light and dark, on desktop and below 768 px.
- **Resources.** Workers, timers and subscriptions are released when their lifetime ends; behavior that
  only recovers after a reload is not done.
- **Single user.** The workspace service serves one user. Student content is removed with
  `--audience student` at build time, not hidden in the page.
- **UI dependencies.** Reuse maintained components (Radix, dnd kit, BlockNote, Lucide;
  `docs/architecture.md` section 12); do not reimplement focus, keyboard, positioning or dragging.

## Run the studio from the repository

`pnpm studio [directory]` starts the workbench; open the full printed address, stop with `Ctrl+C`. Without
a directory it prepares an independent copy of `examples/gallery` in `.presmium/gallery-workspace` on
first run and reuses it afterwards; linked animation references become regular files. Preserve the older
`.presmium/example-workspace`; never overwrite user copies to refresh examples.

The unified gallery has 31 main documents: two courses, nine guides, the Fourier lesson, product film
and 18 animation references. `animation-library` links to `presmium-animate/gallery`; complete product
examples stay in the public gallery and method guidance stays in skill references.

The example's narration audio is committed in `<document>/.presmium/speech/` with `speech.lock.json`;
after editing narration, regenerate the affected targets with a real engine, commit cache and lock, and run
`presmium check <document>`. Verification documents go in `e2e/fixtures/<group>/`, never in the example.
Commands written for users use only pnpm and `presmium`.

## Verify the behavior you changed

No new tests, no routine suites (`AGENTS.md`). Build, start the service, open a browser, measure when speed
matters. The real run must show:

- A plugin component works in the web page and the slides; its static fallback is understandable.
- Live preview shows the new content at the same position after a save.
- Shared loading or packaging: `pnpm consumer [<directory>]` builds and runs outside the monorepo.
- A dsh upgrade passes the upgrade gate ([workbench](references/workbench.md#upgrading-dsh)); ask the
  owner before running it.

## Hand over

When behavior or commands change, update the docs and skills that guide that task in the same change, with
one complete definition pointed to from elsewhere ([packaging, Skills](references/packaging.md#skills)).
Public package changes get a changeset ([packaging](references/packaging.md#changesets-and-releases)).

Report the behavior after the change, why it sits at that boundary, what ran (passed, skipped, not run) and
what remains unverified. Architecture advice names the concrete condition that would trigger a refactor.
Without a request to commit or publish, leave a reviewable change.
