# @lincyaw/studio

`presmium studio`: Presmium's workbench in one command. It starts [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (MIT) with Presmium's bundle, [`@lincyaw/dsh`](https://www.npmjs.com/package/@lincyaw/dsh), and the workspace service of a directory (`presmium serve`, from the `presmium` package it depends on), and prints the one address to open in the browser. Experimental (0.x): it installs one exact version of DeepSeek Harness, `0.2.1-alpha.4` (about 865 MB with its dependencies).

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns structured teaching documents into web pages, slides, Jupyter notebooks and narrated lectures.

## Usage

```sh
pnpm add -g @lincyaw/studio
presmium-studio [dir] [--port <n>] [--host <addr>]
```

In a project with `pnpm add -D @lincyaw/studio`, `pnpm exec presmium studio` is the same command.

`dir` is a workspace root (`presmium.workspace.yaml`) or a deck's directory, as for `presmium serve`. The workbench listens on 127.0.0.1, port 4320 by default (a free port when that one is in use); `--host <addr>` makes it listen on one address of the machine on the local network instead, with no login.

Sessions use the workspace root as their working directory and can read and write files throughout it. Opening another lecture changes document context, not the session or its directory.

The model is chosen in the workbench's model settings, or given by the environment: `DEEPSEEK_API_KEY`, or `PRESMIUM_MODEL_URL`, `PRESMIUM_MODEL_KEY` and `PRESMIUM_MODEL_PROVIDER` for a Messages-compatible service. DeepSeek Harness's home for the workbench (its sessions, model settings and credentials, and the log `presmium-studio.log`) is `$XDG_STATE_HOME/presmium/studio`, never your own `~/.dsh`.

Startup prints the log path to stderr and streams workspace-service logs there while running. The file keeps timestamped output from both processes. Preview logs identify the document, renderer, request, cache/fallback choice and elapsed time; export logs identify the job and phase. A backend preview marked ready means its address is prepared; browser loading and the preview handshake may still be pending. The host's output, including its login URL, stays in the log file.

## Documentation

- [Design of the workbench on DeepSeek Harness](https://github.com/Lincyaw/presmium/blob/main/docs/design-dsh.md)

## License

Apache-2.0. DeepSeek Harness is a separate project under the MIT license; this package is not affiliated with or endorsed by DeepSeek.
