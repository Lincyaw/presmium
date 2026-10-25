---
title: Author guide
lang: en
description: Write lectures in MyST Markdown and publish them as web pages, slides, notebooks and narrated lectures
translationOf: { entry: lecture.md, digest: 7a4ba99423cbd87f5d820a91503db80f7f920b92e0a6925b07c3e055b481e277 }
---

(guide)=
# Author guide

Presmium compiles a lecture written in MyST Markdown into an intermediate representation (IR), from which renderers make web pages, slides (Slidev), Jupyter notebooks and narrated lectures. A lecture is plain text that can live in the same git repository as the code it explains; its code blocks can quote the repository's real code, run when it is built, and run in the reader's browser.

This guide is for people who write lectures. It starts with installing Presmium and a first document, then covers the syntax, the media, running code, lectures and speech, the AI assistant and reader questions, workspaces and publishing. People who write plugins should read the [plugin guide](../plugins/lecture.md).

(start)=
# Getting started

(start-install)=
## Install

Presmium needs Node.js 22.19 or later and pnpm (`corepack enable pnpm`; run `pnpm setup` once before the first global install). Install `presmium` globally; it comes with the three renderers and every official plugin:

```sh
pnpm add -g @lincyaw/presmium
presmium new        # asks which kind of project (a lecture, a workspace or a plugin) and writes its directory and a first document
```

A document needs nothing more installed for `presmium check`, `dev` and `build`. Third-party plugins are installed in the document's project (`pnpm add -D <package>`). A new project lists the version of `presmium` in its `package.json`: after `pnpm install` there, the global `presmium` command hands over to the project's copy, so the project decides the version. Code blocks that run at build time use the machine's `python3` or `node`.

(start-first)=
## A first document

A document is a directory whose entry file is `lecture.md`:

````md
---
title: Binary search
lang: en
plugins:
  - '@lincyaw/addon-core'
---

# Binary search

Find a number in a sorted array, ruling out half of it at each step.

## The idea

```python
def search(xs, x):
    lo, hi = 0, len(xs)
    while lo < hi:
        mid = (lo + hi) // 2
        if xs[mid] < x:
            lo = mid + 1
        else:
            hi = mid
    return lo
```

Look at the middle element first: when it is smaller than the number, the answer is in the right half.
````

The `#` heading is the document's title, and each `##` starts a section. The code block in the section is on-screen content, shown on the slide; the paragraph is narration, the body text of the web page and the speaker notes of the slide.

(start-commands)=
## Commands

Run them in the document's directory (or give the directory or the entry file as the argument):

| Command | What it does |
|---|---|
| `presmium check` | Compiles and checks the syntax, the plugins' checks and broken links; prints the findings only |
| `presmium dev` | Starts the dev servers; pages update in place when you save |
| `presmium build` | Builds every medium: `dist/ir.json` and `dist/<renderer>/` |
| `presmium ir` | Prints the IR as JSON, to see what the compiler made |

Each finding is printed as `<file>:<line>  <severity>  <message>  (<check id>)`. Exit code 0 means no errors, 1 error findings, 2 a usage error. The usual loop: edit the source, `presmium check`, `presmium dev --to web` to watch the result, and finally `presmium build`.

(syntax)=
# Syntax

(syntax-headmatter)=
## The headmatter

```yaml
---
title: Byte pair encoding
lang: en                    # the document's language: <html lang>, the interface and the text written into outputs; default zh-CN
plugins:                    # the plugin packages it uses
  - '@lincyaw/addon-core'
  - '@lincyaw/addon-code'
presmium:                   # the plugins' configuration, keyed by plugin id
  presmium.code: { repo: https://github.com/org/repo }
renderers:                  # the renderers built by default, and their configuration
  web: {}
  slides: {}
  notebook: {}
sectionDepth: 2             # the heading level that starts a section, default 2
---
```

A directive of a plugin not listed in `plugins` is an error, `unknown directive`. Without `renderers`, every installed renderer is built.

(syntax-sections)=
## Sections, narration and on-screen content

- What comes before the first `##` is the cover; each later `#` is a chapter title, and the web form has a page per chapter.
- A label on the line before a heading, `(merge)=`, gives the section a stable id: deep links, the jumps between the web page and the slides, and translations use it. Keep it once published.
- Paragraphs, lists and quotes are narration; code blocks, images, tables, math, diagrams and plugin directives are on-screen content. To put a list on the slide, wrap it in `{slide}`:

````md
:::{slide}
- count the adjacent byte pairs
- merge the most frequent pair
:::
````

(syntax-steps)=
## Steps

On-screen content shows at step 0. `:reveal:` makes a block appear at the next step, and `:reveal: items` on a `{slide}` reveals its list item by item. Narration binds, in order, to the nearest on-screen block before it: the first paragraph belongs to the step at which the block appears, the second to the next step. So to narrate step by step, write the paragraphs after the block in the order of its steps. `presmium ir` prints each block's `at` (the step at which it appears) to check this.

(syntax-only)=
## Media and layout hints

- `:::{only} web, notebook` keeps content in the listed renderers only.
- `:::{hints}` gives layout hints per renderer: `slides: { layout: center }` goes into the slide's Slidev headmatter, `web: { layout: scrolly }` gives the section a scrollytelling layout on the web page.
- `:::{config}` gives plugins configuration for this section only.
- `{include}` includes another file (relative to the current one), so a long lecture can have a file per chapter.

(syntax-references)=
## Labels and cross-references

`(id)=` before a block, or a directive's `:label:`, gives the block an id. `` {ref}`merge` `` refers to a section, with its title as the text; `{numref}` and `{eq}` refer to labelled figures, tables and equations. A target that does not exist is a warning of `presmium check`, `presmium.references`.

(syntax-code)=
## Quoting real code

`{code-ref}` of `@lincyaw/addon-code` quotes code of the repository instead of copying it. The anchor is `region:src/bpe.py#merge` (a `#region` comment in the code), `symbol:src/bpe.py#BPE.merge` (a declaration in the syntax tree) or `pattern:` (an ast-grep pattern). `:pin:` reads the code of a commit and makes a permanent link to it; when pinned code changed in the working tree, `presmium check` warns of the drift and shows the diff.

(media)=
# Media

(media-forms)=
## Four media

| Renderer | Package | Output |
|---|---|---|
| `web` | `@lincyaw/web` | A static site: a page per chapter, search, navigation and footer |
| `slides` | `@lincyaw/render-slides` | Slidev slides with the default theme Book (书卷); export to PDF and PNG |
| `notebook` | `@lincyaw/render-notebook` | A Jupyter notebook: narration in Markdown cells, code in code cells |
| `lecture` | `@lincyaw/addon-lecture` | A lecture: the narration synthesized as speech, replayed with the page's operations |

`presmium build --to web,slides` builds only the listed renderers. A plugin's component is the same component on the web page and in the slides; static media such as the notebook show the component's fallback, or a line that links the web page when it has none.

(media-site)=
## The site shell and addresses

`renderers.web` can give the site a navigation bar and a footer: `nav` (a list of `{ text, link }`), `footer` (`message`, `copyright`), `head` (`description` and `image`, for Open Graph) and `sitemap` (`hostname`). When the web pages and the slides are built together and neither sets `base`, the web pages are under `/web/` and the slides under `/slides/`, so `dist/` is one site; a single renderer is built at `/`.

(media-files)=
## Files published with the document

Local files that links, images and the `src` and `href` of raw HTML name are published with every medium, under names with a hash of their content. A link to a directory of the document (such as `[starter code](starter/)`) publishes its files and a page that lists them; hidden files and `node_modules` are not published.

(media-translations)=
## Translations

The original's headmatter declares `translations: { en: lecture.en.md }`; the translation's own headmatter has `title`, `lang` and `translationOf: { entry: lecture.md, digest: <digest> }`, and its section labels are the original's. The web form publishes the translation under `/<lang>/`, and the language menu stays on the same chapter. When the original changes, `presmium check` warns that the translation is out of date and gives the new digest: check the translation, then write the digest back.

(execution)=
# Running code

(execution-when)=
## At build time and in the browser

- `:run:` (or `:run: compile`) runs a code block when the document is built; the output goes into the IR and every medium shows it.
- `:run: live` lets readers run it in the browser: code blocks on the web page get a run button, and Python runs in Pyodide, offline too. `:run: both` does both.
- Code blocks of the same `:session:` share an interpreter: a later block uses what an earlier one defined.
- `:echo: false` shows the output only; objects passed to `display()`, images and tables are recorded as rich output.

````md
```{code} python
:run:
print(sum(range(10)))
```
````

(execution-languages)=
## Languages and executors

Python and JavaScript run with the machine's `python3` and `node`. `@lincyaw/addon-exec-wasi` runs C, C++, Ruby and SQL in WebAssembly, with the same runtime at build time and in the browser; `@lincyaw/addon-exec-webgpu` runs WGSL compute shaders on the browser's GPU.

(execution-environments)=
## Named environments

`execute.environments` in the headmatter declares named environments, and a code block picks one with `:env: <name>`: `devcontainer` (`@lincyaw/addon-exec-local`, a local container), `jupyter` (`@lincyaw/addon-exec-jupyter`, a remote Jupyter server), `wasi` and `webgpu`. The headmatter holds no credentials: they come only from the environment variables of the process that runs `presmium`, such as `PRESMIUM_ENV_<name>_TOKEN`. `presmium check --env` connects to each declared environment.

(execution-cache)=
## Cache and sandbox

Outputs are cached in `.presmium/freeze/`, keyed by a hash of the code, the language, the options and the runtime: unchanged code does not run again, and once the directory is committed, others build without the runtime. Code run at build time gets a cleaned environment (variables whose names look like credentials are removed).

(lecture)=
# Lectures and speech

(lecture-script)=
## The narration is the script

List `@lincyaw/addon-lecture` and `@lincyaw/addon-speech`, pick a voice in `renderers.lecture.voice`, and `presmium build --to web,lecture` synthesizes the narration of each step into a lecture: as it plays, the page moves through the steps. The narration can hold inline cues:

- ``{cue}`next` `` moves one step on here, ``{cue}`pause 2s` `` pauses for two seconds;
- ``{cue to=code-1 lines=2-3}`spot` `` spotlights two lines of the code as the next word is spoken;
- ``{say alias="B P E"}`BPE` `` reads out another spelling.

(lecture-speech)=
## Speech engines

The operator defines speech engines in environment variables (`PRESMIUM_SPEECH_<ID>_URL`, `_PROVIDER` and, optionally, `_KEY`); the document names the engine's id only. An engine that only synthesizes or only transcribes has `none` as its other model (`_TRANSCRIBE_MODEL=none` or `_MODEL=none`), and each task goes to an engine that does it. Synthesized audio is cached in `.presmium/speech/`; once it is committed, others build without calling the speech service and without credentials. Synthesized speech is marked as AI generated in the player and in the audio's metadata, and cloning someone's voice needs a record of their consent.

(lecture-recorded)=
## Recorded lectures

A speaker can also record a lecture in the presentation view: the voice and the operations on the page (moving through steps, spotlights, ink) are recorded together in `lectures/<id>/track.json`, and the page replays the operations at their times. When the lecture changes, `presmium check` reports operations on blocks that no longer exist. `presmium-lecture export` exports a lecture as a video.

(lecture-motion)=
## Animations and video

With `@lincyaw/addon-motion` in the document's `plugins`, `{scene}` places an animation written in code: a timeline in the document's `scenes/` written with GSAP, Anime.js, Motion, Three.js, Remotion or D3, cut into steps by `:durations:`, with the narration following the steps paragraph by paragraph. Presenting plays one part a step; a lecture plays it on the narration's time, and a synthesized lecture stays on a step until its animation has played. `presmium-lecture export` exports the video by moving the lecture's time on a frame at a time, so animations, the cursor, clicks and captions are each at their moment; the captions are also the video's subtitle tracks and `.vtt` files next to it, and `--burn <language>` draws them on the picture.

(assistant)=
# The AI assistant and reader questions

(assistant-ask)=
## Reader questions

With `@lincyaw/addon-assistant` in the document's `plugins`, its pages have an Ask button: readers ask about the current section, or select some text first and ask about it, and the citations in the answer jump to their sections. Static sites have it too; no server is needed.

The answers come from a model service the reader sets up (the address of an OpenAI compatible Chat Completions API, a key and a model name), kept in the reader's browser only; the question and the text of the current section go straight from the browser to that service, at the reader's cost. The panel says so, and says that scripts of the same site can read the key.

(assistant-edit)=
## Changes by an agent

Studio keeps the workflow simple for teachers who do not use development tools: describe the teaching goal, inspect the preview, select what needs changing and review the edit. Use the VS Code extension for professional code editing. The agent distinguishes source diagnostics, compiled recordings and observed browser feedback. `get_runtime` provides recent live runs, failures and session resets; `get_outputs` still describes compiled recordings. Missing feedback is not success: rerun the affected code after edits.

In the workbench (experimental; `pnpm add -g @lincyaw/studio`, then `presmium-studio`), an agent changes a lecture as your chat asks: you review the changes, and what you accept becomes a git commit you can revert. The model service comes from environment variables (such as `DEEPSEEK_API_KEY`, or `PRESMIUM_MODEL_URL`, `PRESMIUM_MODEL_KEY` and `PRESMIUM_MODEL_PROVIDER`) or from the workbench's model settings; it is never written into the lecture or its outputs.

(assistant-mcp)=
## Agents in your editor

The read-only `get_runtime` tool (resource `presmium://runtime`) returns the selected document's author windows, report times, position, plugin/component failures and live execution summaries. Closing a window removes its feedback. A report describes a previous observation and does not verify new source: repeat the affected action before claiming a fix worked.

`presmium dev` and `presmium serve` give the document to agents in your editor (Claude Code, Codex, VS Code and others) over MCP: they read sections, steps, code references, outputs and findings, and navigate, run code or build once you approve. Both print the MCP address and the file that holds its token when they start; without a server, `presmium-mcp <document directory>` provides the reading tools over stdio.

(workspace)=
# Workspaces

(workspace-config)=
## A site of several documents

A workspace is a directory with `presmium.workspace.yaml` at its root and each document in a subdirectory with its own `lecture.md`:

```yaml
title: Introduction to machine learning
documents: [week1/lecture.md, week2/lecture.md]
site:
  home: week1               # optional: the home page leads to this document, the list is documents.html
  nav:
    - { text: Week 1, link: /week1/ }
  footer: { message: Course materials }
  locales:
    zh-CN: { title: 机器学习导论 }
```

`presmium build` at the root writes the whole site to `dist/web/`: the home page lists the documents, each under `/<directory>/`; each document's search box finds the other documents too, and the first and last pages link the documents before and after it. A link to another document names its entry file, with a section label as the fragment if you like (`[spiral](../week2/lecture.md#w2-spiral)`); the site rewrites it to that document's page and never publishes a document's source.

(workspace-translations)=
## Translations in a workspace

The translations the documents declare are published with the workspace site: each document's translation under `/<directory>/<lang>/`, with a language menu on its pages; the home page also has a version for each language, `/<lang>/`, which lists the documents in that language (a document without that translation is listed in its original), titled `site.locales.<lang>.title`. A translation links another document by its entry file too, and the link goes to that document's translation into the same language when there is one. This documentation site is built that way: each document is written in Chinese and translated into English.

(workspace-serve)=
## The local service and the workbench

`presmium serve` starts the workspace service on your machine: its home page lists the documents, and each document's site compiles on demand and updates as you save. `presmium-studio` (`pnpm add -g @lincyaw/studio`, experimental) starts the workbench on top of it: the file tree, source editing, preview, the problems and an agent. Both are for you alone and listen on this machine only by default; `--host` opens them to other devices on your local network, with no login, so whoever reaches the port works as you. The service's preview shows the originals; `presmium build` publishes the translations.

(publish)=
# Publishing

(publish-check)=
## Publication checks

`presmium check` checks the view of each medium: that local files named by links, images and raw HTML exist, that a `#fragment` is a section, block, label or heading of the document, and that another document a link names has that fragment (`presmium.links`); MyST directive errors (`presmium.directive`); and matches of the regular expressions in the headmatter's `checks: { forbid: [...] }` (`presmium.forbid`), which keep internal ticket numbers and the names of unpublished work out. `--external-links` checks external links with lychee.

(publish-audience)=
## The students' version

`:audience: teacher` on a directive keeps the block for teachers, and `:::{audience} teacher` at the top of a section keeps the whole section for them. `presmium build --audience student` builds the students' version and scans every file it wrote for sentences of what was left out, failing when it finds one.

(publish-hosting)=
## Hosting and what to commit

The outputs are static files: put them on any static host (GitHub Pages, object storage, your school's server); reader questions also happen in the browser. Commit the source and these entries of `.presmium/`: `freeze/` (the execution cache), `anchors.lock.json` (the code anchors' lock), `drawings/` (ink on slides), `assets/` (localized remote images), `speech/` and `speech.lock.json` (the speech cache). Do not commit `dist/` or the renderers' working directories.
