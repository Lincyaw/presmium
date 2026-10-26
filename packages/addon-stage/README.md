# @lincyaw/addon-stage

The stage: black screen, freezing the audience view, drawing on the slides, and footnotes shown next to the block that cites them.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
pnpm add -D @lincyaw/addon-stage
```

List it in the headmatter of the documents that use it:

```yaml
plugins:
  - '@lincyaw/addon-stage'
```

It is a Presmium plugin: its components work on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- The presenter's stage controls in the slides and the present view: black screen (`b`), freeze (`f`).
- Drawing on the slides (`d`, or the pen in the presentation bar: four inks, the eraser, undo, clear), with drauu. Each slide's drawing is shared between the presenter's and the audience's windows and the classroom, and kept in the document's `.presmium/drawings/` while a server serves the page.
- A pass that places footnote definitions beside the blocks that cite them.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/document.md) (Chinese): every directive with its options and an example

## License

Apache-2.0
