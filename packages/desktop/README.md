# Presmium Studio for the desktop

Presmium Studio as a desktop app for Windows, macOS and Linux, built with [Tauri 2](https://v2.tauri.app). The installer carries its own Node and the complete `@lincyaw/presmium`, so nothing else needs to be installed. The behaviour is specified in `docs/studio.md`, section 11.4.

## Use

Open the app, choose **Open Workspace…** and pick a folder with Presmium documents (or an empty one). The app starts Studio on it and shows Studio in its window; the next start reopens the same workspace. **Workspace → Open Workspace…** switches to another one. Closing the window stops Studio.

Installers for each platform are attached to the GitHub Releases of this repository. Builds without signing secrets are unsigned: on macOS open the app the first time with Control-click → Open; on Windows choose "More info → Run anyway".

## Build

```sh
pnpm install
pnpm --filter presmium-desktop dev     # run the app without bundling it
pnpm --filter presmium-desktop build   # installers for this machine in src-tauri/target/release/bundle/
```

Requirements: Rust (stable), Node 22.19 or later, pnpm, and the platform's Tauri prerequisites; on Linux the WebKitGTK 4.1 development packages (`libwebkit2gtk-4.1-dev` and `libgtk-3-dev` on Debian and Ubuntu).

`scripts/prepare.mjs` gathers what the bundle carries for this platform into `build/` and `src-tauri/binaries/`:

| Part | Where | What |
|---|---|---|
| Node | `src-tauri/binaries/presmium-node-<target>` | The official Node build of the version running the build, so native modules match |
| Runtime | `build/runtime` → resource `runtime/` | `pnpm deploy --prod` of this package: `@lincyaw/presmium` with Studio, the renderers and the official plugins |
| Launcher | `build/ui` | The start page (`ui/`), with `@lincyaw/design` |

`node scripts/prepare.mjs node|ui|runtime` runs one part. Each platform is built on that platform; `.github/workflows/desktop.yml` builds Linux, macOS and Windows on x64 and arm64.
