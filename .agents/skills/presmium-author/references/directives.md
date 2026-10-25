# Directive reference

For each directive: the plugin package that provides it (list it under `plugins` in the frontmatter), the plugin ID (its configuration key under `presmium:`), the argument, the body, the options, the IR it produces and its step count (`span`; how steps and narration correspond is in [the steps section of writing.md](writing.md)), and a minimal example.

Every directive accepts three common options:

- `:reveal:`: the block appears at the next step. On `{slide}` and `{only}`, `:reveal: items` reveals the list inside item by item.
- `:label:`: the block ID, the same as writing `(name)=` before the block.
- `:audience:`: the block is only for these audiences (comma-separated, e.g. `teacher`). On `{slide}` and `{only}` it applies to every block inside; nested audiences intersect. To give narration an audience, wrap it in `{only}`. It can also be written on a MyST directive nested in another directive's body or in a list item (`{tab-item}`, `{card}`, a `{tip}` inside `{note}`, a `{code}` in a list item): only that directive is removed, and the block containing it stays. On `{include}` it applies to all included content; headings in it still open sections, and those sections are entirely for those audiences. `presmium build --audience student` omits blocks whose audience does not include `student`; see `{audience}` below.

Option values are read by the type the directive declares (`string`, `number`, `boolean`, `list`); when a directive declares options, a misspelled option name gets the warning `unknown option`.

A directive can be written as a backtick code fence (```` ```{name} ````) or a colon fence (`:::{name}`). Directives whose body is MyST (`{slide}`, `{only}`) are usually written with colon fences. When the body contains a code fence, the outer fence must be one character longer than the inner one (for example four backticks outside).

## Built-in directives (compiler, no plugin needed)

### `{narration}`

Bind the MyST body to one section step explicitly. `:at: N` is required (zero-based); `:mode: during` (default) speaks while that step’s animation plays, `:mode: after` waits for its longest declared animation to finish before speaking. Explicit narration does not shift subsequent visual blocks or implicit narration. It compiles without a lecture plugin; lecture playback, WebVTT and video export consume the timing. The workbench’s step narration pane edits this directive directly, including steps without narration. The UI counts steps from 1.

```md
:::{narration}
:at: 1
:mode: after

The swap has finished. The larger number moved one place to the right.
:::
```

### `{slide}`

The body is MyST; every block in it is projected content. Options: `:reveal:`, `:reveal: items`, `:at:` (non-negative integer, from 0), `:until:` (hidden from that step on; must be greater than the start step). `at` cannot be combined with `reveal`. The reading form shows the content expanded; the presentation shows it within its range and restores it when going back. To replace one result with another, write `:at: 0`, `:until: 1` on the first and `:at: 1` on the second; no component or player is needed.

```md
:::{slide}
:reveal: items
- Count adjacent pairs
- Merge the most frequent pair
:::
```

The list appears item by item; `span` is the number of items minus one.

### `{only}`

The argument is a list of renderer IDs (`web`, `slides`, `notebook`, `lecture` from the lecture plugin, or another key of the frontmatter's `renderers`; comma- or space-separated); the body is MyST, and its blocks go only to these renderers. Nested restrictions intersect. Options: `:reveal:`, `:reveal: items`, `:at:`, `:until:` (step ranges as in `{slide}`). Each renderer's steps are compressed: steps taken only by blocks of other renderers do not exist in it, and later steps move up.

```md
:::{only} web, notebook
A supplementary derivation shown only on the web and in the notebook.
:::
```

A missing argument is the error `needs the renderer ids it is limited to`; an unknown ID (such as a misspelled `slide`) gets the warning `unknown renderer id`, since its content would otherwise vanish from every form.

### `{hints}`

The body is a YAML mapping whose keys are renderer IDs and whose values must also be mappings. Produces no block and takes no step.

```md
:::{hints}
web: { layout: scrolly }
slides: { layout: center, class: my-page }
:::
```

- `web.layout: scrolly`: on the web this section uses a scrolling narrative layout (projected content fixed on one side, narration scrolling).
- `slides.layout` sets this slide's layout: `default` (the chapter name above the title, then the content; the footer has the lecture title, the step and the page number), `cover` (cover page; the first slide uses it by default when the lecture has more than one), `center` (content centered), `full` (no footer or margins, content fills the canvas). `slides.class` adds a CSS class to this slide; `slides.zoom` scales this slide's content (e.g. `0.8`). Content larger than the canvas is scaled down as a whole to fit.
- Hints a renderer does not recognize are ignored.

### `{config}`

The body is a YAML mapping whose keys are plugin IDs and whose values must be mappings (otherwise an error). It applies only to this section and is merged over the global configuration under `presmium:` in the frontmatter. Place it at the top level of a section or inside a `{slide}` or `{only}` in the section; before the first `##` it belongs to the cover section. Produces no block and takes no step. Several `{config}` blocks in one section merge in source order, later options of the same plugin overriding earlier ones; the whole section's configuration is read before its blocks are converted, so a directive anywhere in the section sees all of it.

```md
:::{config}
presmium.exec: { timeoutMs: 30000 }
:::
```

Section configuration reaches the plugin's directives (`DirectiveContext.config`), compile passes (`PassContext.configFor`) and, in the browser, `useSectionConfig`. Options read from section configuration:

- `presmium.exec: { timeoutMs }`: the timeout for this section's code (code blocks with `:run:`, `{code-ref}`, `{run-panel}`, `{step-run}`) at compile time and in the browser; a block's own `:timeout:` takes precedence. The example lets a slow example run for 30 seconds.
- `presmium.code: { repo }`: the repository URL for this section's `{code-ref}` permalinks; `:repo:` takes precedence.

### `{audience}`

The argument is a list of audience names (comma- or space-separated); no body. Place it at the top level of a section to mark the whole section as only for these audiences (for example a section of teacher's guide). Produces no block and takes no step. To mark only part of the content, use the common option `:audience:`.

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

- Content without an audience is visible to every audience; a build without `--audience` includes everything.
- `presmium build --audience student` removes at compile time the sections and blocks whose audience does not include `student` (the remaining sections are renumbered and steps compressed accordingly); removed code is not executed. After the build, every written file is scanned: a sentence of 12 or more characters from the removed content (except sentences the student content also has) appearing in a file is the error `presmium.audience`, located at the removed block, with a message naming the sentence and the file (for example when it leaked in through a code block's output).
- `presmium check --audience student` compiles as the student version and checks it.
- Learners get the student build (`presmium build --audience student`, published as a static site); `presmium serve` is for your own use and shows all content. When the student version publishes a recorded lecture, only the sections whose content has not changed since recording are kept (for sections containing teacher paragraphs, or into which content moved from a teacher section after recording, the speech and audio/video are not published).
- A body gets the warning `takes no body` (the body is ignored and is not teacher-only). `{audience}` or `:audience:` without an audience name is an error; the marked content (the whole section for `{audience}`) then goes to no audience and appears only in the full build without an audience.
- A build with `--audience` does not report diagnostics inside the removed content (they would reveal it), only a count `<n> findings are in the content left out for student`; `presmium check` without `--audience` lists them.
- Translations are compiled for the same audience; neither language of the student version contains teacher content.
- A `{ref}` to a teacher-only section has no target in the student version (warning `target not found` at build time); do not reference teacher sections from student content.
- Block IDs in the student version match the full version, but section numbers and steps are renumbered: when learners follow the presenter in class, both must use the same version.

Other plugin options are read only from the global configuration.

### `{component}`

The argument is the component name (a file name under a plugin's `components/`); the body is YAML props. Options: `:span:` (internal steps), `:plugin:` (plugin ID, defaults to the plugin that registers the component); other options become props, with values read as YAML.

```md
:::{component} StepList
:span: 3
steps: [Parse, Start, Render]
:::
```

Here `StepList` is the component in `components/StepList.tsx` in the lecture directory (plugin ID `deck`); components get steps and services through `@lincyaw/host`. A component with actions names them with `useActions`, and ``{cue to=<block>}`click <action>` `` in the narration runs the action when it is spoken (see "Lecture roles" below). A plugin's components can be placed in the body the same way, for example `PmContrastToggle` (the high-contrast switch, `@lincyaw/addon-publish`); both forms render them. When no listed plugin registers the component, the warning is `no plugin in plugins registers the component`.

### `{include}`

The argument is a file path (relative to the current file). The included file's frontmatter is ignored (with a warning).

````md
```{include} pages/intro.md
```
````

### `{literalinclude}`

Shows a file (relative to the current file), or some of its lines, as a code block; recompiles when the file changes. Options: `:language:` (default by extension), `:lines:` (e.g. `2, 4-6`), `:start-line:`, `:end-line:`, `:start-after:`, `:end-before:`, `:start-at:`, `:end-at:` (cut by line number or by a line containing some text, as in MyST), `:caption:` or `:filename:` (title), `:emphasize-lines:`. A missing file is an error.

````md
```{literalinclude} src/bpe.py
:start-after: def merge
:end-before: def encode
```
````

### `{code}`, `{code-block}`, `{code-cell}`, `{sourcecode}`

The argument is the language; the body is code. Options: `:caption:` or `:filename:` (title), `:emphasize-lines:` (lines emphasized at every step, e.g. `2, 4-5`), `:run:`, `:executor:`, `:timeout:` (milliseconds, default this section's `presmium.exec.timeoutMs`), `:env:`, `:session:`, `:echo:`. `{code-cell}` (the MyST notebook form) also produces a code block, and `:run:` executes as usual.

````md
```{code} python
:run: both
print(sum(range(10)))
```
````

- `:run:` takes `compile` (default: executed at build time, output recorded), `live` (executed only in the browser) or `both`. A bare `:run:` equals `compile`.
- `:executor:` names an executor ID: `presmium.python`, `presmium.node` (exec plugin), `presmium.container` (local environment plugin), `presmium.wasi` (WebAssembly plugin). When the named executor is unavailable, no other executor is used: running in the browser fails and shows the recorded output and the reason.
- `:env:` selects the environment: a name from `execute.environments` in the frontmatter (compiled to the executor `presmium.env.<name>`), or the reserved name `browser` (executor chosen by language). Without it, `execute.env` from the frontmatter applies. Writing it together with `:executor:` is an error; an undeclared environment is an error, reported on the code block's line.
- `:session:` is a session name: code blocks of one session share an interpreter (variables defined in one block are usable in the next). At compile time they run in document order in one interpreter, and changing any of them re-executes the whole session; in the browser each page and each learner has its own, and **Reset session** next to the code block discards it. Blocks of one session must use the same environment.
- `:echo: false` (requires `:run:`): shows only the output, without code or run controls. When the output is only Markdown (`text/markdown`), it is shown as body text, for generating tables and lists from data. Together with `:run: live` it warns and executes as `compile`.
- Rich output: in Python, `display(obj)` (no import needed) and `from IPython.display import Markdown, HTML, Image, SVG, Latex, JSON` show objects (by their `_repr_html_`, `_repr_markdown_`, `_repr_png_` and so on). matplotlib figures are shown as images at `plt.show()` and at the end of the run (matplotlib must be installed where the code runs: Python in the browser has only the standard library, and `live` or `both` blocks that import other modules get a `presmium check` warning; use `:run: compile` or only the standard library). When the last statement is an expression, its value (if not `None`) is shown as output, as in Jupyter. Web and slides show outputs by type (HTML sanitized); the notebook writes the outputs into the cell as they are.
- A plain code fence (```` ```python ````) cannot take options; to execute it, write it as `{code}`.
- C, C++, Ruby, SQL (language names `c`, `cpp` or `c++`, `ruby` or `rb`, `sql`): with `@lincyaw/addon-exec-wasi` under `plugins`, these blocks run at compile time and in the browser in the same runtime inside WebAssembly (C and C++ are first compiled by clang 8 with `-Werror`). The build machine needs no compiler or interpreter, and the web page runs them offline. Each run is an independent program (`:session:` is not supported); SQL runs in an empty in-memory database. In C, a global variable that is neither initialized nor `static` (such as `int stats[256][256];`) makes the program exit with code 134: write `static int stats[256][256];` or give it an initial value. The published runtime comes with its license notices (`wasi/LICENSES`).
- Code blocks with `live` or `both` have a run button on the web and on slides (for C and the other languages, list `@lincyaw/addon-exec-wasi`), with the recorded output below. Those without step highlighting and without multiple versions also have **Edit the code**: edit in place (CodeMirror), run the edited code with Mod-Enter or the run button, and **Restore the code** returns to the original. Edits stay in that page and are not written back to the lecture.
- Code blocks written inside a plugin component (the body of a run panel, for example) are run by the component and have no run button or recorded output of their own.

### `{grid}`, `{grid-item}`, `{card}`, `{tab-set}`, `{tab-item}` and `{button}`

The standard MyST cards, grids, tabs and buttons (mystmd's `myst-ext-card`, `myst-ext-grid`, `myst-ext-tabs`, `myst-ext-button`), built into the compiler, for course home pages and guide pages. They are projected content.

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

| Form | Argument and options |
|---|---|
| `{grid}` | The argument is the number of columns at four screen widths (phone, from 576px, from 768px, from 992px), 1 to 4 numbers; with fewer, the last number applies to wider screens; default `1 2 2 3`; `:class:` |
| `{grid-item}` | One cell of a grid; `:columns:` how many of the 12 parts of a row it takes; `:class:` |
| `{card}` | The argument is the title; `:link:` (the address the whole card links to; can be a local file, published with the lecture), `:header:`, `:footer:`; in the body, text before `^^^` is the header and text after `+++` the footer |
| `{tab-set}`, `{tab-item}` | `{tab-item}`'s argument is the title; `:sync:` a sync key (selecting it switches tabs with the same key on the page together), `:selected:` selected at the start |
| ``{button}`text <address>` `` | A link styled as a button; without `<address>` it is just button-styled text (not clickable) |

By medium: the web shows everything (grids split into columns by screen width, tabs switchable). Slides show cards and grids as usual (columns of the widest setting) and expand tabs one after another as titled parts. In the notebook, card titles and tab titles become small headings (`####`), the rest paragraphs, buttons links, and the build report lists these degradations (`degraded in the notebook, which has no Jupyter form for grid, card`).

### Other MyST directives

MyST's own directives (admonitions such as `{note}`, `{figure}`, `{math}`, `{list-table}`, `{dropdown}` and others) are kept as standard mdast and are projected content. ```` ```mermaid ```` code blocks are drawn by the renderers. A name that is neither registered nor a MyST directive is the error `unknown directive; is the plugin that provides it listed in plugins?`.

## Code references `presmium.code` (`@lincyaw/addon-code`)

### `{code-ref}`

The argument is an anchor; no body.

| Option | Type | Effect |
|---|---|---|
| `:pin:` | string | The commit to read (hash, branch or tag); without it the working tree is read |
| `:steps:` | list | Names of the logical units (`#region`s nested inside the anchor) to highlight step by step, one per step; `all` and `none` mean no unit stands out at that step |
| `:variants:` | list | At least two commits, switching version step by step; cannot be combined with `:pin:` or `:steps:` |
| `:lang:` | string | Highlighting language; default from the file extension |
| `:repo:` | string | Repository URL for permalinks; default this section's `presmium.code.repo` (settable per section with `{config}`), then the `origin` remote |
| `:run:`, `:executor:`, `:timeout:`, `:env:`, `:session:` | | As for `{code}` |

Steps: the number of `:steps:` or `:variants:` entries minus one. With `:variants:`, lines glide to their new places between versions; the source bar's file link and line numbers are those of the version shown.

Anchors (file paths are relative to the root of the git repository containing the lecture, or to the lecture directory when it is not in git; when a path is written relative to the lecture directory by mistake, the diagnostic gives the correct form):

- `region:<file>#<region name>`: the code between the comments `#region name` and `#endregion name` (all the VS Code folding-region forms are recognized: `# #region`, `#region`, `// #region`, `<!-- #region -->` and so on). The marker lines are not shown, and common indentation is removed.
- `symbol:<file>#<name>`: finds a declaration by syntax tree, such as `Parser.parse`; supports TypeScript, JavaScript and Python, and the referenced code needs no markers.
- `pattern:<file>#<ast-grep pattern>`: code matching an ast-grep pattern, such as `pattern:src/cart.ts#if (prices.length === 0) $$$`.

````md
```{code-ref} region:src/bpe.py#merge
:pin: dd64ade
:steps: count, replace
```
````

Nested regions in the referenced file:

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

Diagnostics: `presmium.code.anchors` (a lost anchor is an error, an ambiguous match a warning, a moved one a hint), `presmium.code.drift` (the working tree's code changed after the pinned commit; a warning with the diff), `presmium.code.syntax` (the argument is not an anchor, `:variants:` has fewer than two entries, and so on). Local code without a remote repository is shown normally, just without permalinks, and produces no diagnostic. Resolved anchors are locked in `.presmium/anchors.lock.json`; `presmium check --update-lock` re-resolves them.

## Browser execution `presmium.exec` (`@lincyaw/addon-exec`)

In the browser, Python runs on Pyodide and JavaScript and TypeScript in a script Worker; compile-time execution uses the machine's `python3` and `node`. The language names `py`, `python3` and `ipython` are Python, `js` and `mjs` JavaScript, `ts` TypeScript. Global configuration `presmium.exec`: `timeoutMs` (default 10000; also settable for one section with `{config}`), `loadTimeoutMs` (default 30000), `maxTraceEvents` (default 500), `pyodideURL`.

### `{run-panel}`

The argument is the language: `python` (default), `javascript`, `typescript`, or another language that has an executor (such as `wgsl` from the WebGPU plugin, see "Browser GPU" below); the body is code.

| Option | Type | Effect |
|---|---|---|
| `:params:` | string | A YAML mapping of variables injected into the program (constants in JavaScript); viewers can change them and rerun. For other languages the executor reads them (such as `wgsl` buffers and dispatch); values can be lists and mappings, shown as JSON in the form |
| `:timeout:` | number | Milliseconds; default this section's `presmium.exec.timeoutMs` |
| `:recorded:` | string | Prerecorded output shown when execution fails or times out |
| `:run:` | string | `both` (default; the output is also recorded at build time) or `live` (executed only in the browser) |
| `:env:`, `:session:` | string | As for `{code}`: environment and execution session |

````md
```{run-panel} python
:params: {n: 4}
:recorded: 0 1 4 9
print(*[i * i for i in range(n)])
```
````

Produces `PmRunPanel`, 0 steps. The panel's top bar states the language and where it runs (such as "Python · runs in the browser"; for an `:env:` environment, according to its `kind`); the parameters and the run button are in the top bar too. After a run, the output shows the time taken ("Output · 0.02 s"); on slides it sits beside the code when there is room. When a live run cannot happen (no runtime, no GPU adapter, timeout) and the panel has no `:recorded:`, the output recorded at build time is shown with the reason. PDF and PNG exports show the code with the parameter assignments first, plus the build-time output (`:recorded:` when it was not executed at build time, failed or timed out). In the notebook, panels in the kernel's language (Python by default) become code cells (parameter assignments first); other languages become Markdown cells with the code and the output.

### `{step-run}`

The argument is the language (default `python`; line tracing is implemented with Pyodide and supports only Python); the body is code.

| Option | Type | Effect |
|---|---|---|
| `:steps:` | number | Number of executed lines, one step per line; when missing, a warning and no steps |
| `:params:` | string | As for `{run-panel}` |
| `:timeout:` | number | Milliseconds |

````md
```{step-run} python
:steps: 4
total = 0
for x in [1, 2, 3]:
    total += x
print(total)
```
````

Produces `PmStepRun`; its step count is `:steps:`. In the web document view the component has its own previous, next and slider, so readers can step through line by line; on the web the Python runtime loads only when the component comes near the screen.

## Local environment `presmium.execLocal` (`@lincyaw/addon-exec-local`)

### `{local-env}`

The argument is the language (default `python`); the body is code. Runs in the repository's devcontainer (requires Docker and `presmium dev`), and can export the code and the environment.

| Option | Type | Effect |
|---|---|---|
| `:file:` | string | Required: the code's path in the workspace |
| `:workspace:` | string | The directory holding the devcontainer, relative to this file; default `presmium.execLocal.workspace`, then the lecture's git root |

````md
```{local-env} python
:file: src/hello.py
print("hello")
```
````

Produces `PmLocalEnv`; it also provides the executor `presmium.container` for a code block's `:executor:`. Running in a container needs Docker and the Presmium server (`presmium dev` or `presmium serve`, on the web or on slides). Running and reproducing the environment are server routes of the plugin `presmium.execLocal`, available to editors, and each run is first confirmed as an `operate` approval. The panel has no button that commits code back to the repository. Each run is a new container whose working directory is that run's own directory; the workspace is mounted read-only at `/workspaces/<directory name>`, and its modules can be imported. A lecture has only one workspace: `{local-env}` blocks with different `:workspace:` values are an error. Global configuration `presmium.execLocal`: `workspace`, `priority` (default 10, higher than the browser executors), `buildTimeoutMs` (time limit for building the devcontainer image, default 600000).

## Browser GPU `presmium.execWebgpu` (`@lincyaw/addon-exec-webgpu`)

It has no directive of its own: it provides the executor for WebGPU compute shaders in `{run-panel} wgsl` (runs in the browser, recorded at build time in Playwright's Chromium), and lets JavaScript and TypeScript code import jax-js. List it in `plugins` together with the exec plugin.

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

- Keys of `:params:`: `buffers` (required: for each `var<storage>` and `var<uniform>` in the shader, by variable name, a data list or `{ data, size, fill, type, read }`; group, binding, access and the types `f32`, `i32`, `u32` come from the shader), `dispatch` (workgroups per dimension, 1 to 3 numbers, default 1), `entry` (entry function, default the only compute entry), `repeat` (number of runs, default 1, at most 1000; timing uses the median), `features` (required adapter features, such as `[shader-f16]`). All buffers together at most 128 MiB.
- Output: each writable storage buffer (`read_write`) is read back and shown on one line, such as `out: f32[4] = [11, 22, 33, 44]` (long ones show the head and tail plus minimum, maximum and mean), followed by the time per dispatch and the adapter; on the CPU-emulated fallback adapter (SwiftShader) the timing is marked "CPU emulation". Output recorded at build time follows the lecture's `lang` (default Chinese).
- When the browser has no WebGPU, no GPU adapter, lacks a feature or limit, loses the device or times out, the panel shows the output recorded at build time with the reason (such as "Recorded output · No GPU adapter is available"); shader errors are shown as errors as usual.
- At build time: with a graphics card, Chromium uses it through Vulkan, otherwise SwiftShader. Declaring `cpu: { kind: webgpu, adapter: swiftshader }` under `execute.environments` and writing `:env: cpu` makes the recording identical on any machine (`adapter` can also be `auto` or `gpu`). Without Playwright's Chromium installed, nothing is recorded and the existing recording is kept.
- Running the same shader from Python (Pyodide): `import presmium_gpu as gpu`, `result = await gpu.run(SHADER, buffers={'a': [1, 2], 'b': [3, 4], 'out': {'size': 2}}, dispatch=1)` (top-level `await` works in a code block); `result['out']` is the list read back, and `print(result)` shows the same summary as the panel (in English). Browsers with JSPI, such as Chromium and Firefox, also have the synchronous `gpu.run_sync(...)`. The limits are those of the panel (buffers 128 MiB in total, `repeat` at most 1000); exceeding them raises `ValueError`, and being unable to run raises `presmium_gpu.GPUUnavailable`. Write such blocks with `:run: live` (Python at build time has no WebGPU).
- In JavaScript and TypeScript, `import { init, defaultDevice, numpy as np } from '@jax-js/jax'` uses jax-js (tensors and automatic differentiation; after `await init()`, `defaultDevice('webgpu')` computes on the GPU, and without WebGPU it uses WebAssembly by default). jax-js is published with the output and loads on first import; write such blocks with `:run: live`.

## Remote environments `presmium.execJupyter` (`@lincyaw/addon-exec-jupyter`)

Provides named environments of `kind: jupyter`: any Jupyter Server (a docker compose setup, JupyterHub, agent-sandbox and the like). Declare the environment in the frontmatter and select it on code blocks with `:env:`; the code then runs in its kernel both at build time and in the browser:

```yaml
execute:
  environments:
    lab: { kind: jupyter, auth: proxy, kernel: python3, image: 'quay.io/jupyter/base-notebook:2026-10-12@sha256:…' }
```

- `auth` (default `env`): `env` is available only at build time; `proxy` connects from the browser through the Presmium server's proxy (`presmium dev` and the workspace service; static output shows the recorded output); `prompt` connects to the lecture's `url`, and learners paste their own token on the page (kept only in that page's `sessionStorage`; for published static sites); `none` connects to `url` without a token; `hub` is reserved. A JupyterHub user server is written `url: https://hub.example.edu/user/{user}/`.
- Credentials are never written in the lecture: builds and the proxy use the operator's pair of environment variables `PRESMIUM_ENV_<NAME>_URL` and `PRESMIUM_ENV_<NAME>_TOKEN` (name upper-cased, other characters turned into `_`). A `url` in the lecture with a different origin from the operator's address is not connected and is an error; without an address no token is sent.
- A session (`:session:`) is one kernel, one per page and per learner; `image` is part of the environment's fingerprint. The output of `:run: both` is recorded at build time, and running in the browser gives the same result.
- `presmium check --env` connects to every environment; failing to connect is an error.

### `{terminal}`

The argument is the name of a `kind: jupyter` environment; no body. Opens a terminal of that Jupyter Server (xterm.js), with credentials handled as for the environment; it connects when the reader clicks **Open terminal**.

| Option | Type | Effect |
|---|---|---|
| `:height:` | number | Rows, default 16 |

```md
:::{terminal} lab
:height: 12
:::
```

Produces `PmTerminal`. A missing environment or one that is not `kind: jupyter` is an error (`presmium.execJupyter`). In static output a terminal with `proxy` shows an explanation instead of connecting, while `prompt` works as usual; the notebook gets no cell, and PDF and other static exports show a one-line explanation.

## Guidance `presmium.guide` (`@lincyaw/addon-guide`)

Targets are given as CSS selectors, usually the `id` of an HTML element you wrote yourself in the same section.

### `{cursor}`

No argument; the body has one waypoint per line: `[move|hover|click] <CSS selector>`, the action defaulting to `move`. Waypoint k is at the block's step k.

```md
:::{cursor}
:reveal:
#query
hover #run
click #run
:::
```

Produces `PmCursor`; its step count is the number of waypoints minus one. An empty body is an error.

### `{spotlight}`, `{hint}`

The argument is the target's CSS selector; the body is the popup text. Options: `:title:` (string, popup title), `:span:` (number, steps it lasts, default 0). `{spotlight}` puts a spotlight on the target; `{hint}` is a pulsing hint.

```md
:::{spotlight} #output
:reveal:
:title: Result
Each colored block is a token.
:::
```

Produces `PmSpotlight` and `PmHint`; the step count is `:span:`. A missing argument is an error.

## Rich content `presmium.content` (`@lincyaw/addon-content`)

Math (`$…$`, `$$…$$`) and ```` ```mermaid ```` are drawn by the renderers and need no directive. Global configuration `presmium.content.plantUmlServer`: the PlantUML server address. ```` ```plantuml ```` (or `puml`) code blocks are turned into images by a compile pass.

### `{markmap}`

The body is Markdown headings and lists, drawn as a mind map; a leading YAML block can set `markmap:` options. No directive options.

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

Produces `PmMarkmap`; renderers that cannot draw it show a nested list.

### `{video}`, `{audio}`, `{animation}`

The argument is the media file path (relative to this file, a package path such as `@lincyaw/addon-content/media/clip.webm`, or an `http(s)://` URL); the body is a caption.

| Option | Type |
|---|---|
| `:controls:`, `:autoplay:`, `:loop:`, `:muted:` | boolean |
| `:width:`, `:height:` | number |
| `:alt:` | string |
| `:still:` (`{animation}` only) | string: still image shown when reduced motion is preferred |
| `:poster:` (`{video}` only) | string: poster image shown before playback |
| `:captions:` (`{video}` only) | string: comma-separated `language=VTT file`, such as `en=films/loop.en.vtt, zh-CN=films/loop.zh.vtt`; each track's label is the language's name (in the interface language) |
| `:captions-default:` (`{video}` only) | string: the caption language shown at the start; without it no captions are shown by default |

````md
```{video} media/demo.webm
:controls:
:poster: media/demo.jpg
:captions: en=media/demo.en.vtt, zh-CN=media/demo.zh.vtt
:captions-default: en
A recording of the demo.
```
````

Produces `PmMedia`, degraded to a file link. Poster and caption files are relative to this file like the media file and are published with every medium. A missing media file, still image, poster or caption file is the error `file not found`, reported on the directive's line. In the notebook a video with a poster or captions becomes a `<video>` with `poster` and `<track>` (files copied to `media/`); other media become file links.

### `{youtube}`

The argument is a YouTube video ID or link; the body is a caption. Options: `:start:` (seconds), `:width:`, `:height:` (number).

````md
```{youtube} https://www.youtube.com/watch?v=dQw4w9WgXcQ
:start: 30
```
````

Produces `PmYoutube`, degraded to a video link.

## Animation `presmium.motion` (`@lincyaw/addon-motion`)

Animations written in code: one timeline of GSAP, Anime.js, Motion, Three.js, Remotion or D3, played by step and by lecture time. In a live presentation, each step forward plays that step's segment, and going back shows the settled frame; in lecture playback and exported video, the animation follows the narration's time, and the same moment always shows the same frame.

### `{scene}`

The argument is the scene name: a file under the lecture directory's `scenes/` without its extension (`.ts`, `.js`, `.mjs`), possibly with subdirectories, such as `bpe/merge`. The body is a caption (the accessible description, also what the notebook and static exports show).

| Option | Type |
|---|---|
| `:durations:` | list: the duration of each step, written as for the `pause` of `{cue}` (`1.2` and `1.2s` are seconds, `800ms` milliseconds); entry k is the block's step k. Without it, one step of duration 0 |
| `:aspect:` | string: aspect ratio, default `16/9` (`4:3` also works) |
| `:height:` | string: a CSS height (such as `360px`); when given, the aspect ratio is not used |
| `:still:` | string: a still image (relative to this file) shown in the notebook and static exports |

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

The block takes as many steps as there are durations, minus one, and the narration paragraphs correspond to those steps one by one (the step rules are in [writing.md](writing.md); aligning with lecture time is in `presmium-animate/references/timeline.md`). In a synthesized lecture, a step lasts at least until its animation finishes; a ``{cue}`next` `` in the narration still advances at its word, and when that is before the animation finishes the build warns `moves on … before the animation`: move the cue later or shorten `:durations:`.

A scene file default-exports one scene (from `@lincyaw/addon-motion/scene`); the libraries are provided by the plugin, so the lecture does not install them. Each scene receives `root` (the frame's element), `at(k)` (the millisecond at which step k starts on the timeline), `durations`, `total`, `width`, `height` and `color(name)` (a design-system color, such as `color('accent')`, returning `rgb()` or `rgba()`):

| Form | Returns | Time unit |
|---|---|---|
| `gsapScene(({ root, gsap, plugins, at }) => …)` | A GSAP timeline (created in a `gsap.context` scoped to `root`, so selectors find only the scene's elements); the `plugins` SplitText, DrawSVG, MorphSVG, MotionPath, Text, CustomEase, CustomBounce, CustomWiggle, Physics2D, PhysicsProps and Flip are registered | seconds: `at(k) / 1000` |
| `animeScene(({ root, anime, at }) => …)` | An Anime.js timeline, such as `anime.createTimeline({ autoplay: false })` | milliseconds |
| `motionScene(({ root, motion, at }) => …)` | `motion.animate(sequence)`; put the same property of the same element in one sequence (separate animations overwrite each other when seeking) | seconds |
| `threeScene(({ THREE, renderer, addons, at, width, height }) => …)` | `{ render(ms), resize?(w, h), dispose?() }` or just `render`; the plugin creates the renderer and keeps it at the frame's size; `addons` has CSS2DRenderer, CSS2DObject, Line2, LineGeometry, LineMaterial, ParametricGeometry, RoundedBoxGeometry, ConvexGeometry | milliseconds |
| `remotionScene(({ React, remotion, at }) => …)` | `{ component, fps, width, height }`: a Remotion component written with `React.createElement` (scene files use plain TypeScript; React components in scenes are created through the adapter), drawing the frame for each moment | frames |
| `d3Scene(({ root, d3, at }) => …)` | A function that draws a moment, `(ms) => void` (or `{ seek, resize?, dispose? }`): build the graphics with D3 and draw by time with its interpolators and easings; do not use `transition` | milliseconds |
| `defineScene((ctx) => …)` | Your own drawing: a `(ms) => void`, or `{ seek, resize?, dispose? }` | milliseconds |

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

The frame must depend only on the position on the timeline: do not read the page's clock, start your own loops or play in real time in a scene. Scene files may import only from `@lincyaw/addon-motion/scene`, not library paths such as `gsap/…` or `three/addons/…` (the lecture does not depend on those libraries); plugins and add-ons come from the parameters in the table above. Choosing a library, how to write each one, examples and aligning animation with narration are in the presmium-animate skill. The fully expanded document view shows the final state, and readers can play and scrub below the scene. A missing scene is reported as `the deck has no scenes/<name>.ts`, malformed durations as `:durations: takes durations`, both on the directive's line.

## Classroom `presmium.classroom` (`@lincyaw/addon-classroom`)

Classroom components need the session plugin `@lincyaw/addon-session` (`presmium dev` and `presmium serve` include classroom sync; for static hosting, set `presmium.session.server` in the frontmatter, see the presmium-present skill). `{exercise}` checking also needs the exec plugin `@lincyaw/addon-exec`.

### `{quiz}`

No argument or options; the body is the question (MyST) followed by options as a task list, with `[x]` marking the correct ones (more than one allowed).

````md
```{quiz}
Which pair does BPE merge in each round?

- [ ] The pair that appears first
- [x] The most frequent pair
```
````

Produces `PmQuiz`; fewer than two options or no correct option is an error. In the notebook and static exports it is the question with lettered options (`A. …`, as in the live quiz), with the answer folded and given as letters.

### `{exercise}`

The argument is the language (default `python`; only Python can be checked); the body is the task, followed by two code blocks: the starting code and the checking code (each top-level statement is one check). Options: `:timeout:` (number, milliseconds).

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

Produces `PmExercise`; a missing checking code block is an error.

### `{question-box}`

No argument; the body is the prompt. Options: `:target:` (string, a labeled block in this section that questions attach to).

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

Produces `PmQuestionBox`; the notebook gets no cell. When `:target:` is not a block of this section, the compile pass `presmium.classroom.places` reports an error.

### `{pulse}`

The argument is the question (default "Did you follow this section?" in English lectures, "这一节理解了吗？" in Chinese ones); the body is an explanation. Options: `:levels:` (string, at least two choices, comma-separated; default "Got it, A bit unclear, Lost", in Chinese "懂了, 有点模糊, 没懂").

````md
```{pulse} Was this section clear?
:levels: Got it, A bit unclear, Lost
```
````

Produces `PmPulse`; the notebook gets no cell.

### `{predict}`

Predict first, then reveal. The argument is the question (required); the body is additional explanation. Options: `:choices:` (string, at least two, comma-separated; without it learners write a short text). The revealed content is everything that appears at the step after `{predict}`: use `:reveal:` to make it appear at the next step (usually a `{slide}` with `:reveal:`); the narration of that step counts too.

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

Produces `PmPredict`. The compile pass `presmium.classroom.predict-reveals` moves the revealed content into its child blocks (block IDs and steps unchanged); when nothing appears at the next step, it warns. In the web document view the revealed content stays hidden until the reader saves a prediction; the presentation, the presenter view and slides show it by step (the body's explanation comes before the form). Predictions are kept in the local browser; in a classroom, learners' predictions also go to the presenter, and the **Interaction** panel shows counts per choice. In the notebook it is the question, the choices and the folded revealed content (`<details>`, its code with compile-time recorded output); in PDF and PNG exports of slides the revealed content is shown expanded.

## Plugins without directives

| Plugin package | Plugin ID | Purpose |
|---|---|---|
| `@lincyaw/addon-stage` | `presmium.stage` | Stage tools: black screen (`b`), freeze (`f`), pen (`d` or **Pen** in the presentation bar: four inks, eraser, undo, clear; the presenter's and audience's windows and the classroom stay in sync, and pages opened from the server store the strokes in `.presmium/drawings/`); the compile pass `presmium.stage.footnotes` places footnote definitions next to the block that references them |
| `@lincyaw/addon-publish` | `presmium.publish` | The compile pass `presmium.publish.remote-assets` downloads remote images into `.presmium/assets/`; high-contrast switch; global configuration `offline: false` turns off the offline cache |
| `@lincyaw/addon-session` | `presmium.session` | Classroom sessions; global configuration `server` (`ws://` or `http://`) |
| `@lincyaw/addon-exec-wasi` | `presmium.execWasi` | Runs `c`, `cpp`, `ruby` and `sql` code in WebAssembly (executor `presmium.wasi`, see `{code}`); named environments `kind: wasi` (may set `languages: [c]`); global configuration `loadTimeoutMs` (time limit for downloading the runtime in the browser, default 120000). Only code that runs in the browser (`:run: live` or `both`) makes the build publish the runtime (about 52 MB for C and C++) |

## Inline roles

Plugins can register inline roles, written ``{name}`content` ``, with options as `key=value`: ``{cue to=code-1 lines=3-5}`spot` `` (a key without a value is a syntax error). A registered role is kept in the IR as a `presmiumRole` node, and web, slides and notebook show its children; a role without children (such as a cue) is shown only as a marker `〔name content〕` in the web presenter window and in the slides' speaker notes. A role no plugin registers is flattened to text with the warning `unknown role`. MyST's own `{sub}`, `{sup}`, `{kbd}`, `{abbr}` and the like are unaffected, and plugins cannot register roles with those names.

## Lecture roles `presmium.lecture` (`@lincyaw/addon-lecture`)

The lecture plugin registers two inline roles, written in the narration. The narration is the lecture's script: when the frontmatter sets `renderers.lecture.voice`, `presmium build --to web,lecture` synthesizes each step's narration through the speech service (`@lincyaw/addon-speech`, which must also be listed in `plugins`) into the lecture `script`, and the web page plays it at `?view=present&track=script`.

```markdown
First look at {cue to=code-1 lines=3-5}`spot` these three lines, {cue}`next` then merge them into a new symbol.
Run it {cue to=code-1}`run` and look at the result. That is how the {say alias="B P E"}`BPE` vocabulary grows. {cue}`pause 800ms`
```

| Role | Content | Options | Effect |
|---|---|---|---|
| `{cue}` | A command: `next`, `spot`, `hint`, `point`, `click <action>`, `run`, `ink`, `pause <duration>` (`800ms`, `1.5s`), `mark <name>` | `to` (a block's label), `lines` (code lines, such as `2-3`), `sel` (a CSS selector inside the block) | Runs when the first word after it is spoken: `next` advances one step, `spot` and `hint` spotlight and hint, `point` points at the block, `ink` circles it with a highlighter, `run` shows the recorded output, `click` triggers a component's named action, `pause` pauses (the sentence is split there), `mark` records a chapter point. Without `to`, it acts on the nearest projected block before this narration paragraph. Not shown on the page (the presenter window and notes show `〔cue spot〕`) |
| `{say}` | The text shown | `alias`: the text spoken | Shows one spelling and speaks another (captions and the transcript still use the shown text) |

Frontmatter configuration (`renderers.lecture`): `voice: { engine, voice, rate, style }` (synthesis happens only when `voice` is set, since it costs money; `engine` names only an engine ID defined by the operator, and without it `presmium.speech.engine` is used), `script` (a separate lecture script file: a section in it starting with the same label as in the lecture, such as `(merge)=`, replaces that section's narration, paragraph k belonging to step k; what the lecture shows does not change), `gap` (the pause after a step is spoken before advancing, default 500 milliseconds; a number of milliseconds or `800ms`, `1.5s`). `presmium.lecture: { lexicon: { BPE: B P E } }` is the pronunciation dictionary for the whole lecture. Narration in `{only} lecture` is spoken but not shown; narration in `{only} web, slides` is shown but not spoken. The frontmatter's `renderers` must include `lecture`, otherwise `{only} lecture` gets the unknown-renderer warning (`unknown renderer id`).

Synthesized clips are kept in the synthesis cache `.presmium/speech/` (commit it, so other people's builds do not call the engine again). When the cache lacks a sentence and no engine is available, the build fails, and `presmium check` reports each sentence under `presmium.lecture`; it also reports cues whose target does not exist and `lines` beyond the code's line count.
