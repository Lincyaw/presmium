# @lincyaw/language-server

The language server of Presmium documents: diagnostics, anchor definitions and hovers, completion of directives, options and anchors, and the preview that follows the cursor.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Usage

```sh
pnpm exec presmium-language-server --stdio
```

It also takes `--node-ipc` and `--socket=<port>`. The VS Code extension starts it; other editors start it as a language server for Markdown files.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/lecture.en.md)

## License

Apache-2.0
