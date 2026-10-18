# @presmium/slidev-addon-content

Rich content: mind maps, PlantUML diagrams, video, audio, animations and YouTube.

Part of [Presmium](https://github.com/presmium/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
npm install -D @presmium/slidev-addon-content
```

List it in the headmatter of the documents that use it:

```yaml
plugins:
  - '@presmium/slidev-addon-content'
```

It is a Presmium plugin and a Slidev addon: its components work on the web page and in the slides. It needs `@presmium/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- `{markmap}`: a mind map from a Markdown list.
- `{video}`, `{audio}`, `{animation}` and `{youtube}`: media, with captions in several languages.
- `{plantuml}`: diagrams, localized into `.presmium/assets/` when built.

## Documentation

- [Author guide](https://github.com/presmium/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/presmium/presmium/blob/main/.agents/skills/presmium-author/references/directives.md) (Chinese): every directive with its options and an example
- [Interfaces and versions](https://github.com/presmium/presmium/blob/main/docs/api.md)

## License

Apache-2.0
