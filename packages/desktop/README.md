# Presmium Studio for the desktop

Presmium Studio as a desktop app for Windows, macOS and Linux, built with [Tauri 2](https://v2.tauri.app). The installer carries its own Node and the complete `@lincyaw/presmium`, so nothing else needs to be installed. The behaviour is specified in `docs/studio.md`, section 11.4.

## Use

Open the app, choose **Open Workspace…** and pick a folder with Presmium documents (or an empty one). The app starts Studio on it and shows Studio in its window; the next start reopens the same workspace. **Workspace → Open Workspace…** switches to another one. Closing the window stops Studio.

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
| Launcher | `build/ui` | The start page (`ui/`), with `@lincyaw/design` |

`node scripts/prepare.mjs node|ui|runtime` runs one part. Each platform is built on that platform; `.github/workflows/desktop.yml` builds Linux, macOS and Windows on x64 and arm64.

macOS signing keeps Hardened Runtime enabled and uses `src-tauri/Entitlements.plist` for the bundled Node's V8 JIT and loading native extensions such as sharp and workspace plugins. CI executes JavaScript and loads sharp with the signed `Contents/MacOS/presmium-node`. Also open a workspace in the built app: `--version` alone does not initialize V8. The launcher's **Details** opens the startup log, including process creation failures and unexpected exit status.


## Updates

The application checks for updates on startup and every six hours. **Check for Updates…** is also available
from the application menu. Downloading leaves the workspace open. After signature verification, save your work
and choose **Restart and Install**; **Later** keeps the verified candidate for another attempt.
The installed app version follows `@lincyaw/presmium`. Older clients without the updater need one manual upgrade.

Local builds produce ordinary installers without requiring the release private key. CI enables signed updater artifacts and signs packages with the repository Actions secret `TAURI_SIGNING_PRIVATE_KEY`; the matching public key is in
`src-tauri/tauri.conf.json`. Never include the private key in source or release assets. The optional password is
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Only after all six platform builds and final package signatures succeed
is the update feed at the `desktop-updates` release promoted. Version-release packages are immutable.
