# Proving a plugin works

Write down the trigger and the result the user sees, then pick the cheapest test that really crosses the
boundary where it could fail. Integration tests only: they run the real `presmium` CLI, real builds, real
servers and real browsers on documents. No unit tests of single functions, no mocks of Presmium or its
frameworks. One or two cases per thing the plugin promises.

## Pick the test by where it can fail

| Change | Test | How |
|---|---|---|
| Directive, options, diagnostics, steps | Compile the example, read the IR or the diagnostics | The `presmium()` helper (section 1): `presmium(dir, ['check'])`, `presmium(dir, ['build', '--to', 'notebook', '--out', out])` then `ir.json` |
| Fallback and notebook extension | Build the notebook, read the cells | `<out>/notebook/lecture.ipynb` |
| Server route | Start `presmium dev`, call the route with `fetch` | Section 2; the case "counts the waves on its server route under presmium dev" in `test/plugin.test.ts` |
| Component, steps, keyboard, toolbar | Build or start a dev server, drive a browser, compare what the user sees | Playwright, section 4 |
| Printed slides (PDF, PNG) | The slides page opened with `?print` shows the fallback | Playwright on the slides, section 4 |
| Peer dependencies, packing | Install the packed plugin into a fresh document project | Section 5 |

Assert what the user cares about ("stepping back restores the first picture", "the notebook has the
question in bold"), not that an internal function was called, and do not restate the implementation.

## 1. CLI tests

`@lincyaw/cli/testing` exports:

- `presmium(cwd, args, env?)`: runs the real CLI (`node <PRESMIUM_BIN> ...args`) and resolves
  `{ code, stdout, stderr }`. It drops the test process's `NODE_ENV=test`, so builds run in the same mode
  as for users.
- `PRESMIUM_BIN`: the CLI's script, for `spawn` when the test needs a long-running process.
- `run(command, args, { cwd?, env? })`: any other command, same result shape.

Assert the exit code first, with the output as the failure message, then read back what was written:

```ts
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@lincyaw/cli/testing'
import { afterAll, expect, it } from 'vitest'

const EXAMPLE = fileURLToPath(new URL('../example', import.meta.url))
const out = mkdtempSync(join(tmpdir(), 'presmium-plugin-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

it('writes the poll\'s question into the notebook', async () => {
  const { code, stdout, stderr } = await presmium(EXAMPLE, ['build', '--to', 'notebook', '--out', out])
  expect(code, stdout + stderr).toBe(0)
  const notebook = JSON.parse(readFileSync(join(out, 'notebook/lecture.ipynb'), 'utf8')) as { cells: { source: string | string[] }[] }
  expect(JSON.stringify(notebook.cells)).toContain('**Which sort is stable?**')
})
```

- `presmium check` prints `no problems` when clean; `--json` prints `{ entry, counts, findings, lock }`, for
  asserting a finding's `checkId`, `severity`, `message` and `source.line`.
- `<out>/ir.json` is the compiled IR: find a section by its label (`(label)=` above the heading becomes the
  section `id`) and look at `blocks[].node`.
- A case that needs another document (an error case, other options) writes a small `lecture.md` into a
  temporary directory with `plugins: ['<absolute path of the plugin>']` and the `renderers` it needs. Give
  the document `lang: en` or `lang: zh-CN` explicitly when asserting text.
- Build only the renderers the case reads (`--to notebook` is the fastest; `--to web,slides` builds the
  viewer, which takes longer on the first run).

## 2. Server routes under `presmium dev`

Spawn `presmium dev` with `PRESMIUM_BIN`, wait for its `server  <url>` line on stdout, call
`<url>/__presmium/<plugin id>/<route>`, and kill it in `finally`, awaiting its exit. `--to notebook` starts
the Presmium server without the web page's dev server, which is enough for routes. Drop `NODE_ENV` from the
environment you pass, as `presmium()` does. The case "counts the waves on its server route under presmium
dev" in `test/plugin.test.ts` has the full pattern.

## 3. Running

- Run one file, one worker: `pnpm exec vitest run test/plugin.test.ts`; filter cases with `-t '<name>'`.
  Each case starts real builds or servers, so keep cases few and avoid parallel files that build the same
  document into the same directory.
- Stop when the targeted cases pass. Report what passed, what was skipped and why, and what was not run.

## 4. Browser checks

For anything a user sees in the component, drive a real browser. Add `playwright-chromium` (or
`@playwright/test`) as a dev dependency; the project's `pnpm-workspace.yaml` already allows its install
script. Two ways to get pages:

- **Dev server**: spawn `presmium dev example --to web,slides --out <tmp>`, read the `web  <url>` and
  `slides  <url>` lines, open them. Under the dev server the plugin's routes also work. The first page load
  may wait while Vite prepares dependencies; wait for the component to appear rather than for a fixed time.
- **Built site**: `presmium build example --out <tmp>`, then serve `<tmp>` with a static file server
  that answers unknown paths under `/slides/` with `/slides/index.html` (the slides page reads its
  position from the path),
  and open `/web/` and `/slides/`. A built site has no Presmium server (`useServer().available` is false).

What to check:

- **Both forms**: the same key interaction in the web page and in the slides; the slides take
  `?slide=<n>&step=<k>` to open a slide at a step, and arrow keys step.
- **Steps**: go forward, back, and jump straight to a step; the picture at a step is the same however you
  got there. For animations with `useStepTime`, the settled state after stepping back is the final one.
- **Static**: the printed slides `?print` (all slides at their last step; `&steps` one page per step) show the
  fallback; the page sets `data-presmium-printed` on `<html>` when it is ready to print.
- **Start**: in the slides, press `p` to open the presenter view; its start report lists each browser
  plugin as started, degraded, disabled or failed.
- **Look**: light and dark (`dark` class on `<html>`, or the page's toggle), a window narrower than 768 px,
  readable contrast; no errors in the console; no error box in place of the component.
- **Language**: a document with `lang: en` and one with `lang: zh-CN` show the component's text in that
  language.
- **Cleanup**: after leaving the slide or closing the page, no Worker, timer or media keeps running.

Blocks are `.pm-block[data-block]` elements; locate the component by its own class or role, not by
position.

## 5. Install as a user would

The example loads the plugin from its directory. Before publishing, check the packed package once: `pnpm
pack`, then in a new directory create a document project (`presmium new --type lecture`, which has
Presmium as a dev dependency; run `pnpm install`), `pnpm add -D <path to the .tgz>`, list the package name under `plugins`, and run `presmium check` and `presmium build`.
This catches files missing from `files`, imports of dev-only packages, and peer ranges the installed
Presmium does not satisfy (`plugin "..." is not loaded: it needs ...`).

## 6. Processes and external conditions

- Each test starts its own servers, temporary directories and ports, records the PIDs, and stops them at
  the end. Never stop servers you did not start; no `pkill -f` or `killall`.
- When a case needs Docker, a GPU, credentials or a network service and the condition is missing, skip it
  explicitly with the reason; a skip is not a pass. Use the real service where possible; a small fake that
  speaks the real protocol over a real port is acceptable for an external provider.
- Passing locally does not prove other browsers, operating systems, or a deployed server.
