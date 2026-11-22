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
  the root. `files` lists everything `exports` and `bin` point to, never `test/`. A `README.md` is the
  package's npm page; the `allowBuilds` block in `packages/presmium/README.md` and in the templates' `pnpm-workspace.yaml`
  equals the root's.
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
animate, figure, develop and paper-to-Xiaohongshu workflow skills are packed into `@lincyaw/skills`, registered by Studio and exposed by
MCP (`list_skills`, `read_skill`, `presmium://skills`); `presmium skills install <dir>` installs missing
ones. New projects get those listed in `packages/create-presmium/src/templates.ts`. Shipped skills are
self-contained (no `docs/`, `packages/`, `scripts/` or `e2e/` references); `presmium-maintain` is not
shipped. Update skills in the same change as the commands they describe. `scripts/check-skills.mjs` checks
metadata, `references/` links, the document contract and that every `presmium <command> --<option>` exists.

The Claude Code plugin is `plugins/presmium`, listed by the marketplace `.claude-plugin/marketplace.json`
(installed with `/plugin marketplace add Lincyaw/presmium`, `/plugin install presmium@presmium`). Its `skills/`
holds symbolic links `../../../.agents/skills/<name>` to exactly the skills of `packages/skills`
`presmium.skills` (checked by `scripts/check-skills.mjs`), `.mcp.json` starts `pnpm dlx @lincyaw/presmium mcp`, excluding Presmium's packages from pnpm's `minimumReleaseAge`,,
and `commands/` holds the slash commands. `claude plugin validate plugins/presmium` checks the manifests;
`claude plugin details presmium@presmium` lists what an installation loads.

## Published example sites

`examples/gallery/` is the main example site. `examples/papers/` is the paper-explainer workspace, with
one `papers/<slug>/index.pmd` per paper and a shared `kit/`, `site/` and `tools/`. CI checks and builds
the paper workspace. The Pages workflow builds the gallery at the configured base path and the paper site
at `<base>/papers/`, then copies the paper site's `dist/web/` into the gallery output's `papers/` before
uploading the combined artifact. New paper directories matching `papers/*/index.pmd` are included
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
`presmium studio <workspace>` itself and opens the address it prints. Reopening its live current workspace
focuses it without restarting; returning from the launcher shares the same sign-in recovery path. The
example initializer is skipped when the existing configuration and runtime dependency link are valid.
Linux needs the WebKitGTK 4.1 development packages to compile. `scripts/prepare.mjs` drops what nothing reads at run time (source
maps, type declarations, `.pdb` files, package tests and demos, node-pty binaries of other platforms); CI packs the
deb with xz and the DMG with LZMA through `hdiutil convert`, since compressing straight from the folder leaves half
the file unused.

The installer also carries `build/gallery/` (a dereferenced copy of `examples/gallery`, its assets and committed speech caches, with initial Git history) and the Node initializer `build/gallery.mjs`. With no recent workspace, the launcher automatically opens `gallery-workspace` in the app's local data directory. The initializer copies atomically and links dependencies to the bundled runtime; it preserves an existing copy and author edits on upgrades. Later launches reopen the last workspace; the workspace menu switches to another directory. Editing and history still use the system's Git. Changes to the gallery or its linked skill sources trigger desktop builds.

Generated gallery Git objects are owner-writable so Tauri can replace resource copies on repeated builds. Preparation also repairs only those generated `target/{debug,release}/gallery/.git` caches, respecting `CARGO_TARGET_DIR`; it never changes an author's repository. Verify a second real app build. The signature verifier is a separate minimal Rust workspace member and must not activate the desktop build script or copy app resources.

Linux builds default to DEB. Afterwards `pnpm --filter presmium-desktop bundle:rpm` uses the public Tauri bundle command without recompiling: RPM metadata uses the numeric base version and release `0.<prerelease>` (stable: `1`), retaining the binary's full SemVer. Final RPM signatures bind that full application version, not the RPM metadata version. Verify the real Linux packages and their version/release fields; do not change the compiled application version just to satisfy a package manager.

The snapshot's `tsconfig.json` is standalone: merge the repository base compiler options at packaging time, retaining the gallery's own fields. The initializer repairs the early snapshot's exact `../../tsconfig.base.json` reference only when its target is missing, preserving author compiler options. Verify a real animation scenario from outside the repository as well as the prose tutorial.

Verify in the built app, not only `cargo check`: a fresh first launch automatically opens all bundled examples without choosing a folder or downloading dependencies; edits survive restart and a second preparation; switching workspaces reopens the selected directory on the next launch. Also verify the launcher, opening a workspace (sign-in included), a
document, its preview, closing the window and killing the app (no `presmium-node` left), and Studio ending on
its own (the launcher shows the error). `.github/workflows/desktop.yml` builds the installers of six platforms
and, after a push to main, replaces the assets of the rolling prerelease `desktop-latest` (a published GitHub
Release gets its own copies); it does no window acceptance. Details are in `packages/desktop/README.md`.
On macOS, execute JavaScript and load sharp with the signed app's `Contents/MacOS/presmium-node`; `--version`
does not initialize V8 or load native extensions. Keep Hardened Runtime enabled and the bundled Node's
`allow-jit` and `disable-library-validation` entitlements in `src-tauri/Entitlements.plist` for V8 and native
extensions (including workspace plugins). Read the launcher's Details log for spawn errors and
unexpected exit status before changing workspace content.
The desktop keeps Studio's stdin pipe open and sets `PRESMIUM_STUDIO_PARENT_PIPE=1`; Studio removes the flag
before launching children and exits when the pipe closes, including during startup. Verify forced termination
as well as normal window closing; a successful normal exit does not prove crash cleanup works.
macOS forced-quit cleanup is accepted in the built app; do not generalize the Unix watchdog's process groups
to Windows. Windows process-tree supervision requires platform-specific implementation and acceptance.

For workbench chrome, use the app bar, workspace Toolbar/Header and dock Header contracts in
`docs/design-system.md`. Document and Video Production must share outer width, toolbar height, horizontal
insets and title baselines. Measure the actual pane for responsive layout, including a wide window with the
conversation open. MCP presence stays inside the existing app bar; verify a real non-first-step edit, target
highlights, reduced motion, paused following, and canceled cross-document navigation. Never insert artificial
operation delays for the effect.


Desktop updates use the public Tauri updater API in the native process, outside the unprivileged Studio page.
The app bar and launcher expose an icon only after discovering a newer version; ordinary/checking/current
states take no space until a candidate exists. Tooltips and accessible labels carry versions, progress and
restart/error actions. Manual Check for Updates remains in the native menu. The kernel's `DesktopHost` contract carries only a snapshot, subscription and update
activation request. Background discovery is silent; icon activation starts downloading, while restart still
requires the native save-and-restart confirmation. Explicit Tauri command permissions and exact current-Studio origin checks protect its bounded bridge;
do not expose launcher, filesystem or process commands to remote pages. macOS overlays the native title bar
onto the existing app bar, reserves the token-defined traffic-light inset outside fullscreen, and permits
dragging only the bar's noninteractive background. Verify real window buttons, dragging, zoom, fullscreen and
both themes; ordinary browser sessions retain their existing frame.
The app version comes from `packages/presmium/package.json`. Keep version-bound signatures and the committed
public key; private signing material stays outside the repository. Local builds leave updater artifact generation disabled; CI explicitly enables it and requires `TAURI_SIGNING_PRIVATE_KEY`
(and the optional password secret). Never print or commit this key. `collect-updates.mjs` signs final bytes,
including recompressed DEB packages. Collection uses the public Tauri signing API, without relying on
`npm_execpath` (which `pnpm exec` does not provide). `publish-updates.mjs` requires all six architecture builds and all eight
package-format entries, uploads immutable files to the version Release, then promotes `desktop-updates/latest.json`.
A rolling preview does not promote updates. Verify discovery, download, invalid signatures, Later, saved-and-restart,
and reopening the workspace in the built app; do not claim Windows/Linux installation acceptance from a macOS run.

Before a long desktop build, integrate the latest main and push the version commit to main to reserve it.
A failed fast-forward push requires reconciling the concurrent release and regenerating the version before
building. Do not build a separately chosen pending version while another release can claim the same number.
Local acceptance builds use a distinct development version and application identifier; they must not claim a
published application version. For a desktop release, complete the immutable version-release/feed workflow
below: updating only `desktop-latest` leaves existing clients on the previous signed update feed.
Prepare the immutable tag and release draft, then dispatch with `release_tag`. CI explicitly permits publishing
that draft only after all platform builds pass and all immutable assets upload; it confirms publication before
promoting the feed. Its repository-scoped `GITHUB_TOKEN` avoids recursively triggering another release build.
Direct publisher use requires `--publish-draft` and the explicit `RELEASE_TAG` environment variable to publish a draft. Before any upload or publication, that selected tag must equal the verified packages' version tag.

When initializing `desktop-updates`, resolve the selected version tag to a full commit SHA for GitHub's
`target_commitish`; a tag name is not an accepted substitute when creating that new tag. After all
installers pass, a publisher-only retry reuses those immutable files and must not rebuild or re-sign them.
Image creation retries only the observed macOS `Resource busy` condition, at most three attempts, preserving
the built app. Other failures remain failures; cleanup removes only the job's own partial image.
Release events build version tags beginning with `v`; publishing the feed or rolling-preview infrastructure
must not recursively build another client.

Pin each CI checkout to the triggering commit (`github.sha`), or the explicitly selected immutable release tag, rather than a moving branch reference. All platform artifacts must come from the same verified source.

For a desktop/runtime upgrade, start with a workspace already held by an older MCP host. Verify that the new
launcher replaces it automatically, reports the current captured service version, preserves saved content, and opens
the actual preview. The stdio relay must remain usable, in-flight work must finish, and replacement must wait for the
old lease and plugin cleanup; process liveness or a document list alone is not acceptance.
