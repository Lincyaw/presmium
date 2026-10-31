---
'@lincyaw/kernel': minor
'@lincyaw/compiler': minor
'@lincyaw/workspace': minor
'@lincyaw/server': minor
'@lincyaw/mcp': minor
'@lincyaw/workbench': minor
'@lincyaw/dsh': patch
'@lincyaw/design': patch
'@lincyaw/web': patch
'@lincyaw/render-slides': minor
'@lincyaw/addon-lecture': minor
'@lincyaw/addon-publish': minor
---

Heavy outputs are compile jobs, as in Overleaf: the author or the AI starts them, sees their progress and log, and opens, plays or downloads their files.

- `@lincyaw/kernel`: `PresmiumNodePlugin.exporters` (`Exporter`, `ExportContext`, `ExportOutput`); `RenderContext.log`; the jobs' types (`OutputTarget`, `CompileJob`, `JobFile`, `JobsAnswer`) and `OutputJobs`, the hosts' interface; `forEachLine` in `@lincyaw/kernel/node`.
- `@lincyaw/compiler`: `BuildOptions.base` and `log`; `availableRenderers` and `documentExporters`; `serveDirectory` serves files through `send` (ranges, validators, conditional requests), with `?download` attachments and `origins` (CORS).
- `@lincyaw/render-slides`: the slides as PDF or PowerPoint (`pdf`, `pptx`), for any document with the slides form; the Slidev build's output goes to the job's log.
- `@lincyaw/addon-lecture`: the lecture as a video (`video`), with its captions and the frames' progress; `exportVideo` reports captions with their language.
- `@lincyaw/addon-publish`: `presmium-export --format pptx`; its tools' output can go to a log, and a signal stops them.
- `@lincyaw/workspace`: the jobs, one at a time, their files below `/__outputs/`, a revision made once; the `jobs`, `jobs/cancel` and `jobs/events` routes; the server host's `build` runs as jobs.
- `@lincyaw/server`, `@lincyaw/mcp`: `ServerHost.jobs`; MCP `build` starts jobs (renderers and exports, `wait`), `get_builds` lists them.
- `@lincyaw/workbench`: the Export pane; `@lincyaw/dsh` proxies the job routes and tells the AI about them; `@lincyaw/design`: the `export`, `download`, `video`, `website` and `notebook` icons.
