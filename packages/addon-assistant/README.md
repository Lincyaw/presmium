# @lincyaw/addon-assistant

The readers' questions: readers ask about a lecture with their own model service.

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Install

```sh
pnpm add -D @lincyaw/addon-assistant
```

Add this package to `metadata.plugins` in the document's `lecture.json`.

It is a Presmium plugin: its components work on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

An Ask panel on the web page, the slides and the presenter view, also in static sites: readers ask about a section or a selection, with an OpenAI compatible model service they set up in their browser; the site needs no server and no operator setting. Listed among a workspace's operator plugins, every document of the workspace has it.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/locales/en/lecture.json) (Chinese: `site/guide/lecture.json`)
- [Document contract](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/document.md): normalized entities, parameters, states and shared validation

## License

Apache-2.0
