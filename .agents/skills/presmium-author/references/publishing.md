# Publishing, export and offline

`lecture.json` is the only editable source; every output is derived from it. A workspace configuration normally lists `documents: ['*/lecture.json']`; an independent site homepage is configured separately under `site.landing` and is not a teaching document. Ordinary README Markdown is not a document entry. To bring a folder of Markdown notes into a workspace, `presmium import notes --out . --exclude raw` writes one `lecture.json` per note (a page per level-1 and level-2 heading, `[[wikilinks]]` resolved by file name or alias, linked local files copied into the document's `attachments/`) and prints the `documents` patterns that list them. After this initial import, edit the generated documents through Web or author actions and publish their saved content. Never publish credentials or operator settings in document JSON.

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

### Write the homepage

The built-in themes lay a JSON homepage out the way blog and documentation sites lay out their front pages: a centred hero, then each section under a centred title, cards in a grid of equal widths centred as a group, running text in a reading column aligned to the start. The layout is the theme's; the homepage file decides only the words, their order and their length, and short words are what make the page look finished.

First decide whether the site needs a hero at all. A site of a few documents whose name in the header already says what it is (one explainer, a set of notes) needs none: leave `hero` out and the page starts at the documents. The file's `title` still names the page in the browser tab. Write a hero when the site has more to say than its name: a course with a term and an audience, a product. Then write it like this:

| Field | Write |
|---|---|
| `hero.eyebrow` | What the site is, in a few words: the course and term, or the topic (at most 12 Chinese characters or 5 English words). Leave it out rather than repeat the title. |
| `hero.title` | The site's name or its promise, on one line on a desktop: at most 16 Chinese characters or 8 English words, no closing punctuation. |
| `hero.description` | One or two sentences, at most 60 Chinese characters or 30 English words: who it is for and what they get. Not a list of features. |
| `hero.actions` | One `primary` action to the first thing to read (the first document's `/dir/`), and at most one `secondary` (a section anchor such as `#features`, or `documents.html`). A verb and its object: 开始阅读, 浏览课程. |
| `hero.image` | Only a picture of the content itself (a page, a slide, a diagram), shown under the words at most 24rem high; a transparent PNG or SVG, always with `imageAlt`. No stock photos. |

Sections, two to four, usually in this order: `features` (what a reader gets), `documents` (where to start), optionally `text` or `media`, and a closing `cta`. Give each a `title` of at most 10 Chinese characters or 5 English words, and a `description` only when one sentence adds something.

- `features`: three items (or six), written in parallel: a title of at most 8 Chinese characters or 4 English words, and a description of one or two lines on the card (at most 40 Chinese characters or 20 English words). Items of about the same length keep the cards the same height.
- `documents`: always include one, so that readers reach the content. The theme draws the list (`course`: one numbered column; `docs`: cards; `showcase`: large cards). Each card shows a document's `metadata.title`, `metadata.description` (write one sentence) and `metadata.tags` (one or two), so write those in every `lecture.json`.
- `text`: at most three short paragraphs; anything longer is a document.
- `media`: one image or video that shows the work, with `alt`, and `captions` for speech.
- `cta`: last, a short question or invitation and one action, usually the hero's primary action again.

`site.nav` in the workspace configuration holds only site-wide destinations: another site, the code repository, an about page. Do not add an entry per document; readers reach documents from the homepage list and the contents beside every document page, and a site without `nav` shows only its name and tools in the header.

No emoji, decorative symbols, exclamation marks, HTML or CSS in any field. Then look at the page in `presmium serve` at desktop width and below 768 px, light and dark: the hero title fits one line on the desktop, the lead runs two lines at most, and the feature cards are the same height.

For a freely designed homepage, use `site.landing: { template: './site/home.html' }`. Vite builds the HTML entry and its CSS, JavaScript and local assets; it is not a React/viewer-shell plugin. The injected `script#presmium-site-data` contains only `schemaVersion`, `title`, `base`, `lang`, and public `documents` (`id`, `title`, `href`, optional `description`, `lang`, `tags`, `pages`). Read its JSON and use published `href` values; create DOM nodes with text content for document titles. Do not insert document IR, diagnostics, configuration or operator settings into template data. `source` and `template` are exclusive. A served template rebuilds on page refresh; there is no template hot update channel.

Resolve JSON page media relative to that JSON file, inline media relative to the workspace configuration, and HTML assets relative to the HTML entry. Workspace `public/` files are published at the site root. Rebuild for deployment after changing the homepage.

Existing string configuration `site.landing: welcome` remains available when the author intentionally wants a teaching document as the homepage. That directory must belong to `documents`; all its sections appear at the site root and its document URL remains available. Keep `lecture.json` as the only editable content source for that teaching document. Existing `site.home` redirects to a document and cannot be combined with any form of `landing`.

In the workspace configuration, `site.theme` selects `course`, `docs` or `showcase`; the renderer defaults to `docs`, while a new `site` scaffold selects `course`. All three share one surface: a cool light grey page (near-black in dark mode) under a translucent header with the site's name and navigation, sans-serif type and pill-shaped buttons. The workspace's theme and brand apply to all documents. `site.params` supports only these parameters:

| Parameter | Values | Default (`docs`, `course` / `showcase`) |
|---|---|---|
| `accent` | `blue`, `teal`, `violet`, `amber` | `blue` / `violet` |
| `typography` | `reading` (serif text), `sans` | `sans` / `sans` |
| `contentWidth` | `comfortable`, `wide` | `comfortable` / `wide` |
| `logo`, `logoAlt` | The logo location and alternative text | none |

Leave a parameter out to take the theme's default; a site that names `accent: teal` or `typography: reading` keeps that choice.

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

A workspace build also builds the presentation of every document whose `metadata.renderers` lists `slides` or `lecture`: `<dir>/slides/` and `<dir>/lecture/` beside its pages. A template homepage finds a document's presentation in the site data (`documents[i].slides`) and can play its lecture in an iframe at `<slides>?view=present&track=<id>&autoplay`, starting at a step with `section=<id>&step=<n>`. `@lincyaw/presmium/site` gives it `prefetchPresentation(slides)` (fetch ahead of the click) and `whenPresentationReady(frame, ready, { lecture: true })` (called once the scene is drawn and the lecture is playing, paused, waiting for a click, or failed). Images referenced by `import` or a static relative `new URL('./figure.png', import.meta.url)` (48 KB or more) are published as WebP. The URL constructor must be the native global; dynamic paths and URL queries/fragments retain their original handling.

After changing website settings in `presmium.workspace.yaml`, restart `pnpm serve` for preview or run `pnpm build` again for the output. Existing serve sessions do not reload the workspace's website configuration.

`pnpm build` in the generated site writes `dist/web/`. Its `.github/workflows/pages.yml` reads GitHub Pages' base path, builds and deploys that directory after the repository's Pages source is set to GitHub Actions. Other hosts can serve the same static output. Check the real deployed root and an inner-page direct link, plus search and media; a successful local build does not verify the deployment path.

Themes do not import Office files or add Office previews. Existing media/plugin capabilities still determine what the page can display. The built-in themes and configuration are documented in the [site theme guide](https://github.com/Lincyaw/presmium/blob/main/docs/site-themes.md).
