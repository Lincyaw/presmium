# @lincyaw/addon-motion

Animations written in code: timelines made with GSAP, Anime.js, Motion, Three.js, Remotion or D3, played on the steps of a lecture and on the time of its narration.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
pnpm add -D @lincyaw/addon-motion
```

List it in the headmatter of the documents that use it:

```yaml
plugins:
  - '@lincyaw/addon-motion'
```

It is a Presmium plugin: its component works on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x). The animation libraries come with it.

## What it provides

- `{scene}`: a scene of the document's `scenes/`, cut into steps by `:durations:`. Each step plays its part of the timeline; going back shows the step settled; a lecture plays it on the narration's time, and a video export draws it frame by frame.
- `@lincyaw/addon-motion/scene`: `gsapScene`, `animeScene`, `motionScene`, `threeScene`, `remotionScene`, `d3Scene` and `defineScene`, to write a scene with each library.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/directives.md) (Chinese): every directive with its options and an example

## License

Apache-2.0
