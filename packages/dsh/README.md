# @presmium/dsh

Presmium's bundle for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (MIT): the host side of Presmium's workbench. It gives a DeepSeek Harness session in a lecture's directory Presmium's tools, Presmium's approval policy, the lecture as context and Presmium's skills for authors, and on the web carrier the workbench's data routes. Experimental (0.x): it follows one exact version of DeepSeek Harness, `0.2.1-alpha.4`.

Part of [Presmium](https://github.com/presmium/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Usage

`presmium studio` installs and starts it; you do not add it yourself. A launcher of its own writes a profile with `@presmium/dsh/launch` (`writeProfile`), passes the patches `launchPatches(carrier)` returns with `--patch`, and sets `launchEnv(dshHome)`; with `PRESMIUM_SERVICE_URL` and `PRESMIUM_SERVICE_TOKEN` it uses that workspace service, otherwise it starts `presmium serve` itself.

## Documentation

- [Design of the workbench on DeepSeek Harness](https://github.com/presmium/presmium/blob/main/docs/design-dsh.md)
- [Interfaces and versions](https://github.com/presmium/presmium/blob/main/docs/api.md)

## License

Apache-2.0. DeepSeek Harness is a separate project under the MIT license; this package is not affiliated with or endorsed by DeepSeek.
