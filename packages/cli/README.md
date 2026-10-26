# @lincyaw/cli

The `presmium` command: `new`, `check`, `ir`, `build`, `dev` and `serve` for Presmium documents and workspaces.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns structured teaching documents into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

Most people install the `presmium` package, which brings this command with the renderers and the official plugins:

```sh
pnpm add -g @lincyaw/presmium
```

In a project that picks its own renderers and plugins, install the CLI with them (Node.js 22.19 or later):

```sh
pnpm add -D @lincyaw/cli @lincyaw/web @lincyaw/render-slides @lincyaw/render-notebook
```

## Commands

| Command | What it does |
|---|---|
| `presmium check [deck]` | Compile and run the checks and publication checks (`--json`, `--update-lock`, `--env`, `--audience`, `--external-links`) |
| `presmium ir [deck]` | Print the IR as JSON (`--out`) |
| `presmium build [deck]` | Build `dist/ir.json` and `dist/<renderer>/` (`--to`, `--out`, `--audience`); at a workspace root, the workspace site in `dist/web/` |
| `presmium dev [deck]` | Dev servers that update on save (`--to`, `--out`, `--server-port`, `--allow`) |
| `presmium new [dir]` | A new lecture, workspace or plugin project (`--type`, `--title`, `--name`, `--no-git`); from `create-presmium`, which the `presmium` package brings |
| `presmium serve [dir]` | The workspace service, on this machine: the documents and their sites, compiled on demand (`--port`, `--host`, `--operator-dir`, `--preview-origin`) |
| `presmium studio [dir]` | The workbench (experimental), from `@lincyaw/studio` installed in the project (`--port`, `--host`); installed globally, it is `presmium-studio` |

`[deck]` is a directory with `lecture.json` or an entry file, by default the current directory. Exit codes: 0 no errors, 1 error findings, 2 usage or internal error. `presmium --help` lists every option.

## Testing plugins

`@lincyaw/cli/testing` runs the real command in a child process, for integration tests:

```ts
import { presmium } from '@lincyaw/cli/testing'

const { code, stdout } = await presmium(dir, ['build', '--to', 'web'])
```

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/locales/en/lecture.json)
- [Plugin guide](https://github.com/Lincyaw/presmium/blob/main/site/plugins/locales/en/lecture.json)

## License

Apache-2.0
