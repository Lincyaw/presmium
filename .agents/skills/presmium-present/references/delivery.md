> Editable source is `lecture.json`; renderer settings are under `metadata.renderers`, steps and narrations are explicit entities, and production timing/voices live only in `production`.

# Publishing, export and offline

Pick the build from what the teacher hands out. Run every command in the document folder. Before building, read the `metadata.renderers`: it lists the forms (`web`, `slides`, `notebook`, `lecture`) with their options, among them `base`, the URL path a form's site is served at (such as `/course/week1/`). When `base` is already set, the site is meant for that path: keep it and the hosting the teacher already uses.

`presmium build` writes into `dist/` (or the folder given with `--out`): one subfolder per form, such as `dist/web/`. Building is not deploying: copy the output to whatever host the teacher chooses.

## Give readers a web address

```sh
presmium build --to web
```

When only the web form is built and `base` is not set, `dist/web/` is a site for the root path `/`. To serve it on this computer when the project has no static server yet:

```sh
pnpm add -D sirv-cli
pnpm exec sirv dist/web --port 8080
```

Open the address the terminal prints; the document's first page appears. Each section has its own HTML file, so a host needs no single-page-app fallback rule. Restart sirv after every rebuild: the file names change and a running sirv does not see the new ones.

**Student version.** Build it into its own folder so nothing from a full build is mixed in, and serve `dist-student/web` instead:

```sh
presmium build --to web --audience student --out dist-student
```

`--audience student` leaves out content marked for teachers only (markers such as `:audience: teacher` are explained in `presmium-author/references/publishing.md`, "Content for students"). Every file written is then scanned for sentences of the left-out content; a hit is reported as `presmium.audience` and means teacher content leaked into the student version through some output; trace and fix it in the source. Then open the student site and look for teacher narration, answers and media.

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

A built site (web page and slides) keeps its pages and search in the browser's offline cache once opened. The code runtimes (what runs code in the browser) are larger and fetched only the first time code runs. So, while still online:

1. Open the exact address you will teach from, in the browser you will teach with, and wait until the page has loaded.
2. Run each piece of code the class uses once, or, with the publish plugin listed, click **Save for offline use** in the toolbar, which fetches the runtimes in advance. The publish plugin also copies remote images into the document at build time, so they show offline.
3. Disconnect the network and rehearse in the same browser at the same address: moving through slides, search, media, running code.

Remote Jupyter, the classroom server and AI models still need the network. When the class must be fully offline, prepare recorded outputs or a runtime that works locally.

`metadata.presmium["presmium.publish"].offline = false` in the document metadata turns the offline cache off; check whether it is set. Rehearse again after the site's address changes or after a rebuild: "it was opened before" does not prove this build's files are all cached.
