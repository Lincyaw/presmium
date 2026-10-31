# Publishing documents

Teaching-document source is `lecture.json`; its outputs are derived snapshots and renderer files. A workspace configuration normally lists `documents: ['*/lecture.json']`. An independent site homepage is configured separately under `site.landing`; it is not a teaching-document entry. Ordinary README Markdown is not a document entry.

```sh
presmium check lesson --json
presmium build lesson --to web
presmium build lesson --to slides
presmium serve .
presmium build .
```

Build a single relevant document/form during routine work. A workspace build publishes the workspace website; `presmium serve` is the editing service, with the security and network access described by its help.

Renderer settings belong in `metadata.renderers`, plugin document settings in `metadata.presmium`. Content scopes (`only`, `audience`) stay on their blocks; a student build must remove excluded content from outputs, not merely hide it in a page. Use `--audience student` only when the document declares that audience.

Translations reference JSON entries in `metadata.translations`; `translationOf` binds an original entry and digest. Preserve IDs and bindings when updating a translation, and report stale material rather than pretending it matches.

Use `presmium-present` for classroom delivery, offline distribution and narrated/video output. Never publish credentials or operator settings in document JSON.

## Themed websites and homepage content

Create a workspace with a homepage, built-in theme and GitHub Pages workflow:

```sh
presmium new my-site --type site --theme course --title 'My course'
cd my-site
pnpm install
pnpm serve
```

The scaffold contains an independent homepage at `site/home.json`, a teaching document at `intro/lecture.json`, and `presmium.workspace.yaml`. `site.landing: { source: './site/home.json' }` selects the homepage file; a `SiteLandingPage` object can also be written directly in `site.landing`. The homepage uses its own `schemaVersion: 1`, `title`, optional description/hero, and required `sections` array. It is a site page, without teaching steps, narrations or production settings. Do not wrap independent homepage content in a teaching document or add it to `documents`.

For a freely designed homepage, use `site.landing: { template: './site/home.html' }`. Vite builds the HTML entry and its CSS, JavaScript and local assets; it is not a React/viewer-shell plugin. The injected `script#presmium-site-data` contains only `schemaVersion`, `title`, `base`, `lang`, and public `documents` (`id`, `title`, `href`, optional `description`, `lang`, `tags`, `pages`). Read its JSON and use published `href` values; create DOM nodes with text content for document titles. Do not insert document IR, diagnostics, configuration or operator settings into template data. `source` and `template` are exclusive. A served template rebuilds on page refresh; there is no template hot update channel.

Resolve JSON page media relative to that JSON file, inline media relative to the workspace configuration, and HTML assets relative to the HTML entry. Workspace `public/` files are published at the site root. Rebuild for deployment after changing the homepage.

Existing string configuration `site.landing: welcome` remains available when the author intentionally wants a teaching document as the homepage. That directory must belong to `documents`; all its sections appear at the site root and its document URL remains available. Keep `lecture.json` as the only editable content source for that teaching document. Existing `site.home` redirects to a document and cannot be combined with any form of `landing`.

In the workspace configuration, `site.theme` selects `course`, `docs` or `showcase`; the renderer defaults to `docs` to preserve existing sites, while a new `site` scaffold selects `course`. The workspace's theme and brand apply to all documents. `site.params` supports only these parameters:

| Parameter | Values |
|---|---|
| `accent` | `blue`, `teal`, `violet`, `amber` |
| `typography` | `reading`, `sans` |
| `contentWidth` | `comfortable`, `wide` |
| `logo`, `logoAlt` | The logo location and alternative text |

For a look of its own, `site.theme` names a theme directory (`./theme`) or an installed theme package instead of a built-in id. The directory holds `theme.json`:

```json
{
  "schemaVersion": 1,
  "name": "pixel",
  "extends": "docs",
  "params": { "typography": "sans" },
  "tokens": { "font-sans": "'IBM Plex Sans', system-ui, sans-serif", "color-bg": "#f6f6f1", "color-accent": "#2546b8", "radius-control": "0" },
  "dark": { "color-bg": "#121216", "color-accent": "#8ea6ff" },
  "fonts": ["https://fonts.googleapis.com/css2?family=Silkscreen&display=swap"],
  "styles": ["./pixel.css"]
}
```

`extends` picks the built-in layouts (default `docs`); `params` are defaults under the site's own `site.params`. `tokens` set design tokens by their name without `--pm-` (the build rejects unknown names); colors and shadows there are the light appearance's, and `dark` sets the dark ones, falling back to the built-in dark values. `fonts` are `https:` stylesheet URLs; `styles` are CSS files in the theme directory, which may use relative `url()`s to the directory's fonts and images. Every page carries `data-pm-site-theme-name="<name>"`, so a stylesheet scopes its rules with `[data-pm-site-theme-name='pixel']`. An HTML template homepage receives the stylesheets in the site data (`site.theme.stylesheets`) to link them itself. A theme package sets `presmium.theme` in its `package.json` to the directory with `theme.json`, or keeps `theme.json` at its root.

Keep each teaching document's page layout in `metadata.renderers.web.layout`: `article` (default), `landing` (all sections combined into one full-width HTML page without sidebars or page navigation), or `wide` (wider content without the right outline). Each translation uses its own layout, defaulting to `article` when omitted; it does not inherit the original's layout. A standalone document can select `theme` and `params` in its own `metadata.renderers.web`; do not use document themes to override the shared shell of a workspace site. A string `site.landing` adds a full-document root page without changing the original document's pagination; a document's own `layout: landing` changes that pagination. Independent site page content stays separate. Templates do not alter authored block/step identities, narration or production settings.

After changing website settings in `presmium.workspace.yaml`, restart `pnpm serve` for preview or run `pnpm build` again for the output. Existing serve sessions do not reload the workspace's website configuration.

`pnpm build` in the generated site writes `dist/web/`. Its `.github/workflows/pages.yml` reads GitHub Pages' base path, builds and deploys that directory after the repository's Pages source is set to GitHub Actions. Other hosts can serve the same static output. Check the real deployed root and an inner-page direct link, plus search and media; a successful local build does not verify the deployment path.

Themes do not import Office files or add Office previews. Existing media/plugin capabilities still determine what the page can display. The built-in themes and configuration are documented in the [site theme guide](https://github.com/Lincyaw/presmium/blob/main/docs/site-themes.md).
