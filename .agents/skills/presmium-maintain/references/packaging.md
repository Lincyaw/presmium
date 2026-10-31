# Packages, official plugins, directives and releases

The plugin contract is `presmium-develop/references/plugin.md`; package conventions are
`docs/architecture.md` 4.2 and section 5, and `docs/ir.md` sections 5 and 6. The package list and versioning
are `.changeset/README.md`.

## Read an existing plugin first

`packages/addon-guide` (directive to component, overlay), `packages/addon-content` (directives, pass,
notebook extension), `packages/addon-exec` (executors, browser services), `packages/addon-classroom`
(pass depending on services).

## An official package

Copy `packages/addon-guide/package.json`; name it `@lincyaw/addon-<name>`.

- **Metadata.** `license: "Apache-2.0"` with a copy of `LICENSE`, `description`, `repository` with
  `directory`, `homepage`, `bugs`, `keywords`, `publishConfig: { access: public }`, `engines.node` equal to
  the root. `files` lists everything `exports` and `bin` point to, never `test/`.
- **Version.** Public packages share one fixed version (`.changeset/config.json`, prerelease in
  `.changeset/pre.json`). `@lincyaw/dsh`, `@lincyaw/workbench` and `@lincyaw/studio` are outside it.
- **Dependencies.** Monorepo dependencies use `workspace:`. `@lincyaw/kernel`, `host`, `viewer` and
  `compiler` are peer dependencies `workspace:^` plus dev dependencies `workspace:*`. Run `pnpm install` and
  commit `pnpm-lock.yaml`.
- **Declaration.** The Node entry declares `version` and `kernel` (the contract range, `KERNEL_VERSION`).
- **The table.** Add a row to `.changeset/README.md`; `scripts/check-packages.mjs` checks it.
- **The example.** A public capability gets a scenario in the matching guide of `examples/animations/` and
  its `features.json`, with real prerequisites; declare the plugin in `examples/animations/package.json`
  and the document's `metadata.plugins`. Regression documents go in `e2e/fixtures/<group>/`.
- **Verification.** No new tests; build its fixture document for real.

A new document capability is typed with its Schema in the kernel, validated, documented in
`.agents/skills/presmium-author/references/document.md` and mirrored in the site docs. It adds no new source
syntax or Markdown fallback.

## Skills

Skills live in `.agents/skills`; `.claude/skills` links to it and `AGENTS.md` to `CLAUDE.md`. The author,
animate, present and develop skills are packed into `@lincyaw/skills`, registered by Studio and exposed by
MCP (`list_skills`, `read_skill`, `presmium://skills`); `presmium skills install <dir>` installs missing
ones. New projects get those listed in `packages/create-presmium/src/templates.ts`. Shipped skills are
self-contained (no `docs/`, `packages/`, `scripts/` or `e2e/` references); `presmium-maintain` is not
shipped. Update skills in the same change as the commands they describe. `scripts/check-skills.mjs` checks
metadata, `references/` links, the document contract and that every `presmium <command> --<option>` exists.

## Structure checks

| Script | Checks |
|---|---|
| `node scripts/check-layering.mjs` | Layers, no `vitepress` or `@slidev/*`, no plugin-to-plugin imports |
| `node scripts/check-skills.mjs` | Skills |
| `node scripts/check-plugins.mjs` | `version` and `kernel` of official plugins |
| `node scripts/check-packages.mjs` | Publishing metadata against `.changeset/README.md` |
| `node scripts/check-tokens.mjs` | No raw colors, px or durations in workbench and studio-frame CSS |
| `node scripts/check-i18n.mjs --strict` | Catalogs against `docs/glossary.md` |
| `node scripts/check-types.mjs` | Type check of `tsconfig.json` and `packages/workbench/tsconfig.json` |

## Changesets and releases

A public package change adds a changeset (`pnpm changeset`, one sentence for users); tests, docs and
examples need none. `pnpm release:check` packs without uploading. `pnpm consumer [<directory>]` installs
`presmium` outside the monorepo (`--studio` adds the studio, about 865 MB). Publishing follows
`.changeset/README.md`; never publish unless asked.

## The VS Code extension

`pnpm --filter presmium-vscode package:vsix` builds the VSIX for the current platform, including the
language server, the complete Studio and the shared skills; the schema comes from `DOCUMENT_JSON_SCHEMA`.
Open Visual Editor starts or reuses the same Web Studio in VS Code's Integrated Browser. Keep the local
request guards unchanged.

Verify the unpacked language server with real LSP initialize, open, save, diagnostics, navigation and preview
requests, then preview, presentation, the visual editor (light/dark, desktop/narrow) and exports in a real
VS Code window outside the repository; stop the services and confirm their ports close. Report a window you
could not control separately. `.github/workflows/vscode.yml` packages six platforms but does no window
acceptance. Details are in `packages/vscode/README.md`.
