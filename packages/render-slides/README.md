# @lincyaw/render-slides

Presmium's slides renderer: the slides are the viewer's slides page, built and served as the web form is (`@lincyaw/web`). Each section is a slide on a canvas of a fixed size, drawn in the Book (书卷) layout and scaled as a whole to the screen; plugin components render in it as on the web page. It also gives the document's exports of the slides: PDF, pictures and PowerPoint.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
pnpm add -D @lincyaw/cli @lincyaw/web @lincyaw/render-slides
```

`presmium build` builds the slides into `dist/slides/` when it is installed (or `--to slides`); `presmium dev --to slides` serves the slides page (`?form=slides`).

The exports print the slides page in Chromium, from `playwright-chromium`, an optional peer dependency. Install it in the document's project to export:

```sh
pnpm add -D playwright-chromium
pnpm exec playwright install chromium
```

## Configuration

In the headmatter, `renderers.slides`: `base` (the site path), `port` (the dev server), `aspectRatio` (`16/9` by default; `4:3` or a number) and `canvasWidth` (980 by default), which give the canvas the slides are drawn on.

A section's `{hints}` gives its slide, under `slides`: `layout` (`default`, `cover`, `center` or `full`; the first section is `cover` unless it says otherwise), `class` (classes added to the slide) and `zoom` (a scale of its content).

## Exports

The exporters `pdf`, `png` (a picture of each slide, or of each step) and `pptx` (a picture of each slide, its narration as the speaker notes) run as the workspace service's jobs and from `presmium-export` (`@lincyaw/addon-publish`).

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/lecture.en.md)

## License

Apache-2.0
