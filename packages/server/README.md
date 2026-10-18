# @presmium/server

The server of `presmium dev` and `presmium serve`: plugin routes and proxies under `/__presmium/`, approvals, the control channel and the MCP endpoint. It listens on this machine only unless `presmium serve --host` is given.

Part of [Presmium](https://github.com/presmium/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

It comes with `@presmium/cli`; you do not install it yourself. Its programming interface serves Presmium's own packages and is internal; plugins add routes through `PresmiumNodePlugin.server`.

## Documentation

- [Plugin guide](https://github.com/presmium/presmium/blob/main/site/plugins/lecture.en.md): server routes
- [Interfaces and versions](https://github.com/presmium/presmium/blob/main/docs/api.md)
- [Security and the trust model](https://github.com/presmium/presmium/blob/main/SECURITY.md)

## License

Apache-2.0
