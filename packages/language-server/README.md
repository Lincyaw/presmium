# @lincyaw/language-server

Language server for canonical `lecture.json` teaching documents: shared validation, normalized entity definitions, project code anchor definitions and hovers, and preview synchronization by stable page ownership.

Part of [Presmium](https://github.com/Lincyaw/presmium), which derives web pages, slides, Jupyter notebooks and narrated playback from the same teaching document.

## Usage

```sh
pnpm exec presmium-language-server --stdio
```

It also takes `--node-ipc` and `--socket=<port>`. Clients select `**/lecture.json` using their native JSON editor and associate the public kernel schema for completion. The VS Code extension generates and bundles this schema from `DOCUMENT_JSON_SCHEMA`; the server adds syntax and domain graph diagnostics using `validateDocument`.

Opened buffers are validated without writing or compiling unsaved text. Saving JSON and notifications for watched project inputs trigger a real compiler run. Diagnostics resolve JSON pointers to token ranges; entity and `origin.anchor` definitions navigate to their authoritative JSON or project code. `presmium/section` locates a page from the entity under the cursor, including normalized blocks, steps and narration. `presmium/preview` starts a real `presmium dev` web server for the canonical entry and stops it when the language server closes.

Compilation and preview prefer the document's installed `@lincyaw/presmium` package, which supplies its bundled plugins and renderers. A standalone installation uses the project's CLI or the language server's own CLI dependencies.

The server does not register its own completion provider: JSON schema completion remains with the editor. The studio provides native rich-text editing of the same `lecture.json` document.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/locales/en/lecture.json)

## License

Apache-2.0
