# @lincyaw/addon-lecture

Lectures: recording in the present view, playback with the page's operations, lectures synthesized from the narration, and video export (`presmium-lecture`).

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Install

```sh
pnpm add -D @lincyaw/addon-lecture
```

Add this package to `metadata.plugins` in the document's `lecture.json`.

It is a Presmium plugin: its components work on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- The `lecture` renderer derives playback from structured narration and `production` settings, using completed exact text/voice speech caches.
- Narration text, pronunciation replacements and cue nodes refer to stable steps and blocks. Voice inheritance and playback timing have one owner in `production`.
- Explicit generation requires actual speech capability; normal preview does not silently synthesize missing audio. Recorded playback tracks remain derived media data.

Synthesis needs `@lincyaw/addon-speech` and a speech engine the operator defines.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/locales/en/lecture.json) (Chinese: `site/guide/lecture.json`)
- [Document contract](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/document.md): normalized entities, parameters, states and shared validation

## License

Apache-2.0
