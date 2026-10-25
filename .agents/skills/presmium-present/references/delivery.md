# Publishing, export and offline

Choose the build from the final deliverable. Run the commands below in the deck directory. Look at the existing `renderers` and `base` first, and do not override the deployment conventions already in place.

## Give readers a web address

`presmium build --to web` produces a static web site; built alone and without an explicit `base`, it sits at the root path. When a local static server is needed and the project has none, install `pnpm add -D sirv-cli`, then:

```sh
pnpm exec sirv dist/web --port 8080
```

Open the address the terminal prints. The site needs no SPA fallback: each section has its own HTML. Restart sirv after a rebuild, or it will not find the newly hashed files.

Build the student version into its own directory, for example `presmium build --to web --audience student --out dist-student`, and serve `dist-student/web` instead. With `--audience`, every file written is scanned for sentences of the content left out. Audience markers and publishing checks are in `presmium-author/references/publishing.md`. The static site can be deployed to any host the user chooses; building is not deploying.

## Deliver the web site and the slides together

Built together, with `base` set on neither, the web site is at `/web/` and the slides at `/slides/`. Keep the whole site structure:

```sh
presmium build --to web,slides
pnpm exec sirv dist --port 8080
```

Open the web site at `/web/` and the slides at `/slides/`. The slides are one page (`index.html`); the slide and step are in the address's query (`?slide=<number>&step=<step>`), so hosting needs no SPA fallback.

When only the slides are built and `base` is not set, use `pnpm exec sirv dist/slides --port 8080`. When a sub-path already exists, serve the output at that path; do not treat the `/slides/` output as a root site.

A section heading in the web site links to the same place in the slides. When the two are deployed separately, set the slides' actual address with `slidesUrl`, and check that the link lands on the right slide and step:

```yaml
presmium:
  presmium.web:
    slidesUrl: https://example.com/slides/
```

## Export a PDF or images

The deck lists `@lincyaw/addon-publish`. Export prints the slides in Chromium, so the project needs `playwright-chromium` (`pnpm add -D playwright-chromium`, then `pnpm exec playwright install chromium`). In the project:

```sh
pnpm exec presmium-export --format pdf --output lecture.pdf
```

`--with-clicks` expands each step into its own page, `--range 1,3-5` selects slides, `--dark` exports the dark theme, `--format png` writes images (one per slide, or per step with `--with-clicks`) into the `--output` directory, and `--format pptx` writes PowerPoint (each slide a picture, the narration as speaker notes, no links). `--json` prints the result as JSON. A PDF export checks that every link the slides show is still a link in the PDF and exits 1 when one was lost. In the workbench, Export in the command bar also produces slide PDFs, images, PowerPoint and lecture videos without the deck listing the publish plugin; the files can be opened, played and downloaded there. `presmium-export` builds its own copy of the slides at the root path before printing, so the static site's sub-path does not affect it.

After exporting, check the page count, missing pages, overflowing long code and the key links. Run panels show their static fallback and recorded output on paper. When a page is missing or the export times out (exit 2), read the error first, then retry or raise `--timeout` (milliseconds, default 120000). An incomplete file is not a finished export.

## Give students a runnable notebook

`presmium build --to notebook` writes `dist/notebook/<entry name>.ipynb`. Images and other files go into `media/` beside it; deliver the whole directory. The kernel is `python3` by default and is chosen with `renderers.notebook.kernel`.

Interactive components that cannot be converted fall back to a static form; read the build report. To link them to the online interactive version, set `renderers.notebook.webUrl`, and confirm in Jupyter that images and code cells work.

## Prepare an offline class

While online, open the actual teaching address and wait until the page and the offline cache are ready. Web pages and search are cached; the larger execution runtimes are fetched the first time they are used, so run the code you will use in advance, or choose "Save for offline use". Offline slides need the publish plugin, which pre-caches the runtimes.

Disconnect and rehearse in the same browser at the same address: moving through slides, search, media, running code. Remote Jupyter, classroom sync and external models still need the network. When the class must be fully offline, prepare recorded outputs or a runtime that works locally in advance.

`presmium: { presmium.publish: { offline: false } }` in the frontmatter turns the offline cache off; check the existing setting first. Rehearse again after the site address changes or after a rebuild; "it was opened before" does not prove this class's resources are all there.
