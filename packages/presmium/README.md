# @lincyaw/presmium

Presmium turns one document, `index.pmd`, into a website, slides, a Jupyter notebook and a narrated video. This package is the `presmium` command with Presmium Studio (the browser workbench), the renderers and the official plugins.

Requires Node.js 22.19 or later and pnpm.

## Install

```sh
pnpm setup                       # once, before your first global installation; then open a new terminal
pnpm add -g @lincyaw/presmium
presmium --version
```

## First steps

```sh
presmium new my-course --type workspace   # or --type document, site, plugin
presmium studio my-course                 # prints one address: open it in the browser
```

Editing and previewing in Studio need no language model; the AI assistant uses the key entered under *Settings → Model*. `presmium new --help` and `presmium --help` list the options and the other commands (`dev`, `check`, `build`, `serve`, `mcp`).

## In a project

To pin a version per project, let `pnpm create presmium` make the project: its `pnpm-workspace.yaml` already says which dependencies may run install scripts, so pnpm installs it without asking.

```sh
pnpm create presmium my-course --type workspace
cd my-course
pnpm install
pnpm exec presmium studio
```

To add Presmium to a project of your own, first put this in its `pnpm-workspace.yaml` (pnpm refuses dependencies whose install scripts it has not been told about), then run `pnpm add -D @lincyaw/presmium` and use `pnpm exec presmium`:

```yaml
allowBuilds:
  '@ast-grep/lang-python': false
  '@deepseek-ai/dsh-subprocess-local': false
  '@google/genai': false
  '@vscode/vsce-sign': false
  esbuild: true
  koffi: false
  msedge-tts: false
  node-pty: false
  playwright-chromium: true
  protobufjs: false
```

`playwright-chromium: true` downloads the browser that exports PDF, PowerPoint and video.

## Links

- [Presmium on GitHub](https://github.com/Lincyaw/presmium): the guide, examples and issues
- [Live examples](https://profile.aoyangfang.top/presmium/)

## License

Apache-2.0
