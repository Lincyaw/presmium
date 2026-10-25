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
  one version, currently in the `rc` prerelease. `@lincyaw/dsh`, `@lincyaw/workbench` and `@lincyaw/studio`
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
- **The example.** The only public example is the two lectures of `examples/animations/`. A new plugin's
  verification document goes into `e2e/fixtures/<group>/` with a spec `e2e/<group>.spec.ts`
  ([testing](testing.md)); do not mix feature demos into the example. To use the plugin there, add it to
  `examples/animations/package.json` and to the lecture's `plugins`.
- **Tests.** `packages/<pkg>/test/*.test.ts` writes a document into a temporary directory with `plugins`
  set to the package's absolute path and runs the real CLI (model: `packages/addon-exec/test/compile.test.ts`).

## A new directive

A new directive, from a plugin or from the compiler's built-ins, is added in three places:

1. the directive table of `docs/ir.md` 5.1;
2. a `` ### `{name}` `` section in `.agents/skills/presmium-author/references/directives.md`
   (`scripts/check-skills.mjs` fails without it);
3. the user-facing syntax in `site/plugins/lecture.md`.

## Skills

Skills are in `.agents/skills`; `.claude/skills` is a symbolic link to it and `AGENTS.md` a link to
`CLAUDE.md`. Shipped skills are copied at pack time: the bundle registers those listed in
`packages/dsh/package.json` `presmium.skills`, and new projects get those listed in
`packages/create-presmium/src/templates.ts`. Shipped skills must be self-contained (no references to
`docs/`, `packages/`, `scripts/` or `e2e/`); `presmium-maintain` is listed in neither. When instructions,
commands or the development flow change, update the skills in the same change. `scripts/check-skills.mjs`
checks frontmatter, links between `references/` files, that every directive has a section, and that every
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
published without uploading. Shared loading or packaging changes are verified by the consumer install:
`packages/cli/test/consumer.test.ts`, `e2e/consumer.spec.ts`, or `pnpm consumer [<directory>]` (`--studio`
also installs the studio, about 865 MB). Publishing itself is the maintainers' steps in
`.changeset/README.md`; do not publish unless asked.

## The VS Code extension

`pnpm --filter presmium-vscode package:vsix` builds the VSIX for the current OS and processor. The language
server and the web rendering runtime are deployed into the VSIX from the lockfile; a symlink into the
development tree is not a packaged dependency. Run `packages/vscode/test/build.test.ts` to verify that the
unpacked service starts a preview outside the repository, and accept the package in an ordinary VS Code
window. `.github/workflows/vscode.yml` builds and verifies it on six platforms and attaches the files to a
GitHub Release when one is published. Install and build steps are maintained in one place,
`packages/vscode/README.md`.
