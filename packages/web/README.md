# @lincyaw/web

Presmium's web renderer: one prebuilt viewer app shows teaching-document pages in `presmium dev`, `presmium serve`, the workbench and a built site. A built site holds the app once and each document as data beside its pages (its IR, search index, own code bundle and published files); its pages are rendered on the server and then hydrated. The site shell is Presmium's own: a page per chapter, navigation, outline, pager, search, translations with a language menu, light and dark, the phone layout, links to the slides, and workspace sites of several documents with a home page, a 404 page and a sitemap. Independent homepages use their own site-page data or a freely designed HTML entry. The slides form is the viewer app's slides page (`@lincyaw/render-slides`).

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Install

```sh
pnpm add -D @lincyaw/cli @lincyaw/web
```

`presmium build` builds it into `dist/web/` when it is installed (or `--to web`); `presmium dev --to web` runs its dev server.

## Configuration

In `lecture.json`, `metadata.renderers.web`: `base` (the site path), `port` (the dev server), `theme`, `params`, `layout`, and the site shell `nav`, `footer`, `head` and `sitemap`. At a workspace root, the shell options go under `site` in `presmium.workspace.yaml`, with `landing`, `home`, `lang` and `locales.<lang>.title`.

Choose the built-in `course`, `docs` or `showcase` theme; `docs` preserves the existing default. Theme parameters select an accent (`blue`, `teal`, `violet`, `amber`), typography (`reading`, `sans`), content width (`comfortable`, `wide`), and an optional `logo` with `logoAlt`. Omit `logoAlt` or set it to an empty string for a decorative logo beside the site title. Document layouts are `article` (default), `landing` and `wide`; `landing` combines all sections into one full-width HTML page. A workspace's theme and brand apply across its documents; each document can choose its own layout.

```yaml
title: My course
documents: ['*/lecture.json']
site:
  theme: course
  params:
    accent: teal
    typography: reading
    contentWidth: comfortable
  landing:
    source: ./site/home.json
```

`landing.source` selects an independent site page with a hero and sections, separate from teaching documents. The same page object can be written inline in `landing`. For a freely designed HTML/CSS/JavaScript page, use `landing: { template: './site/home.html' }` instead; Vite bundles that HTML entry and its assets. The template receives reader-facing site data in `script#presmium-site-data` (`schemaVersion`, `title`, `base`, `lang`, `documents`). Teaching content, steps and scripts still belong only in `lecture.json`. Existing `landing: welcome` remains supported: it displays all sections of `welcome/lecture.json` at the site root while keeping that document's normal pages. `home` retains its redirect behavior and cannot be set together with `landing`.

For a ready-to-publish workspace:

```sh
presmium new my-site --type site --theme course --title 'My course'
cd my-site
pnpm install
pnpm serve
```

`pnpm build` writes `dist/web/`. The generated GitHub Pages workflow builds and deploys that directory using the repository's Pages base path. The [site theme guide](https://github.com/Lincyaw/presmium/blob/main/docs/site-themes.md) covers parameters, page layouts, standalone documents and deployment.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/locales/en/lecture.json): media, workspaces and translations
- [Site themes](https://github.com/Lincyaw/presmium/blob/main/docs/site-themes.md): presets, independent homepages and GitHub Pages

## License

Apache-2.0
