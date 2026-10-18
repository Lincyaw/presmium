# @presmium/web

Presmium's web renderer: a static VitePress site around the IR runtime, a page per chapter, with search, the site shell (navigation, footer, Open Graph, sitemap), translations with a language menu, links to the slides, and workspace sites of several documents.

Part of [Presmium](https://github.com/presmium/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
npm install -D @presmium/cli @presmium/web
```

`presmium build` builds it into `dist/web/` when it is installed (or `--to web`); `presmium dev --to web` runs its dev server.

## Configuration

In the headmatter, `renderers.web`: `base` (the site path), `port` (the dev server), and the site shell `nav`, `footer`, `head` and `sitemap`. At a workspace root, the same shell options go under `site` in `presmium.workspace.yaml`, with `home`, `lang` and `locales.<lang>.title`.

## Documentation

- [Author guide](https://github.com/presmium/presmium/blob/main/site/guide/lecture.en.md): media, workspaces and translations
- [Interfaces and versions](https://github.com/presmium/presmium/blob/main/docs/api.md)

## License

Apache-2.0
