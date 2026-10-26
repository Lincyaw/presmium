# @lincyaw/addon-motion

Animations written in code: timelines made with GSAP, Anime.js, Motion, Three.js, Remotion or D3, played on the steps of a lecture and on the time of its narration.

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Install

```sh
pnpm add -D @lincyaw/addon-motion
```

Add this package to `metadata.plugins` in the document's `lecture.json`.

It is a Presmium plugin: its component works on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x). The animation libraries come with it.

## What it provides

- Scenes referenced by component definitions, with declared states and actual implementation timing. Stable document steps choose visible states; lecture timing belongs to `production`.
- Direct step navigation reconstructs a scene without replaying earlier steps. Authoring and presentation are separate views; ordinary document edits do not implicitly open narration or playback.
- `@lincyaw/addon-motion/scene`: `gsapScene`, `animeScene`, `motionScene`, `threeScene`, `remotionScene`, `d3Scene` and `defineScene`, to write a scene with each library.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/locales/en/lecture.json) (Chinese: `site/guide/lecture.json`)
- [Document contract](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/document.md): normalized entities, parameters, states and shared validation

## License

Apache-2.0
