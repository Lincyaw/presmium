# Presmium Studio for the desktop

Presmium Studio as a desktop app for Windows, macOS and Linux, built with [Tauri 2](https://v2.tauri.app). The installer carries its own Node and the complete `@lincyaw/presmium`, so nothing else needs to be installed. The behaviour is specified in `docs/studio.md`, section 11.4.

## Use

On first launch the app prepares an editable copy of the complete example gallery in its local data directory (`gallery-workspace`) and opens it in Studio. The installer includes the documents, scene and component sources, assets and committed narration caches, including regular copies of the skill gallery's linked animations. No example download or dependency installation is needed. The copy has its own initial Git history; editing and history use the system's Git. Later launches reopen the last workspace, and app updates preserve your example edits. **Workspace → Open Workspace…** switches to your own folder. Closing the window stops Studio.

Studio also watches the app's input pipe (`PRESMIUM_STUDIO_PARENT_PIPE=1`), so closing that pipe requests shutdown, including during startup. macOS forced-quit cleanup is verified with the built app. Windows process-tree cleanup needs platform acceptance; the Unix watchdog's process-group behavior is not a Windows guarantee. Ordinary terminal launches keep their normal input behaviour.

Installers for each platform are attached to the GitHub Releases of this repository. Builds without signing secrets are unsigned: on macOS open the app the first time with Control-click → Open; on Windows choose "More info → Run anyway".

## Build

```sh
pnpm install
pnpm --filter presmium-desktop dev     # run the app without bundling it
pnpm --filter presmium-desktop build   # installers for this machine in src-tauri/target/release/bundle/
```

Requirements: Rust 1.90 or later (stable), Node 22.19 or later, pnpm, and the platform's Tauri prerequisites; on Linux the WebKitGTK 4.1 development packages (`libwebkit2gtk-4.1-dev` and `libgtk-3-dev` on Debian and Ubuntu).

`scripts/prepare.mjs` gathers what the bundle carries for this platform into `build/` and `src-tauri/binaries/`:

| Part | Where | What |
|---|---|---|
| Node | `src-tauri/binaries/presmium-node-<target>` | The official Node build of the version running the build, so native modules match |
| Runtime | `build/runtime` → resource `runtime/` | `pnpm deploy --prod` of this package: `@lincyaw/presmium` with Studio, the renderers and the official plugins |
| Examples | `build/gallery` and `build/gallery.mjs` → resources `gallery/` and `gallery.mjs` | Complete editable gallery with initial Git history; the bundled Node copies it atomically on first launch and links dependencies to the installed runtime |
| Launcher | `build/ui` | The start page (`ui/`), with `@lincyaw/design` |

`node scripts/prepare.mjs node|ui|runtime|gallery` runs one part. Each platform is built on that platform; `.github/workflows/desktop.yml` builds Linux, macOS and Windows on x64 and arm64.

On Linux the default build produces a DEB. Run `pnpm --filter presmium-desktop bundle:rpm` afterwards to package the already-built binary as an RPM. The RPM metadata uses the numeric base version and release `0.<prerelease>` (or `1` for a stable version), so prereleases sort before the stable release. This does not recompile or change the binary's full application/updater version. CI signs final RPM bytes with that full version through `collect-updates.mjs`.

macOS signing keeps Hardened Runtime enabled and uses `src-tauri/Entitlements.plist` for the bundled Node's V8 JIT and loading native extensions such as sharp and workspace plugins. CI executes JavaScript and loads sharp with the signed `Contents/MacOS/presmium-node`. Also open a workspace in the built app: `--version` alone does not initialize V8. The launcher's **Details** opens the startup log, including process creation failures and unexpected exit status.


## Updates

The application checks for updates on startup and every six hours. An update icon appears in the
app bar and launcher only after a newer version is found; it has no permanent text or space reservation.
Hover it for the installed/available versions, progress and action. **Check for Updates…** remains available
in the application menu at any time. Background discovery never opens a dialog; clicking the icon starts
the download. Downloading leaves the workspace open. After signature verification, save your work
and choose **Restart and Install**; **Later** keeps the verified candidate for another attempt.
The installed app version follows `@lincyaw/presmium`. Older clients without the updater need one manual upgrade.

On macOS the app bar includes the system window buttons and replaces the separate title strip. Drag its empty
area to move the window, or double-click it to zoom. Fullscreen releases the window-button inset; Windows and
Linux keep their native window controls. Studio receives only an explicitly allowed, origin-checked window and
signed-update bridge, while workspace selection remains restricted to the bundled launcher.

Local builds produce ordinary installers without requiring the release private key. CI enables signed updater artifacts and signs packages with the repository Actions secret `TAURI_SIGNING_PRIVATE_KEY`; the matching public key is in
`src-tauri/tauri.conf.json`. Never include the private key in source or release assets. The optional password is
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Only after all six platform builds and final package signatures succeed
is the update feed at the `desktop-updates` release promoted. Version-release packages are immutable.

To stage a release, push its version commit and immutable tag before starting the platform builds, create a release draft for that tag, and dispatch the desktop workflow with `release_tag`. After every build and signature passes, CI uploads the complete assets, publishes that draft, then promotes the feed. Artifact-only dispatches leave the release and feed unchanged. Direct use of `publish-updates.mjs` requires `--publish-draft` and an explicit `RELEASE_TAG` environment variable to publish a draft; the selected tag must match the packages' version before any upload or publication.
