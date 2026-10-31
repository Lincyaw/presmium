# Testing in the repository

Existing CLI helpers in `@lincyaw/cli/testing`, what to check in a browser and how to treat processes
and external conditions in general is in `presmium-develop/references/testing.md`. This file adds where the
repository's tests live, its e2e fixtures and helpers, and its cost rules. The strategy is
`docs/architecture.md` section 7; for the workbench and dsh `docs/design-dsh.md` section 15.

Follow the root `AGENTS.md` verification rule: no new tests and no routine test suites. Use real runs and
the lightweight structure checks directly affected by the change. The tests and helpers below document
existing setups, run only when the owner explicitly asks; then target the affected integration cases with
one worker. Do not run full test, demo or e2e suites without an explicit request. Existing tests use the
real CLI, builds, services, browsers and pinned dsh; no unit tests or host-framework mocks.

## Pick the test by where it can fail

| Change | Test | Start from |
|---|---|---|
| Directive, steps, diagnostics, the cache of recorded code-execution output | Run the real CLI on a document, check IR, diagnostics or output | `packages/cli/test/ir.test.ts`, `packages/addon-exec/test/compile.test.ts` |
| Component display, keyboard, stepping back | Build, act in a browser, compare what the user sees | `e2e/guide.spec.ts` |
| Preview updates after a save | Start a dev server, edit a file, check content and position | `e2e/viewer.spec.ts`, `e2e/workbench.spec.ts` |
| Student build, translation, published files | Build that version, read back the files written | `packages/cli/test/audience.test.ts`, `e2e/site.spec.ts` |
| Server routes, approvals, MCP | Start the service, request from a real client, check response and side effects | `packages/server/test/`, `packages/mcp/test/` |
| Package loading, peer dependencies, install paths | Install outside the monorepo and run | `packages/cli/test/consumer.test.ts`, `e2e/consumer.spec.ts` |
| dsh integration and upgrades | The upgrade gate for the affected boundary | `docs/design-dsh.md` sections 12 and 15; `packages/dsh/test/` |
| Preview protocol | A framework-free test host page | `e2e/preview-protocol.spec.ts` |

Package tests are `packages/<pkg>/test/*.test.ts` (Vitest). Before adding `@lincyaw/cli` as a dev dependency
of a package, check the dependency direction: the `mcp` and `server` tests start the CLI executable directly
to avoid a `cli → server → mcp` link cycle. A test that needs a renderer from a package directory (instead
of the installed one) points the document's `renderers.<id>.package` at that directory.

## End-to-end fixtures

A dedicated document goes into `e2e/fixtures/<group>/`, the spec into `e2e/<group>.spec.ts`. Import
`useFixture` from `./fixtures/deck.ts`: it builds and serves the document in `beforeAll` and cleans up in
`afterAll`. Specs use `test.describe.configure({ mode: 'default' })` so a group's document is built once.

`useFixture(name, options?)` returns a getter (call it `deck`): `deck().web` and `deck().slides` are the
addresses of the two forms, `deck().url` the site's origin, `deck().dir` the built copy, `deck().doc` its IR
(`dist/ir.json`), and `deck().slide(id)` finds the slide number by a stable section label. For manual
lifecycle use `buildFixture` from the same file and call `close()`. Options:

- `to`: the forms to build, as `--to` takes them (default `web,slides`); build only those needed.
- `audience`: build for an audience, e.g. students.
- `edit(dir)`: change the copied document, never the shared sample.
- `with`: bring extra fixture files.
- `link`: link plugins the example project's dependencies lack; read the helper's types for the shape.
- `bases`: serve `dist/` as one site, the web form under `/web/` and the slides under `/slides/` (a build
  whose forms both have a base other than `/` is served so anyway).

A component shared by the web page and the slides is driven through its key actions in both. Step features
verify at least that going forward and back and jumping straight give the same state. Static fallbacks are
verified on a real notebook, PDF or browser print. A new plugin's verification document goes here, never into
`examples/gallery/`.

Contrast is checked with `lowContrast` from `e2e/fixtures/contrast.ts` (used by `e2e/plugin-ui.spec.ts` for
plugin components and slides, and by the workbench and publish specs).

## Processes and ports

- A spec uses only servers it started itself, with its own temporary directories and ports; record PIDs and
  stop them at the end. Never reuse or stop another task's servers; no `pkill -f` or `killall`.
- Parallel checkouts set their own `PRESMIUM_E2E_SLIDES_PORT` and `PRESMIUM_E2E_WEB_PORT`
  (`e2e/urls.ts`). Workbench specs also take `PRESMIUM_E2E_STUDIO_PORT_OFFSET`, one offset added to every
  studio port, so they do not collide with another task's Harness.
- A static server is restarted after a rebuild; a running dev server is handled by the live-update mechanism
  under test.
- `pnpm e2e` runs every case in Chromium and only the smoke cases in the browsers listed in
  `PRESMIUM_E2E_BROWSERS` (default `firefox,webkit`) that are installed and start; missing browsers or
  system conditions are reported as skipped.

## External conditions

When Docker, a GPU or credentials are missing, skip explicitly with the reason. Reuse the existing launch
helpers instead of building a second protocol in a test:

- Remote kernels: `packages/addon-exec-jupyter/test/helpers.ts`, `e2e/fixtures/exec-remote/jupyter.ts`.
- Speech: the fake engine in `packages/addon-speech/test/helpers.ts`, used through a real service port; its
  fixed output verifies cache, transcription and synthesis.
- Classroom: the classroom service helper in `e2e/fixtures/plugins/decks.ts`, with separate browser
  identities for presenter and students.
- dsh: `packages/dsh/test/harness.ts` (each case its own directory and a scripted model; the shared fake
  model is `@lincyaw/dsh/testing`); each case uses its own `DSH_HOME` and `HOME`.

### Local Jupyter without Docker

Point `PRESMIUM_TEST_JUPYTER_PYTHON` at a Python with `jupyter_server` and `ipykernel`. Without it these
cases skip, and a skip is not a pass. Run them one after another with one worker:

- `e2e/exec-remote-cleanup.spec.ts`: isolated server configuration, credentials and directories; verifies
  temporary execution, page navigation, and cleanup of kernels, nested directories and terminals after close;
  the proxy stays up while leaving the page is checked.
- `packages/addon-exec-jupyter/test/local.test.ts`: provider protocol, errors and cancellation, directive
  diagnostics, notebook validation, replay and cache against a real server; the Python also needs `nbformat`
  and `nbclient`. Run
  `pnpm exec vitest run --project integration packages/addon-exec-jupyter/test/local.test.ts --maxWorkers=1 --no-file-parallelism`.
- `e2e/exec-remote-local.spec.ts`: proxy, static web page and slides, `prompt` and `none`, token retry and
  browser session isolation; builds only its minimal document.
- `e2e/exec-remote-hub-local.spec.ts`: real JupyterHub user discovery and `/user/<name>/` routing. The
  Python also needs `jupyterhub`, and `PRESMIUM_TEST_JUPYTER_PROXY` points at the JavaScript entry of
  `configurable-http-proxy`, not a shell wrapper made by a package manager. The spec creates its own
  single-user Hub, proxy and user server.

Run the Playwright ones as `pnpm exec playwright test <file> --project chromium --no-deps --workers=1`.
These background processes keep a native thread budget of 1 and libuv 2. Passing with local processes does
not verify Docker images, GPUs, gVisor or Kubernetes deployments.

### Other targeted specs

- Executor release and recovery: `e2e/exec-lifecycle.spec.ts`, through real Workers and the host's
  `pagehide` and `pageshow` handlers: cancellation, queued tasks and rerun. Queued cancellation waits for both
  panels to finish, checks that no successful output appeared and no extra Worker exists; a momentary Worker
  count of zero is not enough, and synthetic lifecycle events do not prove the browser really entered and
  left the back/forward cache.
- WGSL computation and fallback only: `e2e/exec-webgpu-smoke.spec.ts`, without building the Python/jax-js
  bridge; SwiftShader passing does not verify a physical GPU.
- Offline publishing and high contrast: `e2e/publish-smoke.spec.ts` (core and publish only).
- Other components: filter the needed behavior by test name (`--grep` for Playwright, `-t` for Vitest); once a batch passes, do not rerun passed cases
  for a summary. The scope and limits of the last component validation are in
  `docs/reports/components-validation-2026-10-21.md`.
- `e2e/example.spec.ts` runs `pnpm demo:build` (two documents, about a minute) when the example is not
  built, so running it counts as the full example build under the cost rules below.

## Test cost

When the owner asks to run tests, follow the cost rules of `AGENTS.md`:

- Run only the targeted integration tests the change directly touches, plus related light structure checks;
  one worker by default; build only the documents and forms those cases need; stop when the targeted cases
  pass and do not widen the scope.
- Unless the user explicitly asks for full verification, do not run `pnpm test`, `pnpm verify`, the full
  `pnpm e2e`, or the complete example build and check (`pnpm demo:build`, `pnpm demo:check`), also not as a
  wrap-up or pre-merge step. When the user asks for everything, run `pnpm verify`.
- Examples of targeted runs:
  `pnpm exec vitest run --project integration packages/cli/test/ir.test.ts --maxWorkers=1 --no-file-parallelism`,
  `pnpm exec playwright test e2e/guide.spec.ts --project chromium --no-deps --workers=1`.
- `pnpm test` is the structure checks plus Vitest, one worker per file by default; every file starts real
  builds, services or browsers. The PDF export files are the `export` project, run after the other
  integration tests; alone, `pnpm exec vitest run --project export`.
- Report what actually ran, separating passed, skipped and not run, and keep the limits of unverified
  external conditions.
