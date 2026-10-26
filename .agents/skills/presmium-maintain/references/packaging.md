# Packages, official plugins, directives and releases

The plugin contract itself (layout, `PresmiumNodePlugin`, directives, components, browser side, renderer
extensions) is in `presmium-develop/references/plugin.md`; its layer table is the one
`scripts/check-layering.mjs` enforces in the repository (`docs/architecture.md` section 3). This file adds
what an official package in this monorepo needs. Versioning and the list of packages are
`.changeset/README.md`; the package conventions for plugins are `docs/architecture.md` 4.2 and section 5,
`docs/ir.md` sections 5 and 6.

## Read an existing plugin first

- `packages/addon-guide`: directive to component, overlay.
- `packages/addon-content`: directives, compile pass, notebook extension, `vite.config.ts`.
- `packages/addon-exec`: executors, notebook extension, runtime files, browser services.
- `packages/addon-classroom`: compile pass, notebook extension, depending on services.

## An official package

Copy `packages/addon-guide/package.json` and adapt it. Official plugins are named `@lincyaw/addon-<name>`.

- **Metadata.** `license: "Apache-2.0"` and a copy of the root `LICENSE` in the package; `description`,
  `repository` (with `directory`), `homepage`, `bugs`, `keywords`, `publishConfig: { access: public }`;
  `engines.node` equal to the root's. `files` lists only what is published (never `test/`) and includes
  every file that `exports` and `bin` point to.
- **Version.** Public packages form one fixed version group (`.changeset/config.json` `fixed`) and share
  one version, currently in the `rc` prerelease (`.changeset/pre.json`; the version in any public
  `package.json`). `@lincyaw/dsh`, `@lincyaw/workbench` and `@lincyaw/studio`
  are outside the group: 0.x and experimental (`docs/design-dsh.md` section 12).
- **Workspace ranges.** Dependencies on other monorepo packages are written `workspace:`. A plugin's
  dependencies on `@lincyaw/kernel`, `host`, `viewer` and `compiler` are peer dependencies written
  `workspace:^` (published as `^<version>`), plus same-name dev dependencies `workspace:*` (published as the
  exact version) so the workspace links them for the package's tests.
- **The table.** Add a row to the package table of `.changeset/README.md` (published to npm or not, and
  what it is). `scripts/check-packages.mjs` checks license, version, `engines.node`, metadata, `files`, and
  the peer dependencies of plugins against that table.
- **Plugin declaration.** The Node entry declares `version` (from `package.json`) and `kernel` (the contract
  range, `KERNEL_VERSION` is separate from the package version); `scripts/check-plugins.mjs` checks every
  official plugin declares both and is compatible.
- **Install.** After adding a package or dependency run `pnpm install` at the root and commit
  `pnpm-lock.yaml`.
- **The example.** `examples/animations/` contains two complete courses and eight user-facing feature
  guides. Add an authorable scenario to the relevant guide and its `features.json` index when a public
  capability changes; declare real service, hardware and credential prerequisites. Regression and
  deliberate failure documents stay in `e2e/fixtures/<group>/` ([testing](testing.md)). To use a plugin
  in the public workspace, declare it in `examples/animations/package.json` and in the document's
  `metadata.plugins`.
- **Tests.** Under the owner's current rule (SKILL.md, Verify) a new package gets no tests; verify it by a
  real build of its fixture document. When the owner asks for tests, the existing shape is: a spec
  `e2e/<group>.spec.ts` for the fixture, and `packages/<pkg>/test/*.test.ts` that writes a document into a
  temporary directory with `plugins` set to the package's absolute path and runs the real CLI (model:
  `packages/addon-exec/test/compile.test.ts`).

## A new document capability

Define its typed entities and Schema in the kernel, validate references and parameter/state capability, and document the author workflow in `.agents/skills/presmium-author/references/document.md`. Add a real JSON example for the relevant plugin/renderer and mirror the public contract in the site documentation. New content capabilities do not introduce another source syntax or a Markdown authoring fallback.

## Skills

Skills are in `.agents/skills`; `.claude/skills` is a symbolic link to it and `AGENTS.md` a link to
`CLAUDE.md`. Shipped skills are copied at pack time: the bundle registers those listed in
`packages/dsh/package.json` `presmium.skills`, and new projects get those listed in
`packages/create-presmium/src/templates.ts`. Shipped skills must be self-contained (no references to
`docs/`, `packages/`, `scripts/` or `e2e/`); `presmium-maintain` is listed in neither. When instructions,
commands or the development flow change, update the skills in the same change. `scripts/check-skills.mjs`
checks skill metadata, links between `references/` files, the sole JSON document contract, and that every
`presmium <command> --<option>` written in a skill exists in the CLI.

## Structure checks

`pnpm test` runs, before Vitest, the light checks; run the one your change touches alone:

| Script | Checks |
|---|---|
| `node scripts/check-layering.mjs` | Package layers, no `vitepress` or `@slidev/*`, no plugin-to-plugin imports |
| `node scripts/check-skills.mjs` | Skills (above) |
| `node scripts/check-plugins.mjs` | `version` and `kernel` of every official plugin |
| `node scripts/check-packages.mjs` | Publishing metadata against `.changeset/README.md` |
| `node scripts/check-tokens.mjs` | No raw colors, px or durations in workbench and studio-frame CSS |
| `node scripts/check-types.mjs` | Type check of `tsconfig.json` and `packages/workbench/tsconfig.json` (errors inside dependency sources are not reported) |

## Changesets and releases

A change to a public package adds a changeset (`pnpm changeset`: pick packages and bump, one sentence for
users); tests, docs and examples need none. `pnpm release:check` packs every public package as it would be
published without uploading. Shared loading or packaging changes are verified by a consumer install: `pnpm consumer [<directory>]`
packs the packages and installs `presmium` outside the monorepo (`--studio` also installs the studio, about
865 MB); when the owner asks for tests, `packages/cli/test/consumer.test.ts` and `e2e/consumer.spec.ts` do
the same. Publishing itself is the maintainers' steps in
`.changeset/README.md`; do not publish unless asked.

## The VS Code extension

`pnpm --filter presmium-vscode package:vsix` builds the VSIX for the current OS and processor. The language
server and the web rendering runtime are deployed into the VSIX from the lockfile; a symlink into the
development tree is not a packaged dependency. The build generates `dist/lecture.schema.json` directly
from the public kernel `DOCUMENT_JSON_SCHEMA`; the archive must contain that file and the JSON validation
association. Verify the unpacked language server with real LSP initialize/open/save, diagnostics, entity
navigation and preview requests, then accept the package in an ordinary VS Code window. If a window
cannot be started, report that boundary separately from the service and archive checks. `.github/workflows/vscode.yml` builds it on six platforms and attaches the files to a
GitHub Release when one is published. Install and build steps are maintained in one place,
`packages/vscode/README.md`.
