# @lincyaw/addon-lecture

Lectures: recording in the present view, playback with the page's operations, lectures synthesized from the narration, and video export (`presmium-lecture`).

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
pnpm add -D @lincyaw/addon-lecture
```

List it in the headmatter of the documents that use it:

```yaml
plugins:
  - '@lincyaw/addon-lecture'
```

It is a Presmium plugin: its components work on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- The `lecture` renderer: `presmium build --to web,lecture` synthesizes each step's narration with the voice of `renderers.lecture.voice`.
- Inline roles in narration: `{cue}` (`next`, `spot`, `hint`, `point`, `pause 2s` and others) and `{say}`.
- Recorded lectures in `lectures/<id>/track.json`, replayed with their operations; `presmium-lecture export` makes a video.

Synthesis needs `@lincyaw/addon-speech` and a speech engine the operator defines.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/directives.md) (Chinese): every directive with its options and an example

## License

Apache-2.0
