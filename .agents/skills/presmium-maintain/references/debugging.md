# Debugging the studio and measuring performance

The full procedure, with the evidence files and their fields, is `docs/debugging.md`. This file keeps the
order of work and the rules for judging the evidence.

## Start from the running service

For slow switches or exports, look at the `pnpm studio` terminal first: stderr forwards the workspace
service's log live, and startup prints the path of the persistent log (by default
`~/.local/state/presmium/studio/presmium-studio-<hash>.log`, one per installation or checkout, following `XDG_STATE_HOME`). The log carries UTC times
and the process each line comes from (`docs/design-dsh.md` 11.2). Align document, phase, cache or fallback
and duration by the preview request number (`[preview N]`) or the job ID (`[job]`).

- A backend preview `ready` only means the address is ready; the browser may still be stuck loading
  resources or in the handshake. Do not claim the page works from it.
- dsh's output is only in the log file. It contains the login token in the launch address; never copy it
  into a report.
- For the `dsh web authentication required` page, distinguish authentication (401) from Host/Origin
  rejection (403). Use the current full launch URL with the original hostname and port; a restart changes
  the launch token, while existing cookies can survive through the persisted credentials. Follow
  `docs/debugging.md`, "打开时要求 dsh 认证", and record no token or cookie values.

The studio also collects root-window exceptions and its workspace client's failed requests. Look for
`presmium.workbench.error` and `presmium.workbench.request` in the existing diagnostic snapshot; their
`workbench:` instance is separate from preview frames. The notice remains local when the report cannot
reach the service, and Dismiss clears only that instance. Request context contains method, logical path,
document and status, without query parameters, payloads or credentials; an intentional Abort is not a
request failure. Do not install a global fetch wrapper to collect unrelated Harness traffic.

## Multiple tabs with pending requests

Normal Studio has no shell HMR EventSource: actual client rebuilds leave the editing page running, while workspace events use the scoped event WebSocket. Keep `client-hmr` disabled for Presmium. A later private profile patch can re-enable the framework mechanism, but root replacement has actually lost unconfirmed session-only comment material; it is not an accepted editing configuration. Diagnose with the real public builder, a changed private artifact, observed `rebuilt` frame, new code execution and actual navigation. An armed return-point storage value alone is not HMR evidence. The default-off and explicit-on contrast, scope limits and cleanup are in `docs/benchmarks/comment-draft-root-hmr-2026-10-28.md`; configuration and dependencies are in `docs/design-dsh.md` 2.3.

For a queued request, compare active streams, protocol and actual send/header timing with an independent same-cookie Node request. A browser request-created event alone does not prove the server received it. Preserve a release probe of the same request, rather than treating a new retry as success; never weaken the source actor guards. See `docs/benchmarks/studio-multitab-transport-2026-10-27.md`.

## Collect evidence with `pnpm debug:studio`

For a shared source checkout, an `EACCES` reading `packages/dsh/build/dist/client.json` or `client.js` means generated-client permissions, not a browser cache diagnosis. Source startup rebuilds unreadable or invalid metadata; generated client assets remain readable even with a private launcher umask. Verify the served bundle and the actual target DOM after restarting or reloading the workbench.

For a stalling or broken front end, in this order:

1. Read the current service log. Then, through an agent connected to the workspace (the studio's AI, or
   any MCP client of the workspace service), read the MCP resource
   `presmium://diagnostics?document=<document directory>` (the current diagnostics), call `get_runtime` (what
   the preview windows actually reported) and `get_outputs` (the build results); in dsh the tools are named
   `presmium__get_runtime` and so on. No window feedback only means no browser has been observed, not that
   the page is healthy. `get_diagnostics` reads the reported snapshot without compiling; `check_document` explicitly runs compilation and plugin checks. Neither replaces observing the browser.
2. Reproduce in an isolated copy, from the repository root: `pnpm debug:studio [<workspace>] --document
   <document directory>` (without a workspace it uses a fresh copy of `examples/gallery`). It copies
   the workspace and runs its own state directory, service ports and Chromium; the original files and running
   services are left alone. Before navigation it captures page and iframe exceptions, console warnings and
   errors, HTTP and network failures, slow requests, long tasks and the preview handshake, and puts the
   backend log on the same timeline. On a timeout it saves pending requests, frame state and screenshots.
3. Read `summary.json` in the output directory (default `.presmium/debug/<time>/`; `--output <new
   directory>` chooses another, an existing directory is not overwritten) first, then
   `events.jsonl` for the failing step. Do not stop at the exit code or at the backend address being ready.
4. Narrow with `--views` (the order of switches, default `document,present,document`; the old names
   `slides` and `video` mean `present`) and `--timeout <ms>` (each switch's wait, default 45000, 1000 to
   300000); `--headed` shows the window; `pnpm debug:studio --help` lists the options. Do not widen to full
   test suites.

Rules for judging:

- Every switch waits for the real content: sections in Document, the viewer's `.pm-slide` layout in
  Present, the lecture player when one is configured. Without runtime window feedback the front end is not
  known to be error-free.
- When the problem only happens in the author's original tab, also check that tab's console and network; a
  clean browser passing does not replace the original session.
- Keep a baseline before the fix; after the fix rerun with the same document, view order, wait budget and
  load.
- After an upgrade, verify on the workspace copy the author is actually using (including source imports of
  the old plugin names `@lincyaw/slidev-addon-*`, which the compiler and the document bundler map to
  `@lincyaw/addon-*`); a freshly copied example passing does not prove the old copy compatible. Do not delete
  the author's copy, rewrite their sources or externalize unresolved modules to get past an error.

## Comparing preview architectures

When comparing the compiled preview with a dev server, separate the one-time runtime build, the document
code build and the plain-text incremental update; do not implement "compiled" as rebuilding the whole site on
every edit. Before evaluating a framework switch or a rewrite, check whether the bottleneck is repeated
loading and module transformation. The historical baseline (before Slidev and VitePress were removed) is
`docs/benchmarks/preview-architecture-2026-10-24.md`; today the web page and the slides both use Presmium's
own prebuilt viewer.

## Performance changes

Follow `docs/architecture.md` 1.1, which also holds the resource budget environment variables, cache limits
and soft limits. The project's latency goal is 100 ms from an edit or a switch to the visible result; the
benchmarks in `docs/benchmarks/` measure against it and record where it is not yet met.

- Record cold start, edit-to-compile and save-to-preview latency; separate CPU time, real waiting time and the
  test budget. Compare before and after alternately under the same load, and check that IR, equation
  numbers, source line numbers and old snapshots are unchanged.
- Tests and benchmarks use one worker and the default resource budget (interactive processes the author
  waits for take threads by machine state, background processes take 1). Do not drop validation to reach
  100 ms.
- Preview loading: first check that Vite's dependency pre-bundling finishes in one round (`DEBUG=vite:deps`
  shows no "new dependencies found" or "reloading"); for plugin files loaded through virtual modules see
  `optimizeDeps.entries` in `presmium-develop/references/plugin.md`.
- Incremental compilation covers cross-block references, footnotes, fences, includes and plugin external
  dependencies; consecutive saves verify that the old task is cancelled and only the latest result is
  published.

### Workbench open and switch latency

`node scripts/bench-workbench-preview.mjs <output>.json --rounds 3` starts one isolated workbench and
Chromium, records two first opens and three returns, and times until the preview is ready and the first
section is visible. `--example` measures the example's two documents (with animations). It does not build the
full example or run test suites.

- Separate the time of the preview address request from the iframe load; record the system load; do not
  count compile time as page latency.
- Record the total automation time and the browser's real click-to-ready time, never mixed.
- For cache work also check: the same iframe and window are reused, a return loads zero new scripts, the
  document's components and control flow stop when paused, a hidden edit comes back as the latest content,
  the two-frame limit holds, and the destroy fallback works when a package or kernel plugin does not pass
  both `restartable` declarations (including viewer-only packages without a kernel plugin). The two-frame
  limit is the at most two loaded iframes each preview panel keeps; the two declarations are
  `presmium.preview.restartable: true` in the package's `package.json` and `PluginDefinition.restartable:
  true` on a kernel plugin (`docs/architecture.md` 1.1). When the owner asks for tests, the targeted one is
  `e2e/preview-cache.spec.ts`.
- Tests and scripts snapshot the isolated workbench client so parallel builds cannot change its served bytes; parallel sessions running targeted Playwright pass `--output <own directory>` to avoid
  colliding artifacts.
- Earlier measurements: `docs/benchmarks/workbench-preview-2026-10-21.md` (first investigation) and
  `docs/benchmarks/preview-cache-2026-10-21.md` (cache lifecycle, real-course measurements, remaining
  latency). Report the real system load; a small document or the best round does not show that every case
  reaches 100 ms.

When the owner asks for tests: the performance e2e cases run after the other Chromium cases; alone, run
`pnpm exec playwright test e2e/perf.spec.ts --no-deps`.
