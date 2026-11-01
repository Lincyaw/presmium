# Publishing, export and offline

`lecture.json` is the only editable source; every output is derived from it. A workspace configuration normally lists `documents: ['*/lecture.json']`; an independent site homepage is configured separately under `site.landing` and is not a teaching document. Ordinary README Markdown is not a document entry. Never publish credentials or operator settings in document JSON.

Pick the build from what the teacher hands out, and build only the relevant document and form during routine work. Run document commands in the document folder. Before building, read `metadata.renderers`: it lists the forms (`web`, `slides`, `notebook`, `lecture`) with their options, among them `base`, the URL path a form's site is served at (such as `/course/week1/`). When `base` is already set, keep it and the hosting the teacher already uses. Plugin document settings belong in `metadata.presmium`.

```sh
presmium check lesson --json
presmium build lesson --to web
presmium build lesson --to slides
presmium serve .
presmium build .
```

`presmium build` writes into `dist/` (or the folder given with `--out`): one subfolder per form, such as `dist/web/`. A workspace build publishes the workspace website. `presmium serve` is the editing service, with the security and network access described by its help. Building is not deploying: copy the output to whatever host the teacher chooses.

## Give readers a web address

```sh
presmium build --to web
```

When only the web form is built and `base` is not set, `dist/web/` is a site for the root path `/`. To serve it on this computer when the project has no static server yet:

```sh
pnpm add -D sirv-cli
pnpm exec sirv dist/web --port 8080
```

Open the address the terminal prints; the document's first page appears. Chapter pages have their own HTML files; a document with `metadata.renderers.web.layout: landing` combines all sections into one HTML page. A host needs no single-page-app fallback rule. Restart sirv after every rebuild: the file names change and a running sirv does not see the new ones.

## Content for students

Content scopes stay on their blocks: `audience` limits a block (or a section) to the named audiences, such as `audience: ["teacher"]` for answers and teaching notes, and `only` limits it to forms. A student build must remove excluded content from its outputs, not merely hide it on a page. Use `--audience student` only when the document declares that audience, and build it into its own folder so nothing from a full build is mixed in:

```sh
presmium build --to web --audience student --out dist-student
```

Every file written is then scanned for sentences of the left-out content; a hit is reported as `presmium.audience` and means teacher content leaked into the student version through some output: trace and fix it in the source. Then open the student site and look for teacher narration, answers and media.

## Translations

Translations reference JSON entries in `metadata.translations`; `translationOf` binds an original entry and digest. Preserve IDs and bindings when updating a translation, and report stale material rather than pretending it matches. A translation is written by the same rules as its original ([Writing](writing.md)): in the target language's own order and idiom, not word for word.

## Hand out the web page and the slides together

Built together, with `base` set on neither, the web page is at `/web/` and the slides at `/slides/` of one site. Serve the whole `dist/` folder:

```sh
presmium build --to web,slides
pnpm exec sirv dist --port 8080
```

Open `<address>/web/` and `<address>/slides/`. The slides are one page (`index.html`); the slide and step are in the address's query (`?slide=<number>&step=<step>`), so a host needs no fallback rule here either.

When only the slides are built and `base` is not set, serve `dist/slides` instead (`pnpm exec sirv dist/slides --port 8080`). When the site already lives under a sub-path, serve the output at that path.

Each section heading on the web page links to the same place in the slides. When the two are deployed at different addresses, write the slides' real address in the document metadata, then check that a heading link lands on the right slide and step:

```json
{ "presmium.web": { "slidesUrl": "https://example.com/slides/" } }
```

## Export a PDF, images or PowerPoint

Export prints the slides in Chromium. Set it up once in the project:

```sh
pnpm add -D @lincyaw/addon-publish playwright-chromium
pnpm exec playwright install chromium
```

and list `'@lincyaw/addon-publish'` in the document metadata's `plugins`. Then, in the document folder:

```sh
pnpm exec presmium-export --format pdf --output lecture.pdf
```

| Option | Does |
|---|---|
| `--format pdf` (default), `png`, `pptx` | PDF; PNG images, one per slide, into the `--output` folder; PowerPoint, each slide a picture, the narration as speaker notes, no links |
| `--output <file or folder>` | Where to write |
| `--with-clicks` | One page (or image) per step instead of per slide |
| `--range 1,3-5` | Only these slides |
| `--dark` | The dark theme |
| `--timeout <ms>` | How long a page may take to be ready (default 120000) |
| `--json` | Print the result as JSON |

`presmium-export` builds its own copy of the slides before printing, so the site's `base` does not affect it. A PDF export checks that every link the slides show is still a link in the PDF, and exits with code 1 when one was lost. Exit code 2 means a page was missing or the export timed out: read the error, then retry or raise `--timeout`. A file from a failed run is not a finished export.

In the studio, **Export** in the command bar makes the same PDFs, images and PowerPoint (and lecture videos) without the publish plugin listed; the files can be opened, played and downloaded there.

Afterwards, open the file and check the page count, missing pages, long code running off the page and the key links. Code that readers can run in the browser is printed with its recorded output.

## Give students a runnable notebook

```sh
presmium build --to notebook
```

This writes `dist/notebook/<name>.ipynb`, named after the entry file (`lecture.ipynb` for `lecture.json`), with images and other files in `media/` beside it; hand out the whole `dist/notebook/` folder. The kernel is `python3` unless the `metadata.renderers.notebook` says otherwise. Interactive components that a notebook cannot hold become a static form; the build report lists them. To link them to the online version, set the web address:

```json
{ "notebook": { "kernel": "python3", "webUrl": "https://example.com/course/" } }
```

Open the notebook in Jupyter and check that images show and code cells run.

## Prepare an offline class

A built web site keeps each document's pages and search in a separate browser cache after that document is opened. The code runtimes (what runs code in the browser) are larger and fetched only the first time code runs. So, while still online:

1. Open every document you will teach from at its exact deployed address, in the browser you will teach with, and wait until each page has loaded.
2. Run each piece of code the class uses once, or, with the publish plugin listed, click **Save for offline use** in the toolbar, which fetches the runtimes in advance. The publish plugin also copies remote images into the document at build time, so they show offline.
3. Disconnect the network and rehearse in the same browser at the same address: moving through slides, search, media, running code.

Remote Jupyter, the classroom server and AI models still need the network. When the class must be fully offline, prepare recorded outputs or a runtime that works locally.

`metadata.presmium["presmium.publish"].offline = false` in the document metadata turns the offline cache off; check whether it is set. Rehearse again after the site's address changes or after a rebuild: "it was opened before" does not prove this build's files are all cached.

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

`extends` picks the built-in layouts (default `docs`); `params` are defaults under the site's own `site.params`. `tokens` set design tokens by their name without `--pm-` (the build rejects unknown names); colors and shadows there are the light appearance's, and `dark` sets the dark ones, falling back to the built-in dark values. `fonts` are `https:` stylesheet URLs; `styles` are CSS files in the theme directory, which may use relative `url()`s to the directory's fonts and images. Every page carries `data-pm-site-theme-name="<name>"`, so a stylesheet scopes its rules with `[data-pm-site-theme-name='pixel']`. An HTML template homepage gets the stylesheets linked at the start of its `<head>`, before its own CSS, and marks its `<body>` with the same attribute. A theme package sets `presmium.theme` in its `package.json` to the directory with `theme.json`, or keeps `theme.json` at its root.

Keep each teaching document's page layout in `metadata.renderers.web.layout`: `article` (default), `landing` (all sections combined into one full-width HTML page without sidebars or page navigation), or `wide` (wider content without the right outline). Each translation uses its own layout, defaulting to `article` when omitted; it does not inherit the original's layout. A standalone document can select `theme` and `params` in its own `metadata.renderers.web`; do not use document themes to override the shared shell of a workspace site. A string `site.landing` adds a full-document root page without changing the original document's pagination; a document's own `layout: landing` changes that pagination. Independent site page content stays separate. Templates do not alter authored block/step identities, narration or production settings.

A workspace build also builds the presentation of every document whose `metadata.renderers` lists `slides` or `lecture`: `<dir>/slides/` and `<dir>/lecture/` beside its pages. A template homepage finds a document's presentation in the site data (`documents[i].slides`) and can play its lecture in an iframe at `<slides>?view=present&track=<id>&autoplay`, starting at a step with `section=<id>&step=<n>`. `@lincyaw/presmium/site` gives it `prefetchPresentation(slides)` (fetch ahead of the click) and `whenPresentationReady(frame, ready, { lecture: true })` (called once the scene is drawn and the lecture is playing, paused, waiting for a click, or failed). Images that scenes and the template `import` (48 KB or more) are published as WebP.

After changing website settings in `presmium.workspace.yaml`, restart `pnpm serve` for preview or run `pnpm build` again for the output. Existing serve sessions do not reload the workspace's website configuration.

`pnpm build` in the generated site writes `dist/web/`. Its `.github/workflows/pages.yml` reads GitHub Pages' base path, builds and deploys that directory after the repository's Pages source is set to GitHub Actions. Other hosts can serve the same static output. Check the real deployed root and an inner-page direct link, plus search and media; a successful local build does not verify the deployment path.

Themes do not import Office files or add Office previews. Existing media/plugin capabilities still determine what the page can display. The built-in themes and configuration are documented in the [site theme guide](https://github.com/Lincyaw/presmium/blob/main/docs/site-themes.md).
