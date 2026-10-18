# @presmium/mcp

Presmium's agent environment: a document's tools and resources over MCP, for agents such as Claude Code, Codex or VS Code.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Usage

`presmium dev` and `presmium serve` serve it at `/mcp` and print its address and the file that holds its token. Without a server, run it over stdio:

```sh
npx presmium-mcp <document directory>
```

The reading tools (`list_sections`, `get_section`, `get_step`, `search`, `get_code_ref`, `get_outputs`, `get_diagnostics`, `locate_source` and others) are always there; `--allow operate` also provides `run_code` and `build`.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/lecture.en.md): agents in your editor
- [Interfaces and versions](https://github.com/Lincyaw/presmium/blob/main/docs/api.md)

## License

Apache-2.0
