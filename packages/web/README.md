# @lincyaw/web

Presmium's web renderer: one prebuilt viewer app shows every page, in `presmium dev`, `presmium serve`, the workbench and a built site. A built site holds the app once and each document as data beside its pages (its IR, search index, own code bundle and published files); its pages are rendered on the server and then hydrated. The site shell is Presmium's own: a page per chapter, navigation, outline, pager, search, translations with a language menu, light and dark, the phone layout, links to the slides, and workspace sites of several documents with a home page, a 404 page and a sitemap. The slides form is the same app's slides page (`@lincyaw/render-slides`).

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Install

```sh
pnpm add -D @lincyaw/cli @lincyaw/web
```

`presmium build` builds it into `dist/web/` when it is installed (or `--to web`); `presmium dev --to web` runs its dev server.

## Configuration

In `lecture.json`, `metadata.renderers.web`: `base` (the site path), `port` (the dev server), and the site shell `nav`, `footer`, `head` and `sitemap`. At a workspace root, the same shell options go under `site` in `presmium.workspace.yaml`, with `home`, `lang` and `locales.<lang>.title`.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/locales/en/lecture.json): media, workspaces and translations

## License

Apache-2.0
