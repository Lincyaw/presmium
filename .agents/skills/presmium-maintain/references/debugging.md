# Debugging the studio and measuring performance

The procedure and the evidence fields are in `docs/debugging.md`. This file keeps the order of work and the
rules for judging evidence.

## Start from the running service

Read the `pnpm studio` terminal first: stderr forwards the workspace service log, and startup prints the
persistent log path (default `~/.local/state/presmium/studio/presmium-studio-<hash>.log`, following
`XDG_STATE_HOME`). Align lines by `[preview N]` or `[job]` (`docs/studio.md` 11.2).

- A backend preview `ready` only means the address is ready; the browser may still be loading or in the
  handshake.
- dsh output is only in the log file and contains the login token; never copy tokens or cookies into a report.
- On `dsh web authentication required`, tell 401 (authentication) from 403 (Host/Origin) and use the
  current full launch URL (`docs/debugging.md` section 2).
- Root-window errors and failed workspace requests appear as `presmium.workbench.error` and
  `presmium.workbench.request` in the diagnostic snapshot. Do not add a global fetch wrapper.
- `EACCES` on `packages/dsh/build/dist/client.json` or `client.js` in a shared checkout is a permission
  problem of the generated client, not a browser cache issue.
- Requests stuck across tabs: compare with an independent same-cookie Node request; a browser
  request-created event does not prove the server received it (`docs/debugging.md` section 3). Never weaken
  the source actor guards to get past it.

## Collect evidence with `pnpm debug:studio`

1. Read the service log. Through an agent connected to the workspace, read
   `presmium://diagnostics?document=<document directory>` and call `get_runtime` and `get_outputs`
   (`presmium__` prefix in dsh). No window feedback means no browser was observed, not that the page is
   healthy.
2. Reproduce in an isolated copy: `pnpm debug:studio [<workspace>] --document <document directory>`
   (default: a fresh copy of `examples/animations`). It uses its own state, ports and Chromium and leaves
   the original alone.
3. Read `summary.json` in the output directory (default `.presmium/debug/<time>/`, `--output <new dir>`),
   then `events.jsonl` for the failing step. Do not stop at the exit code.
4. Narrow with `--views` (default `document,present,document`), `--timeout <ms>` (default 45000) and
   `--headed`; `pnpm debug:studio --help` lists the options.

Rules for judging:

- Every switch waits for real content: sections in Document, `.pm-slide` in Present, the lecture player
  when configured.
- When the problem only happens in the author's tab, check that tab's console and network too.
- Keep a baseline before the fix and rerun with the same document, views, timeout and load after it.
- After an upgrade, verify on the author's actual workspace copy (old `@lincyaw/slidev-addon-*` imports map
  to `@lincyaw/addon-*`). Never delete their copy, rewrite their sources or externalize modules to pass.

## Performance changes

Follow `docs/architecture.md` 1.1 (budgets, cache limits). The goal is 100 ms from an edit or switch to the
visible result.

- Record cold start, edit-to-compile and save-to-preview; separate CPU time from waiting. Compare before
  and after alternately under the same load; IR, numbering and source lines stay unchanged. Never drop
  validation to reach the goal.
- Measure with one worker and the default resource budget; report the real system load. A small document or
  the best round does not prove every case.
- Preview loading: Vite dependency pre-bundling finishes in one round (`DEBUG=vite:deps` shows no "new
  dependencies found").
- Consecutive saves cancel the old compile and publish only the latest result.
- Do not implement "compiled preview" as rebuilding the whole site per edit; check repeated loading and
  module transformation before proposing a framework switch.

`node scripts/bench-workbench-preview.mjs <output>.json --rounds 3` times first opens and returns in one
isolated workbench (`--example` for the example's documents). Keep address request, iframe load and compile
time apart. For cache work check that the iframe and `window` are reused, a return loads no new scripts,
paused documents stop, at most two frames stay loaded per panel, and packages without both `restartable`
declarations are destroyed instead (`docs/architecture.md` 1.1). When the owner asks for tests:
`e2e/preview-cache.spec.ts`, and `pnpm exec playwright test e2e/perf.spec.ts --no-deps`.
