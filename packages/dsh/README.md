# @lincyaw/dsh

Presmium's bundle for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (MIT): Presmium's workbench as a DeepSeek Harness distribution. Its host side keeps web sessions at the workspace root with read/write access throughout that directory. Selecting a lecture updates Presmium's document tools and context without changing the session or its working directory. It also provides Presmium's approval policy, authoring skills, and the workbench's data routes. Its client side (`./client`, precompiled) replaces DeepSeek Harness's layout with Presmium's (activity bar, file tree, source editor, problems and live preview, the conversation docked at the right), maps its colours onto Presmium's and puts Presmium's brand in its places. Experimental (0.x): it follows one exact version of DeepSeek Harness, `0.2.1-alpha.4`.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Usage

`presmium studio` installs and starts it; you do not add it yourself. A launcher of its own writes a profile with `@lincyaw/dsh/launch` (`writeProfile`), passes the patches `launchPatches(carrier)` returns with `--patch`, and sets `launchEnv(dshHome)`; with `PRESMIUM_SERVICE_URL` and `PRESMIUM_SERVICE_TOKEN` it uses that workspace service, otherwise it starts `presmium serve` itself.

In a checkout of the repository the client bundle is built when DeepSeek Harness starts and its sources are newer (`build/ensure.mjs`); `node build/client.mjs` builds it by hand, and packing the package (`prepack`) builds it for publishing.

Conversation file links, code line references and the workspace file list open the same central editor. The adapter uses Harness's public resource resolver and workspace path helpers, keeping line locations, open tabs and unsaved changes together. Images, PDF, Office, spreadsheets and HTML retain Harness's dedicated previews. The same routing applies when Harness's own layout is enabled.

Presmium provides one navigation shell and composes Harness's session browser and settings through public slots. Chat history is the single activity entry for history and conversation; selecting a history row restores chat even when the same session was hidden. Plugins and automations sit beside Settings in the activity bar and open global panels without losing document drafts. New chat, history and close actions use the conversation's resident header; the duplicate right-sidebar opener is removed. Auxiliary panels follow the actual resized track; on smaller windows, panels give way rather than covering each other. The fallback layout enables both Harness's `ui-layout` and `ui-sidebar`.

## Documentation

Studio keeps the teaching workflow simple: describe a change, inspect its preview, select the relevant content and review the agent's edit. Full code editing can use the VS Code extension. Each agent step receives current document, focus and bounded browser feedback. `presmium__get_diagnostics` reads source findings, `presmium__get_outputs` reads compiled recordings, and `presmium__get_runtime` reads reported browser failures, live code results and session resets. These reports are observations, not verification of newly edited source; rerun affected code after a change. No author window means no browser feedback is available.

- [Design of the workbench on DeepSeek Harness](https://github.com/Lincyaw/presmium/blob/main/docs/design-dsh.md)

## License

Apache-2.0. DeepSeek Harness is a separate project under the MIT license; this package is not affiliated with or endorsed by DeepSeek.
