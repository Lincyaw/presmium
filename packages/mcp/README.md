# @lincyaw/mcp

Presmium's agent environment: a document's tools and resources over MCP, for agents such as Claude Code, Codex or VS Code.

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Usage

`presmium dev` and `presmium serve` serve it at `/mcp` and print its address and the file that holds its token. Without a server, run it over stdio:

```sh
pnpm exec presmium-mcp <document directory>
```

The reading tools (`list_sections`, `get_section`, `get_step`, `search`, `get_code_ref`, `get_outputs`, `get_diagnostics`, `locate_source` and others) are always there; `--allow operate` also provides `run_code` and `build`.

`get_runtime` (also `presmium://runtime`) reads the author's open browser reports: timestamps, section and step, plugin/component failures and live execution status. It differs from the compiled recordings returned by `get_outputs`. Only editor/owner windows of the selected document contribute; closing a window removes its feedback. An empty list means no observed browser state, and earlier results do not verify a new source revision.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/locales/en/lecture.json): agents in your editor

## License

Apache-2.0
