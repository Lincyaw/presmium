# @presmium/studio

`presmium studio`: Presmium's workbench in one command. It starts [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (MIT) with Presmium's bundle, [`@presmium/dsh`](https://www.npmjs.com/package/@presmium/dsh), and the workspace service of a directory (`presmium serve`), and prints the one address to open in the browser. Experimental (0.x): it installs one exact version of DeepSeek Harness, `0.2.1-alpha.4` (about 865 MB with its dependencies).

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Usage

Install it beside `@presmium/cli`, in a project or globally:

```sh
npm install --save-dev @presmium/studio
npx presmium studio [dir] [--port <n>] [--host <addr>]
```

`dir` is a workspace root (`presmium.workspace.yaml`) or a deck's directory, as for `presmium serve`. The workbench listens on 127.0.0.1, port 4320 by default (a free port when that one is in use); `--host <addr>` makes it listen on one address of the machine on the local network instead, with no login. `presmium-studio` is the same command.

The model is chosen in the workbench's model settings, or given by the environment: `DEEPSEEK_API_KEY`, or `PRESMIUM_MODEL_URL`, `PRESMIUM_MODEL_KEY` and `PRESMIUM_MODEL_PROVIDER` for a Messages-compatible service. DeepSeek Harness's home for the workbench (its sessions, model settings and credentials, and the log `presmium-studio.log`) is `$XDG_STATE_HOME/presmium/studio`, never your own `~/.dsh`.

## Documentation

- [Design of the workbench on DeepSeek Harness](https://github.com/Lincyaw/presmium/blob/main/docs/design-dsh.md)
- [Interfaces and versions](https://github.com/Lincyaw/presmium/blob/main/docs/api.md)

## License

Apache-2.0. DeepSeek Harness is a separate project under the MIT license; this package is not affiliated with or endorsed by DeepSeek.
