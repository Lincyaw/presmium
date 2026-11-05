# Packages, official plugins and releases

The plugin contract is `presmium-develop/references/plugin.md`; package conventions are
`docs/architecture.md` 4.2 and section 5, and `docs/ir.md` sections 5 and 6. The package list and versioning
are `.changeset/README.md`.

## Read an existing plugin first

`packages/addon-guide` (browser services and overlays), `packages/addon-content` (compilation passes,
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
- **The example.** A public capability gets a scenario in the matching guide of `examples/gallery/` and
  its `features.json`, with real prerequisites; declare the plugin in `examples/gallery/package.json`
  and the document's `metadata.plugins`. Regression documents go in `e2e/fixtures/<group>/`.
- **Verification.** No new tests; build its fixture document for real.

A new document capability is typed with its Schema in the kernel, validated, documented in
`.agents/skills/presmium-author/references/document.md` and mirrored in the site docs. It adds no new source
syntax or Markdown fallback.

## Skills

Skills live in `.agents/skills`; `.claude/skills` links to it and `AGENTS.md` to `CLAUDE.md`. The author,
animate and develop skills are packed into `@lincyaw/skills`, registered by Studio and exposed by
MCP (`list_skills`, `read_skill`, `presmium://skills`); `presmium skills install <dir>` installs missing
ones. New projects get those listed in `packages/create-presmium/src/templates.ts`. Shipped skills are
self-contained (no `docs/`, `packages/`, `scripts/` or `e2e/` references); `presmium-maintain` is not
shipped. Update skills in the same change as the commands they describe. `scripts/check-skills.mjs` checks
metadata, `references/` links, the document contract and that every `presmium <command> --<option>` exists.

## Published example sites

`examples/gallery/` is the main example site. `examples/papers/` is the paper-explainer workspace, with
one `papers/<slug>/lecture.json` per paper and a shared `kit/`, `site/` and `tools/`. CI checks and builds
the paper workspace. The Pages workflow builds the gallery at the configured base path and the paper site
at `<base>/papers/`, then copies the paper site's `dist/web/` into the gallery output's `papers/` before
uploading the combined artifact. New paper directories matching `papers/*/lecture.json` are included
automatically. After moving a workspace, update its pnpm importer, tool resource paths and production
instructions; keep the document's identity and committed speech cache with it.

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

Every repository update adds a changeset (`pnpm changeset`, one sentence for users), including changes to
tests, docs, skills, examples and configuration. Follow `.changeset/README.md` for package selection and
the release procedure. `pnpm release:check` packs without uploading. After `pnpm changeset publish`,
`node scripts/release-latest.mjs` waits until npm lists the current version of every public package, then
sets `latest` (and `rc` in prerelease mode) and prints the dist-tags npm confirms; it never moves a tag
back, and `--dry-run` only polls and reports. `pnpm consumer [<directory>]` installs
`presmium` outside the monorepo, including Studio by default (about 865 MB with its dependencies); `--studio` also lists Studio as a direct dependency for compatibility. Studio uses `@lincyaw/presmium` as its peer host; the host includes Studio as a dependency, so one install provides `presmium studio` without a hard dependency cycle. A global `presmium` always runs its own installation; it does not forward to a project installation. Use `pnpm exec presmium` explicitly to run a project version. Publishing follows
`.changeset/README.md` under the standing authorization in the root `AGENTS.md`: after scoped
verification, commit, push and release every completed update without asking again. Publish from a
checkout containing only committed changes for the release, so unrelated working-tree edits stay out.

For Studio installation changes, verify a fresh default pnpm installation outside the monorepo and start
its actual installed command, with no inherited `NODE_PATH` or hoisting options.
The bundle owns the native addon dependency and its child-process search path (`docs/studio.md` 11.2).
Keep platform binaries as package-manager dependencies resolved through public package exports.

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

## The desktop app

`packages/desktop` (private, `presmium-desktop`) is Studio as a Tauri 2 app for Windows, macOS and Linux.
`pnpm --filter presmium-desktop build` gathers the Node that runs the build as the sidecar `presmium-node`, a
`pnpm deploy` of `@lincyaw/presmium` as the resource `runtime/`, and the launcher page, then runs `tauri build`
for this machine's platform; `pnpm --filter presmium-desktop dev` opens it unbundled. The app starts
`presmium studio <workspace>` itself and opens the address it prints; Studio and dsh are not changed for it.
Linux needs the WebKitGTK 4.1 development packages to compile. `scripts/prepare.mjs` drops what nothing reads at run time (source
maps, type declarations, `.pdb` files, package tests and demos, node-pty binaries of other platforms); CI packs the
deb with xz and the DMG with LZMA through `hdiutil convert`, since compressing straight from the folder leaves half
the file unused.

Verify in the built app, not only `cargo check`: the launcher, opening a workspace (sign-in included), a
document, its preview, closing the window and killing the app (no `presmium-node` left), and Studio ending on
its own (the launcher shows the error). `.github/workflows/desktop.yml` builds the installers of six platforms
and, after a push to main, replaces the assets of the rolling prerelease `desktop-latest` (a published GitHub
Release gets its own copies); it does no window acceptance. Details are in `packages/desktop/README.md`.
