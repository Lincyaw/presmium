# Testing in the repository

General helpers (`@lincyaw/cli/testing`) and what to check in a browser are in
`presmium-develop/references/testing.md`. The strategy is `docs/architecture.md` section 7; the dsh
upgrade gate is `docs/studio.md` section 12.

Write no new tests and run none routinely (`AGENTS.md`). Run existing tests only when the owner asks: the
targeted cases the change touches, one worker, only the documents and forms they need. Never run
`pnpm test`, `pnpm verify`, the full `pnpm e2e`, `pnpm demo:build` or `pnpm demo:check` unless full
verification is requested, also not as a wrap-up. Tests use the real CLI, builds, services, browsers and
pinned dsh, without host mocks.

## Pick the test by where it can fail

| Change | Start from |
|---|---|
| Directive, steps, diagnostics, execution cache | `packages/cli/test/ir.test.ts`, `packages/addon-exec/test/compile.test.ts` |
| Component display, keyboard, stepping back | `e2e/guide.spec.ts` |
| Preview after a save | `e2e/viewer.spec.ts`, `e2e/workbench.spec.ts` |
| Student build, translation, published files | `packages/cli/test/audience.test.ts`, `e2e/site.spec.ts` |
| Server routes, approvals, MCP | `packages/server/test/`, `packages/mcp/test/` |
| Package loading, install paths | `packages/cli/test/consumer.test.ts`, `e2e/consumer.spec.ts` |
| dsh integration | `packages/dsh/test/` and the upgrade gate |
| Preview protocol | `e2e/preview-protocol.spec.ts` |

Package tests are `packages/<pkg>/test/*.test.ts` (Vitest). The `mcp` and `server` tests start the CLI
executable directly to avoid a `cli → server → mcp` cycle.

Examples:
`pnpm exec vitest run --project integration packages/cli/test/ir.test.ts --maxWorkers=1 --no-file-parallelism`,
`pnpm exec playwright test e2e/guide.spec.ts --project chromium --no-deps --workers=1`. PDF export cases are
the `export` project: `pnpm exec vitest run --project export`. Filter by name with `--grep` (Playwright) or
`-t` (Vitest); do not rerun passed cases. `e2e/example.spec.ts` builds the full example when it is missing.

## End-to-end fixtures

A fixture document goes into `e2e/fixtures/<group>/`, its spec into `e2e/<group>.spec.ts`. `useFixture`
from `e2e/fixtures/deck.ts` builds and serves it once per group (`deck().web`, `.slides`, `.url`, `.dir`,
`.doc`, `.slide(id)`); options `to`, `audience`, `edit(dir)`, `with`, `link`, `bases` are typed in that
file. Contrast uses `lowContrast` from `e2e/fixtures/contrast.ts`.

## Processes and external conditions

- A spec uses only servers it started, with its own directories and ports, and stops them by PID. Never
  `pkill -f` or `killall`.
- Parallel checkouts set `PRESMIUM_E2E_SLIDES_PORT`, `PRESMIUM_E2E_WEB_PORT` and
  `PRESMIUM_E2E_STUDIO_PORT_OFFSET` (`e2e/urls.ts`).
- `pnpm e2e` runs Chromium fully and smoke cases in `PRESMIUM_E2E_BROWSERS` (default `firefox,webkit`)
  when installed.
- Missing Docker, GPU or credentials: skip with the reason; a skip is not a pass. Reuse existing helpers:
  `packages/addon-exec-jupyter/test/helpers.ts`, the fake speech engine in
  `packages/addon-speech/test/helpers.ts`, the classroom helper in `e2e/fixtures/plugins/decks.ts`,
  `packages/dsh/test/harness.ts` (own `DSH_HOME` and `HOME`, scripted model from `@lincyaw/dsh/testing`).
- Local Jupyter without Docker: set `PRESMIUM_TEST_JUPYTER_PYTHON` (and `PRESMIUM_TEST_JUPYTER_PROXY` for
  the Hub spec) and run `e2e/exec-remote-*.spec.ts` and `packages/addon-exec-jupyter/test/local.test.ts`
  one at a time. Passing locally does not verify Docker, GPUs or Kubernetes.

Report what ran, separating passed, skipped and not run, with the unverified external conditions.
