# Contributing to Presmium

Thank you for helping. This file covers the development setup, the tests, the layering rules and the agent skills. The design documents in `docs/` are in Chinese; `CLAUDE.md` is the short version of the conventions below (中文的约定见 `CLAUDE.md`).

## Development environment

- Node.js 22.19 or later and pnpm 11 (`corepack enable` picks the version in `package.json`).
- Python 3 on the `PATH` for compile-time execution; the notebook tests also need `nbformat`, `nbclient` and `ipykernel` (`python -m pip install nbformat nbclient ipykernel`).
- Playwright's Chromium for the end-to-end tests: `pnpm exec playwright install chromium` (Firefox and WebKit for the smoke tests are optional).

```sh
git clone https://github.com/Lincyaw/presmium.git
cd presmium
pnpm install
pnpm studio
pnpm test
pnpm add -g ./packages/presmium    # the global presmium command, running these sources
```

`pnpm studio` prepares an independent example workspace in `.presmium/cs336-workspace` on first launch and reuses its editable documents on later launches. The file tree, source editor and previews work without a model. Open the full URL printed in the terminal (default port 4320); press Ctrl+C to stop. To edit another lecture or workspace, run `pnpm studio <dir>`; options such as `--port 4321` are forwarded to the workbench.

The framework documentation the code is written against is fetched with `pnpm docs:fetch` into `vendor/docs/slidev` and `vendor/docs/vitepress` (not committed). Read it there rather than the frameworks' compiled code.

## Commands

| Command | What it runs |
|---|---|
| `pnpm studio [dir]` | The browser workbench; defaults to the automatically prepared `.presmium/cs336-workspace`, with an optional lecture or workspace directory |
| `pnpm test` | The layering check, the skills check, the plugin and package checks, and the integration tests (Vitest, `packages/<pkg>/test/`) |
| `pnpm demo:check`, `pnpm demo:build` | `presmium check` and `presmium build` of all 17 CS336 lectures in `examples/cs336` |
| `pnpm e2e` | Builds the private regression fixture and runs Playwright; the CS336 spec builds the full course when needed; `PRESMIUM_E2E_SLIDES_PORT` and `PRESMIUM_E2E_WEB_PORT` choose the ports |
| `pnpm verify` | All of the above |
| `pnpm --filter presmium-docs build` | The documentation site in `site/`, with its publication checks and the API reference (TypeDoc) |
| `pnpm release:check` | A dry run of publishing every public package |
| `pnpm consumer [<dir>]` | Packs the public packages and installs `presmium` from them with pnpm in a project outside the repository |

## Tests

- **Integration tests only.** Tests run the real CLI, build real outputs, start real servers and open real browsers. No unit tests of single functions, and no mocks of Slidev or VitePress.
- **Few cases.** One or two cases per behavior.
- **Where.** End-to-end tests are `e2e/<context>.spec.ts`; tests that need no browser are `packages/<pkg>/test/*.test.ts`. A spec that needs a document of its own keeps it in `e2e/fixtures/<group>/` and builds it in `beforeAll` with the real `presmium build`.

## Layering

`scripts/check-layering.mjs` (part of `pnpm test`) enforces the layers of `docs/architecture.md` section 3:

- `src/domain/` is plain TypeScript: no Vue, no frameworks, no Node built-ins.
- Components and `src/client/` get step state and services through `@lincyaw/host` only; they do not import `@slidev/*` (only `addon-core` may) or `vitepress` (only `web` may).
- `setup/` and global layers, loaded in the slides only, may use the public exports of `@slidev/client`.
- No package imports a plugin package, and nothing imports the internal paths of Slidev or VitePress. Depend on maintained components through their public interfaces; do not fork or patch them.

Other conventions:

- Source is published as `.ts` and `.vue`, not compiled; relative imports name the `.ts` extension, and only erasable TypeScript syntax is used.
- A component's look is a pure function of the step, so stepping back works.
- Each package keeps its own zh-CN and en interface text; components use `useMessages` of `@lincyaw/host`. Text written into outputs follows the document's `lang`.
- The contracts are `packages/kernel/src/contracts/` (re-exported by `contracts.ts`), `packages/kernel/src/ir.ts` and `packages/host/src/contracts.ts`. Public interfaces follow semantic versioning, and a declaration of the workbench's browser side carries the TSDoc tag `@experimental`.

## Agent skills

The skills for lecture authors, presenters and developers are in `.agents/skills` (read by Codex); `.claude/skills` is a symbolic link to it and `AGENTS.md` one to `CLAUDE.md`. When you change directives, commands or the development workflow, update the skills too: `scripts/check-skills.mjs` (part of `pnpm test`) checks that every directive has a section in `presmium-author/references/directives.md` and that every `presmium <command>` the skills mention exists with its options.

## Changes and commits

- When a change touches a public package, add a changeset: `pnpm changeset` (see `.changeset/README.md`). Tests, docs and examples need none.
- Commit messages: `<type>(<scope>): <summary>`, with the types `feat`, `fix`, `docs`, `test`, `refactor` and `chore`, and the package or context as the scope.
- A pull request passes `pnpm test`, the demo's check and build, and the Chromium end-to-end tests (CI runs them; the full suite runs nightly).

By contributing you agree that your contributions are licensed under the Apache License 2.0.
