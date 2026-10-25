# Directive reference

Look up one directive here. Each `{name}` section stands on its own and gives, in this order:

- **Plugin**: the npm package to list under `plugins` in the frontmatter of `lecture.md`, or "built in" when none is needed. A directive whose plugin is not listed is the error ``unknown directive; is the plugin that provides it listed in `plugins`?``.
- **Argument** (the text after `{name}` on the first line) and **body** (the lines inside the fence).
- **Options**: the `:key: value` lines at the top of the body.
- **Steps**: how many presses of next the block uses after it appears. 0 means the block is shown whole at once. A block with N steps has N + 1 states; state k shows at the block's first step plus k. Which narration paragraph belongs to which step is in [writing.md](writing.md), section "Steps".
- **In each form**: what the web page, the slides, the notebook and the lecture show.
- An **example** and the **errors** (`presmium check` and builds print them with the file and line).

Terms used below: a **document** is the folder with `lecture.md`; a **section** is the part under one `##` heading (one slide); **on-screen content** is the blocks shown on the slide, **narration** the plain paragraphs (speaker notes, and what the lecture says); a **form** is what the document is built into, with the ids `web`, `slides`, `notebook` and `lecture` (the narrated playback). A plugin's **configuration key** (such as `presmium.exec`) is where its settings go in the frontmatter:

```yaml
plugins:
  - '@lincyaw/addon-exec'
presmium:
  presmium.exec:
    timeoutMs: 30000
```

## Writing any directive

A directive is written as a backtick fence (```` ```{name} ````) or a colon fence (`:::{name}`). Directives whose body is MyST, such as `{slide}` and `{only}`, are usually written with colons. When the body contains a code fence, the outer fence must be one character longer than the inner one (four backticks outside three).

Every directive accepts three common options:

| Option | Effect |
|---|---|
| `:reveal:` | The block appears at the next step. On `{slide}` and `{only}`, `:reveal: items` reveals the list inside item by item |
| `:label:` | The block's id, the same as writing `(name)=` on the line before the block. Cues, links and `:target:` options refer to blocks by this id |
| `:audience:` | The block is only for these audiences (comma-separated, such as `teacher`); see `{audience}` |

More on `:audience:`:

- On `{slide}` and `{only}` it applies to every block inside; nested audiences intersect. To give narration an audience, wrap it in `{only}` and put `:audience:` on that.
- It also works on a MyST directive nested in another directive's body or in a list item (a `{tab-item}`, a `{card}`, a `{tip}` inside a `{note}`, a `{code}` in a list item): only that directive is removed, and the block around it stays.
- On `{include}` it applies to all included content. Headings in the included file still open sections, and those sections are entirely for those audiences.
- Without an audience name it is the error `:audience: needs the audiences it is for, e.g. :audience: teacher`.

Option values are read as the type the directive declares (`string`, `number`, `boolean`, `list`). When a directive declares its options, a misspelled option gets the warning `unknown option :<name>:`.

## Built-in directives (compiler, no plugin needed)

### `{slide}`

**Plugin**: built in.
**Argument**: none. **Body**: MyST; every block in it is on-screen content, including plain paragraphs, which would otherwise be narration.

| Option | Value | Effect |
|---|---|---|
| `:reveal:` | none, or `items` | The whole body appears at the next step; with `items`, the list inside appears one item per step |
| `:at:` | integer from 0 | The body is shown from this step of the section |
| `:until:` | integer, greater than the start step | The body is hidden from this step on |

**Steps**: 0; with `:reveal: items`, the number of items minus one.
**In each form**: the web page's reading view shows the body expanded; the presentation (web presentation view and slides) shows it only within its step range and restores it when going back. The notebook gets the blocks as Markdown cells.

To replace one result with another, write `:at: 0` and `:until: 1` on the first `{slide}` and `:at: 1` on the second; no component or player is needed.

```md
:::{slide}
:reveal: items
- Count adjacent pairs
- Merge the most frequent pair
:::
```

The list appears item by item.

**Errors**: `:at: must be a non-negative integer` (also for `:until:`), `:until: must be greater than :at:`, `:at: and :reveal: cannot be combined`.

### `{only}`

**Plugin**: built in.
**Argument**: the form ids the body is limited to, comma- or space-separated: `web`, `slides`, `notebook`, or any other key of the frontmatter's `renderers` (`lecture` needs `renderers: { lecture: … }` and the plugin `@lincyaw/addon-lecture`). **Body**: MyST; its blocks go only to those forms. Nested `{only}` blocks intersect.

| Option | Value | Effect |
|---|---|---|
| `:reveal:`, `:at:`, `:until:` | as in `{slide}` | Step range of the body |

**Steps**: as in `{slide}`. Each form skips the steps it does not use: a step taken only by blocks of other forms does not exist in this form, and the later steps move up.
**In each form**: shown only in the listed forms. Narration in `{only} lecture` is spoken but not shown; narration in `{only} web, slides` is shown but not spoken.

```md
:::{only} web, notebook
A supplementary derivation shown only on the web and in the notebook.
:::
```

**Errors**:

- No argument: `needs the renderer ids it is limited to, e.g. {only} web, notebook`.
- An id that is not a form of this document (such as a misspelled `slide`): the warning `unknown renderer id "<id>": its content shows in no form; known ids are …`.

### `{hints}`

**Plugin**: built in.
**Argument**: none. **Body**: a YAML mapping from form id to a mapping of hints for this section.

**Steps**: 0; it produces no visible block.

```md
:::{hints}
web: { layout: scrolly }
slides: { layout: center, class: my-page }
:::
```

| Hint | Effect |
|---|---|
| `web.layout: scrolly` | On the web page this section uses a scrolling layout: the on-screen content stays fixed on one side while the narration scrolls |
| `slides.layout` | This slide's layout: `default` (the chapter name above the title, then the content; the footer has the document title, the step and the page number), `cover` (cover page; by default the first slide uses it when the document has more than one section), `center` (content centered), `full` (no footer or margins; the content fills the canvas) |
| `slides.class` | A CSS class added to this slide |
| `slides.zoom` | Scales this slide's content, such as `0.8`. Content larger than the canvas is scaled down to fit anyway |

A form ignores hints it does not recognize.

**Errors**: `hints for "<form>" must be a mapping`.

### `{config}`

**Plugin**: built in.
**Argument**: none. **Body**: a YAML mapping from a plugin's configuration key to a mapping of its options. They apply to this section only, merged over the document-wide settings under `presmium:` in the frontmatter.

**Steps**: 0; it produces no visible block.

Place it at the top level of a section, or inside a `{slide}` or `{only}` of the section; before the first `##` it belongs to the cover section. Several `{config}` blocks in one section merge in source order, a later option of the same plugin overriding an earlier one. The whole section's configuration is read first, so every directive in the section sees all of it, wherever the `{config}` stands.

```md
:::{config}
presmium.exec: { timeoutMs: 30000 }
:::
```

The example lets a slow example in this section run for 30 seconds. Options that can be set per section:

| Key | Option | Effect |
|---|---|---|
| `presmium.exec` | `timeoutMs` | Time limit for this section's code (code blocks with `:run:`, `{code-ref}`, `{run-panel}`, `{step-run}`), at build time and in the browser. A block's own `:timeout:` takes precedence |
| `presmium.code` | `repo` | Repository URL for this section's `{code-ref}` permalinks. `:repo:` takes precedence |

All other plugin options are read only from the frontmatter. (Plugin authors read section configuration as described in `presmium-develop/references/plugin.md`.)

**Errors**: `the configuration of "<key>" must be a mapping`.

### `{audience}`

**Plugin**: built in.
**Argument**: audience names, comma- or space-separated (such as `teacher`). **Body**: none.

**Steps**: 0; it produces no visible block.

Place it at the top level of a section to mark the whole section as only for these audiences, for example a section of teacher's notes. To mark part of a section, use the common option `:audience:` instead.

```md
## Live demo notes

:::{audience} teacher
:::

Disconnect the network before demonstrating the merge.

## Merge rules

:::{only} web, slides
:audience: teacher
This paragraph is for the teacher only: first draw the two branches on the whiteboard.
:::
```

**Errors**:

- A body: the warning `takes no body: it marks its whole section; to mark part of a section, give a directive :audience:, e.g. an {only} around the paragraphs`. The body is ignored and is not teacher-only.
- No audience name: `needs the audiences its section is for, e.g. {audience} teacher; until it names them, the section is left out of every version for an audience`. The same holds for `:audience:` without a name: the marked content goes to no audience and appears only in the full build.

**Building for an audience**:

- Content without an audience is for everyone. A build without `--audience` includes everything.
- `presmium build --audience student` removes, at build time, the sections and blocks whose audience does not include `student`. The remaining sections are renumbered and their steps closed up; removed code is not executed. Learners get this build, published as a static site; `presmium serve` shows all content and is for your own use.
- `presmium check --audience student` compiles and checks the student version.
- After an audience build, every written file is scanned for leaks: a sentence of 12 or more characters from the removed content (other than sentences the student content also has) found in a file is the error `presmium.audience`, located at the removed block, naming the sentence and the file (it can leak in through a code block's output, for example).
- A build with `--audience` does not report problems inside the removed content, which would reveal it; it prints only a count, `<n> findings are in the content left out for student`. `presmium check` without `--audience` lists them.
- Translations are built for the same audience; neither language of the student version contains teacher content.
- When the student version publishes a recorded lecture, only the sections whose content has not changed since recording keep their speech and video. Sections with teacher paragraphs, and sections into which content moved from a teacher section after recording, are published without it.
- A `{ref}` to a teacher-only section has no target in the student version (the warning `target not found`); do not reference teacher sections from student content.
- Block ids are the same in both versions, but section numbers and steps differ. When learners follow the presenter in class, both must use the same version.

### `{component}`

**Plugin**: the plugin that provides the component, or none for a component of the document itself (a `.vue` file in the document's `components/` folder).
**Argument**: the component name (its file name without `.vue`). **Body**: the component's props as YAML.

| Option | Value | Effect |
|---|---|---|
| `:span:` | integer from 0 | The component's own steps |
| `:plugin:` | configuration key | The plugin the component comes from; by default the plugin that provides a component of that name (`deck` for the document's own components) |
| any other | YAML value | Passed to the component as a prop |

**Steps**: `:span:`, default 0.
**In each form**: the web page and the slides show the component.

```md
:::{component} StepList
:span: 3
steps: [Parse, Start, Render]
:::
```

Here `StepList` is `components/StepList.vue` in the document folder. A plugin's components are placed the same way, for example `PmContrastToggle`, the high-contrast switch from `@lincyaw/addon-publish`. A component can declare named actions, and ``{cue to=<block>}`click <action>` `` in the narration runs one when it is spoken (see "Lecture roles" below). How to write a component, its steps and its actions is in `presmium-develop/references/plugin.md`.

**Errors**: `needs a component name, e.g. {component} PmQuiz`; `:span: must be a non-negative integer`; when no listed plugin provides the component, the warning ``no plugin in `plugins` registers the component <name>``.

### `{include}`

**Plugin**: built in.
**Argument**: a file path, relative to the file that contains the directive. **Body**: none.

**Steps**: those of the included content, which is placed here as if written in this file; headings in it open sections as usual.

````md
```{include} pages/intro.md
```
````

**Errors**: `{include} needs a file argument`; `{include} <path>: file not found`; `{include} <path> includes itself`; the warning `the frontmatter of an included file is ignored`.

### `{literalinclude}`

**Plugin**: built in.
**Argument**: a file path, relative to the file that contains the directive. **Body**: none. Shows the file, or some of its lines, as a code block, and rebuilds when the file changes.

| Option | Value | Effect |
|---|---|---|
| `:language:` | string | Highlighting language; default from the file extension |
| `:lines:` | line list, such as `2, 4-6` | Lines to show |
| `:start-line:`, `:end-line:` | number | Cut by line number |
| `:start-after:`, `:end-before:`, `:start-at:`, `:end-at:` | text | Cut at the first line containing the text, excluding (`after`, `before`) or including (`at`) that line, as in MyST |
| `:caption:` or `:filename:` | string | Title above the code |
| `:emphasize-lines:` | line list | Lines emphasized |

**Steps**: 0.

````md
```{literalinclude} src/bpe.py
:start-after: def merge
:end-before: def encode
```
````

**Errors**: `{literalinclude} needs a file argument`; `{literalinclude} <path>: file not found`.

### `{code}`, `{code-block}`, `{code-cell}`, `{sourcecode}`

**Plugin**: built in. Running code needs an executor plugin: `@lincyaw/addon-exec` for Python, JavaScript and TypeScript; `@lincyaw/addon-exec-wasi` for C, C++, Ruby and SQL; `@lincyaw/addon-exec-local` or `@lincyaw/addon-exec-jupyter` for named environments.
**Argument**: the language. **Body**: the code. All four names do the same; `{code-cell}` is the MyST notebook spelling. A plain fence (```` ```python ````) takes no options; to run code, write it as `{code}`.

| Option | Value | Effect |
|---|---|---|
| `:caption:` or `:filename:` | string | Title above the code |
| `:emphasize-lines:` | line list, such as `2, 4-5` | Lines emphasized at every step |
| `:run:` | `compile` (default; a bare `:run:` is the same), `live`, `both` | `compile`: run at build time and the output recorded under the code. `live`: run only in the browser. `both`: recorded at build time and runnable in the browser |
| `:executor:` | executor id | Where the code runs: `presmium.python`, `presmium.node` (`@lincyaw/addon-exec`), `presmium.container` (`@lincyaw/addon-exec-local`), `presmium.wasi` (`@lincyaw/addon-exec-wasi`). When it is unavailable, no other executor is tried: a browser run fails and shows the recorded output and the reason |
| `:env:` | environment name | An environment declared under `execute.environments` in the frontmatter, or `browser` (the executor is chosen by language). Without it, the frontmatter's `execute.env` applies. Needs `:run:` |
| `:session:` | name | Code blocks of one session share one interpreter: variables defined in one are usable in the next. Needs `:run:` |
| `:timeout:` | milliseconds | Time limit; default the section's `presmium.exec` `timeoutMs` (see `{config}`), else 10000 |
| `:echo:` | `false` | Show only the output, without the code or run controls. Needs `:run:` |

**Steps**: 0.

````md
```{code} python
:run: both
print(sum(range(10)))
```
````

**Sessions**: at build time the blocks of a session run in document order in one interpreter, and changing any of them runs the whole session again. In the browser each page and each learner has their own session, and **Reset session** next to the code block discards it. All blocks of a session must use the same environment.

**Output**:

- With `:echo: false`, output that is only Markdown (`text/markdown`) is shown as body text: use it to generate tables and lists from data.
- In Python, `display(obj)` (no import needed) and `from IPython.display import Markdown, HTML, Image, SVG, Latex, JSON` show rich objects, through their `_repr_html_`, `_repr_markdown_`, `_repr_png_` and similar methods. When the last statement is an expression whose value is not `None`, the value is shown, as in Jupyter.
- matplotlib figures are shown as images at `plt.show()` and at the end of the run. matplotlib must be installed where the code runs: Python in the browser has only the standard library, and `presmium check` warns about `live` or `both` blocks that import other modules. Use `:run: compile`, or only the standard library.

**C, C++, Ruby, SQL** (languages `c`, `cpp` or `c++`, `ruby` or `rb`, `sql`): with `@lincyaw/addon-exec-wasi` in `plugins` these blocks run at build time and in the browser in the same WebAssembly runtime. C and C++ are first compiled by clang 8 with `-Werror`. The build machine needs no compiler or interpreter, and the web page runs them offline. Each run is a separate program (`:session:` is not supported); SQL runs in an empty in-memory database. In C, a global variable that is neither initialized nor `static` (such as `int stats[256][256];`) makes the program exit with code 134: write `static int stats[256][256];` or give it an initial value. The published runtime carries its license notices (`wasi/LICENSES`).

**In each form**:

- Web page and slides: the code with its recorded output below. `live` and `both` blocks have a run button. Those without emphasized lines that change by step and without several versions also have **Edit the code**: edit in place, run the edited code with Mod-Enter or the run button; **Restore the code** returns to the original. Edits stay in that page and are not written back to the document. Outputs are shown by type, HTML sanitized.
- Notebook: a code cell with the outputs as they are.
- Code blocks inside a plugin component's body (a run panel, for example) are run by that component and have no run button or recorded output of their own.

**Errors**: `:run: <value> is not compile, live or both; using compile` (warning); `:env: and :session: need :run:; they are ignored` (warning); `:env: <name> and :executor: <id> both choose where the code runs; write one of them`; an environment not declared in `execute.environments` (on the code block's line); `:session: needs a name`; `:echo: false needs :run:; the code shows` (warning); `:echo: false with :run: live: the code has no controls to run it; it runs at compile time` (warning).

### `{grid}`, `{grid-item}`, `{card}`, `{tab-set}`, `{tab-item}` and `{button}`

**Plugin**: built in. These are the standard MyST cards, grids, tabs and buttons (as in mystmd), for course home pages and guide pages. They are on-screen content.

| Directive | Argument and options |
|---|---|
| `{grid}` | The argument is the number of columns at four screen widths (phone, from 576px, from 768px, from 992px), 1 to 4 numbers; with fewer, the last number applies to the wider screens; default `1 2 2 3`. `:class:` adds a CSS class |
| `{grid-item}` | One cell of a grid. `:columns:` how many of the 12 parts of a row it takes; `:class:` |
| `{card}` | The argument is the title. `:link:` the address the whole card links to (a local file is published with the document), `:header:`, `:footer:`. In the body, text before a `^^^` line is the header and text after a `+++` line the footer |
| `{tab-set}`, `{tab-item}` | `{tab-item}`'s argument is the tab title. `:sync:` a key: selecting a tab switches every tab with the same key on the page; `:selected:` selected at the start |
| ``{button}`text <address>` `` | A role, not a directive: a link styled as a button. Without `<address>` it is button-styled text that cannot be clicked |

**Steps**: 0.

`````md
::::{grid} 1 1 2 3
:::{card} Week 1: the agent loop
:link: week-01/
The read, think, act cycle.
+++
{button}`Open the lecture <week-01/>`
:::
:::{card} Week 2: context
Header
^^^
What goes into the context window.
:::
::::

::::{tab-set}
:::{tab-item} Python
:sync: py
Print with `print`.
:::
:::{tab-item} JavaScript
:sync: js
Print with `console.log`.
:::
::::
`````

**In each form**:

- Web page: everything; grids split into columns by screen width, tabs can be switched.
- Slides: cards and grids as on the web (with the column count of the widest setting); tabs expanded one after another as titled parts.
- Notebook: card and tab titles become small headings (`####`), the rest paragraphs, buttons links. The build report lists these as `degraded in the notebook, which has no Jupyter form for grid, card`.

### Other MyST directives

**Plugin**: built in. MyST's own directives, such as admonitions (`{note}`, `{tip}`, …), `{figure}`, `{math}`, `{list-table}` and `{dropdown}`, work as in MyST and are on-screen content. ```` ```mermaid ```` code blocks are drawn as diagrams in every form.

**Errors**: a name that is neither a MyST directive nor provided by a listed plugin is ``unknown directive; is the plugin that provides it listed in `plugins`?``.

## Code references `presmium.code` (`@lincyaw/addon-code`)

### `{code-ref}`

**Plugin**: `@lincyaw/addon-code` (configuration key `presmium.code`).
**Argument**: an anchor that names code in a file of your repository (forms below). **Body**: none. Shows that code, kept up to date with the file, with a link to it.

| Option | Value | Effect |
|---|---|---|
| `:pin:` | commit hash, branch or tag | The commit to read; without it the working tree is read |
| `:steps:` | list of names | `#region`s nested inside the anchor, emphasized one per step; `all` and `none` mean no region stands out at that step |
| `:variants:` | list of at least two commits | Shows the code at each commit, one per step. Cannot be combined with `:pin:` or `:steps:` |
| `:lang:` | string | Highlighting language; default from the file extension |
| `:repo:` | URL | Repository URL for permalinks; default the section's `presmium.code` `repo` (see `{config}`), then the `origin` remote |
| `:run:`, `:executor:`, `:timeout:`, `:env:`, `:session:` | | As for `{code}` |

**Steps**: the number of `:steps:` or `:variants:` entries minus one; otherwise 0.
**In each form**: a code block with a source bar linking to the file and lines. With `:variants:`, lines glide to their new places between versions, and the file link and line numbers are those of the version shown. Local code without a remote repository is shown normally, just without permalinks.

**Anchors**. File paths are relative to the root of the git repository that contains the document, or to the document folder when it is not in git. When a path was written relative to the document folder by mistake, the error gives the correct form.

| Anchor | Code it names |
|---|---|
| `region:<file>#<name>` | The lines between the comments `#region name` and `#endregion name`. All the VS Code folding-region spellings work: `# #region`, `#region`, `// #region`, `<!-- #region -->` and so on. The marker lines are not shown and common indentation is removed |
| `symbol:<file>#<name>` | A declaration found by syntax tree, such as `Parser.parse`, in TypeScript, JavaScript or Python; the file needs no markers |
| `pattern:<file>#<ast-grep pattern>` | Code matching an ast-grep pattern, such as `pattern:src/cart.ts#if (prices.length === 0) $$$` |

````md
```{code-ref} region:src/bpe.py#merge
:pin: dd64ade
:steps: count, replace
```
````

The regions in `src/bpe.py`:

```python
# #region merge
def merge(ids, pair, new_id):
    # #region count
    ...
    # #endregion count
    # #region replace
    ...
    # #endregion replace
# #endregion merge
```

Resolved anchors are recorded in `.presmium/anchors.lock.json`; `presmium check --update-lock` resolves them again.

**Errors** (by diagnostic code):

- `presmium.code.anchors`: an anchor that no longer matches is an error, one that matches several places a warning, one whose code moved a hint.
- `presmium.code.drift`: the code in the working tree changed after the pinned commit; a warning with the diff.
- `presmium.code.syntax`: `invalid {code-ref}: …`, for example when the argument is not an anchor or `:variants: needs at least two commits`.

## Browser execution `presmium.exec` (`@lincyaw/addon-exec`)

This plugin runs Python, JavaScript and TypeScript. In the browser, Python runs on Pyodide (Python compiled to WebAssembly, standard library only) and JavaScript and TypeScript in a background script worker; at build time the machine's `python3` and `node` run the code. The language names `py`, `python3` and `ipython` mean Python, `js` and `mjs` JavaScript, `ts` TypeScript.

Settings under `presmium.exec` in the frontmatter: `timeoutMs` (default 10000; per section with `{config}`), `loadTimeoutMs` (time limit for loading the runtime, default 30000), `maxTraceEvents` (default 500), `pyodideURL` (where Pyodide is loaded from).

### `{run-panel}`

**Plugin**: `@lincyaw/addon-exec` (configuration key `presmium.exec`).
**Argument**: the language: `python` (default), `javascript`, `typescript`, or another language that has an executor, such as `wgsl` from `@lincyaw/addon-exec-webgpu` (see "Browser GPU" below). **Body**: the code. A panel with parameters that viewers change and run again.

| Option | Value | Effect |
|---|---|---|
| `:params:` | YAML mapping | Variables set before the program runs (constants in JavaScript); viewers can change them and run again. Other languages' executors read them in their own way (such as `wgsl` buffers); values can be lists and mappings, shown as JSON in the form |
| `:timeout:` | milliseconds | Default the section's `presmium.exec` `timeoutMs` |
| `:recorded:` | string | Output shown when a run fails or times out |
| `:run:` | `both` (default), `live` | `both` also records the output at build time; `live` runs only in the browser |
| `:env:`, `:session:` | name | As for `{code}` |

**Steps**: 0.

````md
```{run-panel} python
:params: {n: 4}
:recorded: 0 1 4 9
print(*[i * i for i in range(n)])
```
````

**In each form**:

- Web page and slides: the top bar states the language and where it runs (such as "Python · runs in the browser"; for an `:env:` environment, according to its `kind`), and holds the parameters and the run button. After a run the output shows the time taken ("Output · 0.02 s"); on slides it sits beside the code when there is room. When a run cannot happen (no runtime, no GPU adapter, timeout) and there is no `:recorded:`, the output recorded at build time is shown with the reason.
- PDF and PNG exports: the code with the parameter assignments first, then the build-time output (or `:recorded:` when the code was not run at build time, failed or timed out).
- Notebook: a panel in the kernel's language (Python by default) becomes a code cell with the parameter assignments first; other languages become a Markdown cell with the code and the output.

**Errors**: `{run-panel} :run: <value> is not both or live; using both` (warning).

### `{step-run}`

**Plugin**: `@lincyaw/addon-exec` (configuration key `presmium.exec`).
**Argument**: the language, default `python` (only Python can be traced line by line). **Body**: the code. Shows the program running one executed line per step.

| Option | Value | Effect |
|---|---|---|
| `:steps:` | number | The number of lines the code executes, one step per line |
| `:params:` | YAML mapping | As for `{run-panel}` |
| `:timeout:` | milliseconds | Time limit |

**Steps**: `:steps:` (the state before the first line, then one per executed line).

````md
```{step-run} python
:steps: 4
total = 0
for x in [1, 2, 3]:
    total += x
print(total)
```
````

**In each form**: on the web page's reading view the panel has its own previous and next buttons and a slider, so readers step through line by line; the Python runtime loads only when the panel comes near the screen. In the presentation and on slides it moves with the section's steps.

**Errors** (warnings): `{step-run} needs :steps:, the number of lines the code executes; without it the slide has no steps`; `{step-run} declares :steps: <n>, but its code executes <m> lines: the slide's steps do not match the lines` (the build counts the lines; write the number it suggests).

## Local environment `presmium.execLocal` (`@lincyaw/addon-exec-local`)

### `{local-env}`

**Plugin**: `@lincyaw/addon-exec-local` (configuration key `presmium.execLocal`).
**Argument**: the language, default `python`. **Body**: the code. Runs the code in the repository's devcontainer (requires Docker), and lets the reader download the code together with the environment.

| Option | Value | Effect |
|---|---|---|
| `:file:` | path | Required: where the code goes in the workspace |
| `:workspace:` | path | The folder holding the devcontainer, relative to this file; default the `presmium.execLocal` `workspace` setting, then the document's git root |

**Steps**: 0.

````md
```{local-env} python
:file: src/hello.py
print("hello")
```
````

The plugin also provides the executor `presmium.container`, for a code block's `:executor:`.

**Running**: needs Docker and a Presmium server (`presmium dev` or `presmium serve`, on the web page or on slides). Only editors can run code, and each run asks for approval first (an `operate` approval). Each run is a new container whose working folder is the run's own folder; the workspace is mounted read-only at `/workspaces/<folder name>`, and its modules can be imported. The panel has no button that commits code back to the repository. In static output and the notebook it is a plain code block.

Settings under `presmium.execLocal`: `workspace`, `priority` (default 10, preferred over the browser executors), `buildTimeoutMs` (time limit for building the devcontainer image, default 600000).

**Errors**: `{local-env} needs :file:, the path of the snippet inside the workspace`; a document has one workspace, so `{local-env}` blocks with different `:workspace:` values are the error `{local-env} names the workspace <a>, but the deck's workspace is <b>: …` (here "deck" means the document); the warning `no devcontainer definition in <folder>; the snippet cannot be run in a container or exported`.

## Browser GPU `presmium.execWebgpu` (`@lincyaw/addon-exec-webgpu`)

This plugin has no directive of its own. List it in `plugins` together with `@lincyaw/addon-exec`. It provides:

- the executor for WebGPU compute shaders in `{run-panel} wgsl` (runs in the browser; recorded at build time in Playwright's Chromium);
- the Python module `presmium_gpu` in Pyodide;
- jax-js for JavaScript and TypeScript code.

````md
```{run-panel} wgsl
---
params:
  buffers:
    a: [1, 2, 3, 4]
    b: [10, 20, 30, 40]
    out: { size: 4 }
  dispatch: 1
  repeat: 10
---
@group(0) @binding(0) var<storage, read> a: array<f32>;
@group(0) @binding(1) var<storage, read> b: array<f32>;
@group(0) @binding(2) var<storage, read_write> out: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x < arrayLength(&out)) { out[id.x] = a[id.x] + b[id.x]; }
}
```
````

- Keys of `params`: `buffers` (required: for each `var<storage>` and `var<uniform>` in the shader, by variable name, a data list or `{ data, size, fill, type, read }`; group, binding, access and the types `f32`, `i32`, `u32` come from the shader), `dispatch` (workgroups per dimension, 1 to 3 numbers, default 1), `entry` (entry function, default the only compute entry), `repeat` (number of runs, default 1, at most 1000; the timing is the median), `features` (adapter features required, such as `[shader-f16]`). All buffers together are at most 128 MiB.
- Output: each writable storage buffer (`read_write`) is read back and shown on one line, such as `out: f32[4] = [11, 22, 33, 44]` (a long one shows the head and tail plus minimum, maximum and mean), followed by the time per dispatch and the adapter. On the CPU-emulated fallback adapter (SwiftShader) the timing is marked "CPU emulation". Output recorded at build time follows the document's `lang` (default Chinese).
- When the browser has no WebGPU, no GPU adapter, lacks a feature or limit, loses the device or times out, the panel shows the output recorded at build time with the reason (such as "Recorded output · No GPU adapter is available"). Shader errors are shown as errors.
- At build time Chromium uses the graphics card through Vulkan when there is one, otherwise SwiftShader. Declaring `cpu: { kind: webgpu, adapter: swiftshader }` under `execute.environments` and writing `:env: cpu` makes the recording identical on any machine (`adapter` can also be `auto` or `gpu`). Without Playwright's Chromium installed, nothing is recorded and the existing recording is kept.
- From Python (Pyodide): `import presmium_gpu as gpu`, then `result = await gpu.run(SHADER, buffers={'a': [1, 2], 'b': [3, 4], 'out': {'size': 2}}, dispatch=1)` (top-level `await` works in a code block). `result['out']` is the list read back, and `print(result)` shows the same summary as the panel (in English). Browsers with JSPI, such as Chromium and Firefox, also have the synchronous `gpu.run_sync(...)`. The panel's limits apply (128 MiB of buffers, `repeat` at most 1000); exceeding them raises `ValueError`, and being unable to run raises `presmium_gpu.GPUUnavailable`. Write such blocks with `:run: live` (Python at build time has no WebGPU).
- From JavaScript and TypeScript: `import { init, defaultDevice, numpy as np } from '@jax-js/jax'` (tensors and automatic differentiation). After `await init()`, `defaultDevice('webgpu')` computes on the GPU; without WebGPU it uses WebAssembly. jax-js is published with the output and loads on first import; write such blocks with `:run: live`.

## Remote environments `presmium.execJupyter` (`@lincyaw/addon-exec-jupyter`)

This plugin provides named environments of `kind: jupyter`: any Jupyter Server (a docker compose setup, JupyterHub, agent-sandbox and the like). Declare the environment in the frontmatter and select it on code blocks with `:env:`; the code then runs in its kernel both at build time and in the browser:

```yaml
plugins:
  - '@lincyaw/addon-exec-jupyter'
execute:
  environments:
    lab: { kind: jupyter, auth: proxy, kernel: python3, image: 'quay.io/jupyter/base-notebook:2026-10-12@sha256:…' }
```

- `auth` (default `env`): `env` connects only at build time; `proxy` connects from the browser through the Presmium server (`presmium dev` and the workspace service; static output shows the recorded output); `prompt` connects to the environment's `url`, and learners paste their own token on the page (kept only in that page's `sessionStorage`; for published static sites); `none` connects to `url` without a token; `hub` is reserved. A JupyterHub user server is written `url: https://hub.example.edu/user/{user}/`.
- Credentials are never written in the document. Builds and the proxy use the operator's environment variables `PRESMIUM_ENV_<NAME>_URL` and `PRESMIUM_ENV_<NAME>_TOKEN` (the environment name upper-cased, other characters turned into `_`). A `url` in the document whose origin differs from the operator's address is not connected and is an error; without an address no token is sent.
- A session (`:session:`) is one kernel, one per page and per learner. `image` is part of the environment's identity. The output of `:run: both` is recorded at build time, and running in the browser gives the same result.
- `presmium check --env` connects to every environment; failing to connect is an error.

### `{terminal}`

**Plugin**: `@lincyaw/addon-exec-jupyter` (configuration key `presmium.execJupyter`).
**Argument**: the name of a `kind: jupyter` environment. **Body**: none. A terminal (xterm.js) of that Jupyter Server, with credentials handled as for the environment; it connects when the reader clicks **Open terminal**.

| Option | Value | Effect |
|---|---|---|
| `:height:` | number | Rows, default 16 |

**Steps**: 0.

```md
:::{terminal} lab
:height: 12
:::
```

**In each form**: the web page and slides show the terminal. In static output, a `proxy` environment shows an explanation instead of connecting, while `prompt` works as usual. The notebook gets no cell; PDF and other static exports show a one-line explanation.

**Errors** (`presmium.execJupyter`): `{terminal} needs the name of a kind: jupyter environment of execute.environments, e.g. :::{terminal} gpu`; `{terminal} <name>: no such environment in execute.environments of the headmatter`; `{terminal} <name>: the environment is of kind <kind>; a terminal needs kind: jupyter`.

## Guidance `presmium.guide` (`@lincyaw/addon-guide`)

These directives point at an element on the slide, named by a CSS selector, usually the `id` of an HTML element you wrote yourself in the same section.

### `{cursor}`

**Plugin**: `@lincyaw/addon-guide` (configuration key `presmium.guide`).
**Argument**: none. **Body**: one waypoint per line, `[move|hover|click] <CSS selector>`; the action defaults to `move`. An animated pointer moves to waypoint k at the block's step k.

**Steps**: the number of waypoints minus one.

```md
:::{cursor}
:reveal:
#query
hover #run
click #run
:::
```

**In each form**: the pointer is drawn over the slide on the web page and slides; static forms show nothing.

**Errors**: ``{cursor} needs at least one waypoint, e.g. `click #run` ``.

### `{spotlight}`, `{hint}`

**Plugin**: `@lincyaw/addon-guide` (configuration key `presmium.guide`).
**Argument**: the target's CSS selector. **Body**: the popup text. `{spotlight}` dims everything but the target; `{hint}` puts a pulsing marker on it. Both show the popup next to it.

| Option | Value | Effect |
|---|---|---|
| `:title:` | string | Popup title |
| `:span:` | number | Steps it lasts, default 0 |

**Steps**: `:span:`.

```md
:::{spotlight} #output
:reveal:
:title: Result
Each colored block is a token.
:::
```

**In each form**: the web page and slides show the effect; static forms show the popup title and text.

**Errors**: `{spotlight} needs the CSS selector of its target, e.g. {spotlight} #run` (and the same for `{hint}`).

## Rich content `presmium.content` (`@lincyaw/addon-content`)

Math (`$…$`, `$$…$$`) and ```` ```mermaid ```` diagrams need no plugin. With this plugin, ```` ```plantuml ```` (or `puml`) code blocks are turned into images at build time, using the server set in `presmium.content` `plantUmlServer`.

### `{markmap}`

**Plugin**: `@lincyaw/addon-content` (configuration key `presmium.content`).
**Argument**: none; no options. **Body**: Markdown headings and lists, drawn as a mind map. A leading YAML block can set `markmap:` options.

**Steps**: 0.

`````md
````{markmap}
---
markmap:
  colorFreezeLevel: 2
---
# Topic
## Branch
- Leaf
````
`````

**In each form**: the web page and slides draw the mind map; forms that cannot draw it show a nested list.

### `{video}`, `{audio}`, `{animation}`

**Plugin**: `@lincyaw/addon-content` (configuration key `presmium.content`).
**Argument**: the media file: a path relative to this file, a package path such as `@lincyaw/addon-content/media/clip.webm`, or an `http(s)://` URL. **Body**: a caption.

| Option | Value | Effect |
|---|---|---|
| `:controls:`, `:autoplay:`, `:loop:`, `:muted:` | boolean | As the HTML media attributes |
| `:width:`, `:height:` | number | Size |
| `:alt:` | string | Text alternative |
| `:still:` (`{animation}` only) | file | Still image shown when the reader prefers reduced motion |
| `:poster:` (`{video}` only) | file | Image shown before playback |
| `:captions:` (`{video}` only) | `language=file, …` | WebVTT caption files, such as `en=films/loop.en.vtt, zh-CN=films/loop.zh.vtt`; each track is labelled with the language's name in the interface language |
| `:captions-default:` (`{video}` only) | language | Captions shown at the start; without it no captions are shown at first |

**Steps**: 0.

````md
```{video} media/demo.webm
:controls:
:poster: media/demo.jpg
:captions: en=media/demo.en.vtt, zh-CN=media/demo.zh.vtt
:captions-default: en
A recording of the demo.
```
````

Poster and caption files are relative to this file, like the media file, and are published with every form.

**In each form**: the web page and slides play the media. In the notebook a video with a poster or captions becomes a `<video>` with its poster and `<track>`s (files copied to `media/`); other media become file links, as in other static output.

**Errors**: `{video}: needs the path or URL of the media file`; `{video}: file not found: <path>` for a missing media file, still image, poster or caption file, on the directive's line; `:captions: "<entry>" is not <language>=<file>, e.g. en=films/loop.en.vtt`; the warning `:captions-default: <lang> is not a language of :captions:; no captions show at first`.

### `{youtube}`

**Plugin**: `@lincyaw/addon-content` (configuration key `presmium.content`).
**Argument**: a YouTube video id or link. **Body**: a caption.

| Option | Value | Effect |
|---|---|---|
| `:start:` | seconds | Where playback starts |
| `:width:`, `:height:` | number | Size |

**Steps**: 0.

````md
```{youtube} https://www.youtube.com/watch?v=dQw4w9WgXcQ
:start: 30
```
````

**In each form**: the web page and slides embed the video; static forms show a link to it.

**Errors**: `{youtube}: "<argument>" is no YouTube video id or link`.

## Animation `presmium.motion` (`@lincyaw/addon-motion`)

Animations written in code: one timeline built with GSAP, Anime.js, Motion, Three.js, Remotion or D3, played by step and by lecture time. In a live presentation each step forward plays that step's segment, and going back shows the settled frame. In lecture playback and exported video the animation follows the narration's time, and the same moment always shows the same frame.

### `{scene}`

**Plugin**: `@lincyaw/addon-motion` (configuration key `presmium.motion`). The animation libraries come with the plugin; the document does not install them.
**Argument**: the scene name: the path of a file under the document's `scenes/` folder without its extension (`.ts`, `.js`, `.mjs`), possibly in a subfolder, such as `bpe/merge`. **Body**: a caption: the accessible description, also what the notebook and static exports show.

| Option | Value | Effect |
|---|---|---|
| `:durations:` | list of durations | The duration of each step, written as for ``{cue}`pause` `` (`1.2` and `1.2s` are seconds, `800ms` milliseconds); entry k is the block's step k. Without it, one step of duration 0 |
| `:aspect:` | `width/height` | Aspect ratio, default `16/9` (`4:3` also works) |
| `:height:` | CSS height | Such as `360px`; when given, the aspect ratio is not used |
| `:still:` | file | Still image (relative to this file) shown in the notebook and static exports |

**Steps**: the number of `:durations:` entries minus one. The narration paragraphs after the block belong to those steps one by one (rules in [writing.md](writing.md), section "Steps"; aligning animation with lecture time is in `presmium-animate/references/timeline.md`).

```md
(bpe)=
:::{scene} bpe-merge
:durations: 1.2, 1.2, 1.4
Byte-pair merges of three words: first merge l and o, then lo and w.
:::

Byte-pair encoding starts from single characters.

Count the adjacent pairs; the most frequent is l and o.

Merge them into a new symbol, lo.
```

**In each form**: the web page and slides play the scene by step; the web page's reading view shows the final state, with play and scrub controls below the scene. A synthesized lecture keeps each step at least until its animation finishes. The notebook and static exports show the `:still:` image and the caption.

**The scene file** default-exports one scene made with a helper from `@lincyaw/addon-motion/scene`. Each helper's function receives `root` (the frame's element), `at(k)` (the millisecond at which step k starts on the timeline), `durations`, `total`, `width`, `height` and `color(name)` (a design-system color such as `color('accent')`, returned as `rgb()` or `rgba()`), plus the library:

| Helper | Returns | Time unit |
|---|---|---|
| `gsapScene(({ root, gsap, plugins, at }) => …)` | A GSAP timeline. It is created in a `gsap.context` scoped to `root`, so selectors find only the scene's elements. The `plugins` SplitText, DrawSVG, MorphSVG, MotionPath, Text, CustomEase, CustomBounce, CustomWiggle, Physics2D, PhysicsProps and Flip are registered | seconds: `at(k) / 1000` |
| `animeScene(({ root, anime, at }) => …)` | An Anime.js timeline, such as `anime.createTimeline({ autoplay: false })` | milliseconds |
| `motionScene(({ root, motion, at }) => …)` | `motion.animate(sequence)`. Put every change of one property of one element in the same sequence (separate animations overwrite each other when seeking) | seconds |
| `threeScene(({ THREE, renderer, addons, at, width, height }) => …)` | `{ render(ms), resize?(w, h), dispose?() }` or just `render`. The plugin creates the renderer and keeps it at the frame's size; `addons` has CSS2DRenderer, CSS2DObject, Line2, LineGeometry, LineMaterial, ParametricGeometry, RoundedBoxGeometry, ConvexGeometry | milliseconds |
| `remotionScene(({ React, remotion, at }) => …)` | `{ component, fps, width, height }`: a Remotion component written with `React.createElement` that draws the frame for each moment. Scene files cannot use JSX | frames |
| `d3Scene(({ root, d3, at }) => …)` | A function that draws one moment, `(ms) => void` (or `{ seek, resize?, dispose? }`): build the graphics with D3 and draw by time with its interpolators and easings; do not use `transition` | milliseconds |
| `defineScene((ctx) => …)` | Your own drawing: `(ms) => void`, or `{ seek, resize?, dispose? }` | milliseconds |

```ts
// scenes/bpe-merge.ts
import { gsapScene } from '@lincyaw/addon-motion/scene'

export default gsapScene(({ root, gsap, at }) => {
  root.innerHTML = '<span class="a">l</span><span class="b">o</span>'
  const tl = gsap.timeline()
  tl.from('.a, .b', { y: 20, opacity: 0, duration: 0.6 }, at(0) / 1000)
  tl.to('.b', { x: -12, duration: 0.5 }, at(1) / 1000)
  return tl
})
```

Rules for scene files:

- The frame must depend only on the position on the timeline: do not read the page's clock, start your own loops or play in real time.
- Import only from `@lincyaw/addon-motion/scene`, never library paths such as `gsap/…` or `three/addons/…` (the document does not depend on those libraries). Plugins and add-ons come from the helper's parameters in the table above.
- Choosing a library, how to write each one, examples and aligning with narration: the presmium-animate skill.

**Errors** (on the directive's line):

- ``{scene}: the deck has no scenes/<name>.ts (nor .js, .mjs)`` ("deck" here means the document).
- ``{scene}: :durations: takes durations as {cue}`pause` does (1.2, 1.2s or 800ms), not …``.
- `{scene}: needs the name of a scene of the deck's scenes/, …`; `"<name>" is not a scene name: …`; `:aspect: takes width/height, e.g. 16/9, …`; `:still: file not found: <path>`.
- In a synthesized lecture, a ``{cue}`next` `` that advances before the step's animation has finished is the warning ``lecture script: {cue}`next` moves on <n> ms before the animation of step <k> of section <id> has played``: move the cue later in the sentence or shorten `:durations:`.

## Classroom `presmium.classroom` (`@lincyaw/addon-classroom`)

Live classroom interaction: answers go from learners to the presenter. Every directive here needs `@lincyaw/addon-session` in `plugins` as well; `presmium dev` and `presmium serve` include the classroom connection, and for a static site set `presmium.session` `server` in the frontmatter (see `presmium-present/references/classroom.md`). `{exercise}` also needs `@lincyaw/addon-exec` to check answers.

### `{quiz}`

**Plugin**: `@lincyaw/addon-classroom` (configuration key `presmium.classroom`), with `@lincyaw/addon-session`.
**Argument**: none; no options. **Body**: the question (MyST), then the choices as a task list, `[x]` marking the correct ones (more than one allowed).

**Steps**: 0.

````md
```{quiz}
Which pair does BPE merge in each round?

- [ ] The pair that appears first
- [x] The most frequent pair
```
````

**In each form**: the web page and slides show a live quiz with lettered choices. The notebook and static exports show the question with the choices `A. …`, `B. …`, and the answer, as letters, folded.

**Errors**: ``{quiz} needs at least two options, written as a task list: `- [ ] wrong`, `- [x] right` ``; ``{quiz}: mark the right options with `[x]` ``.

### `{exercise}`

**Plugin**: `@lincyaw/addon-classroom` (configuration key `presmium.classroom`), with `@lincyaw/addon-session` and `@lincyaw/addon-exec`.
**Argument**: the language, default `python` (only Python can be checked). **Body**: the task, then two code blocks: the starting code the learner edits, and the checking code (each top-level statement is one check).

| Option | Value | Effect |
|---|---|---|
| `:timeout:` | milliseconds | Time limit for a check |

**Steps**: 0.

`````md
````{exercise} python
Write a function `mean(xs)` that returns the average.

```python
def mean(xs):
    return 0
```

```python
assert mean([1, 2]) == 1.5, "the mean of [1, 2] is 1.5"
```
````
`````

**In each form**: the web page and slides show an editor with the starting code and a **Submit** button that runs the checks and shows "Passed n/m" or the errors; in a classroom the presenter sees how many submitted and passed. The notebook gets the task, a code cell with the starting code and a cell with the checks (run the cell above first; no error means passed).

**Errors**: `{exercise} needs two code blocks: the starter code, then the checks`; the warnings `{exercise}: code blocks after the second (the checks) are ignored` and `{exercise}: checks run Python; <lang> exercises cannot be checked`.

### `{question-box}`

**Plugin**: `@lincyaw/addon-classroom` (configuration key `presmium.classroom`), with `@lincyaw/addon-session`.
**Argument**: none. **Body**: the prompt. Learners send questions to the presenter.

| Option | Value | Effect |
|---|---|---|
| `:target:` | block id | A labelled block in this section that the questions attach to |

**Steps**: 0.

````md
(key-idea)=
:::{slide}
> Training counts frequency; encoding follows order.
:::

```{question-box}
:target: key-idea
What is still unclear?
```
````

**In each form**: the web page and slides show the box; the notebook gets no cell.

**Errors**: when `:target:` is not a block of this section, an error under `presmium.classroom.places`.

### `{pulse}`

**Plugin**: `@lincyaw/addon-classroom` (configuration key `presmium.classroom`), with `@lincyaw/addon-session`.
**Argument**: the question; default "Did you follow this section?" in English documents, "这一节理解了吗？" in Chinese ones. **Body**: an explanation. Learners pick a level of understanding.

| Option | Value | Effect |
|---|---|---|
| `:levels:` | at least two, comma-separated | The choices; default "Got it, A bit unclear, Lost" (in Chinese "懂了, 有点模糊, 没懂") |

**Steps**: 0.

````md
```{pulse} Was this section clear?
:levels: Got it, A bit unclear, Lost
```
````

**In each form**: the web page and slides show the choices; the notebook gets no cell.

### `{predict}`

**Plugin**: `@lincyaw/addon-classroom` (configuration key `presmium.classroom`), with `@lincyaw/addon-session`.
**Argument**: the question (required). **Body**: further explanation. Learners predict first, then see the answer. The answer is everything that appears at the step after `{predict}`, usually a `{slide}` with `:reveal:`; the narration of that step counts too.

| Option | Value | Effect |
|---|---|---|
| `:choices:` | at least two, comma-separated | The choices; without it learners write a short text |

**Steps**: 0 (the answer's own block takes the next step).

````md
:::{predict} After three rounds of merging, how many new symbols are in the vocabulary?
:choices: 1, 2, 3
:::

:::{slide}
:reveal:
Three: each round adds one symbol.
:::

Narration: each round merges only the most frequent pair.
````

**In each form**:

- Web page, reading view: the answer stays hidden until the reader saves a prediction. Predictions are kept in the reader's browser.
- Presentation, presenter view and slides: the answer appears by step; the body's explanation comes before the form. In a classroom, learners' predictions also go to the presenter, and the **Interaction** panel shows counts per choice.
- Notebook: the question, the choices and the answer folded (`<details>`, its code with the output recorded at build time).
- PDF and PNG exports of slides: the answer expanded.

Block ids and steps of the answer do not change.

**Errors**: `{predict} needs the question as its argument: …`; the warning `{predict}: :choices: needs at least two, separated by commas; readers write their prediction instead`; a warning when nothing appears at the next step.

## Plugins without directives

| Plugin package | Configuration key | What it adds |
|---|---|---|
| `@lincyaw/addon-stage` | `presmium.stage` | Stage tools in the presentation: black screen (`b`), freeze (`f`), pen (`d`, or **Pen** in the presentation bar: four inks, eraser, undo, clear). The presenter's and the audience's windows and the classroom stay in sync, and pages opened from the server store the strokes in `.presmium/drawings/`. Footnote definitions are placed next to the block that references them |
| `@lincyaw/addon-publish` | `presmium.publish` | Remote images are downloaded into `.presmium/assets/` at build time; the high-contrast switch `PmContrastToggle` (place it with `{component}`); the offline cache, turned off with the setting `offline: false` |
| `@lincyaw/addon-session` | `presmium.session` | Classroom sessions; setting `server` (`ws://` or `http://`) |
| `@lincyaw/addon-exec-wasi` | `presmium.execWasi` | Runs `c`, `cpp`, `ruby` and `sql` code in WebAssembly (executor `presmium.wasi`, see `{code}`); named environments of `kind: wasi` (may set `languages: [c]`); setting `loadTimeoutMs` (time limit for downloading the runtime in the browser, default 120000). The runtime (about 52 MB for C and C++) is published only when some code runs in the browser (`:run: live` or `both`) |
| `@lincyaw/addon-exec-webgpu` | `presmium.execWebgpu` | See "Browser GPU" above |
| `@lincyaw/addon-exec-jupyter` | `presmium.execJupyter` | See "Remote environments" above (and `{terminal}`) |
| `@lincyaw/addon-speech` | `presmium.speech` | The speech service a synthesized lecture needs; see "Lecture roles" below |

## Inline roles

A role is written inline, ``{name}`content` ``, with options as `key=value` before the backtick: ``{cue to=code-1 lines=3-5}`spot` `` (a key without a value is a syntax error). Plugins add roles. A plugin's role shows its text in the web page, slides and notebook; a role that only gives a command, such as a cue, is not shown on the page and appears only as a marker `〔name content〕` in the web presenter window and in the slides' speaker notes. A role no listed plugin provides is the warning `unknown role {<name>}; its text is kept as plain text`. MyST's own roles, such as `{sub}`, `{sup}`, `{kbd}` and `{abbr}`, work as usual, and plugins cannot take their names.

## Lecture roles `presmium.lecture` (`@lincyaw/addon-lecture`)

**Plugin**: `@lincyaw/addon-lecture` (configuration key `presmium.lecture`); to synthesize speech also `@lincyaw/addon-speech`. The frontmatter's `renderers` must include `lecture`.

The narration is the lecture's script. When the frontmatter sets `renderers.lecture.voice`, `presmium build --to web,lecture` synthesizes each step's narration through the speech service into the lecture with the track id `script`, and the web page plays it at `?view=present&track=script`. Two roles, written in the narration, control it:

```markdown
First look at {cue to=code-1 lines=3-5}`spot` these three lines, {cue}`next` then merge them into a new symbol.
Run it {cue to=code-1}`run` and look at the result. That is how the {say alias="B P E"}`BPE` vocabulary grows. {cue}`pause 800ms`
```

| Role | Content | Options | Effect |
|---|---|---|---|
| `{cue}` | A command: `next`, `spot`, `hint`, `point`, `click <action>`, `run`, `ink`, `pause <duration>` (`800ms`, `1.5s`), `mark <name>` | `to` (a block's label), `lines` (code lines, such as `2-3`), `sel` (a CSS selector inside the block) | Acts when the first word after it is spoken: `next` advances one step; `spot` and `hint` put a spotlight or a hint on the block; `point` points at it; `ink` circles it with a highlighter; `run` shows the recorded output; `click` triggers a component's named action; `pause` pauses (the sentence is split there); `mark` records a chapter point. Without `to`, it acts on the nearest on-screen block before this narration paragraph. Not shown on the page (the presenter window and the notes show `〔cue spot〕`) |
| `{say}` | The text shown | `alias`: the text spoken | Shows one spelling and speaks another; captions and the transcript use the shown text |

Settings under `renderers.lecture` in the frontmatter:

| Setting | Effect |
|---|---|
| `voice: { engine, voice, rate, style }` | Turns synthesis on (it costs money, so it happens only when `voice` is set). `engine` names an engine id the operator defined; without it, the `presmium.speech` `engine` setting is used |
| `script` | A separate lecture script file. A section in it starting with the same label as in the document, such as `(merge)=`, replaces that section's narration, paragraph k belonging to step k; what the lecture shows does not change |
| `gap` | The pause after a step is spoken before advancing; default 500 milliseconds; a number of milliseconds or `800ms`, `1.5s` |

`presmium: { presmium.lecture: { lexicon: { BPE: B P E } } }` is the pronunciation dictionary for the whole document. Narration in `{only} lecture` is spoken but not shown; narration in `{only} web, slides` is shown but not spoken. Without `lecture` in `renderers`, `{only} lecture` gets the warning `unknown renderer id`.

Synthesized clips are kept in the synthesis cache `.presmium/speech/`; commit it, so that other people's builds do not call the engine again.

**Errors** (under `presmium.lecture`):

- When the cache lacks a sentence and no engine is available, the build fails, and `presmium check` names each such sentence.
- `presmium check` also reports cues whose target does not exist and `lines` beyond the code's line count.
- ``{say}`<text>` has no alias="…" to say; the lecture says what it shows`` (warning).
- `renderers.lecture.voice: the lecture is said through the speech service, which no plugin provides; add @lincyaw/addon-speech to plugins`.
