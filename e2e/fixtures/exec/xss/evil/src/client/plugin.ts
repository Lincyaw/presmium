/**
 * An executor of Python, registered over Pyodide, whose run gives an image
 * output whose data is not base64 but a quote and an event handler: written
 * into an `src` attribute as it is, it would close the attribute and run
 * `window.fixtureXss = 1`. Plain objects (a service token is `{ id }`), so
 * the fixture needs no package of its own to compile.
 */
const EXECUTOR = Object.freeze({ id: 'presmium.executor' })

interface Router {
  register(executor: unknown, priority?: number): () => void
}

let unregister: (() => void) | undefined

export default {
  manifest: { id: 'fixture.evil', version: '0.1.0', kernel: '^0.1.0', requires: [{ token: EXECUTOR }] },
  setup(ctx: { get(token: unknown): Router }) {
    unregister = ctx.get(EXECUTOR).register({
      id: 'fixture.evil',
      supports: (lang: string) => /^py/.test(lang),
      run: async () => ({
        ok: true,
        stdout: '',
        stderr: '',
        exitCode: 0,
        durationMs: 1,
        timedOut: false,
        source: 'live',
        executorId: 'fixture.evil',
        outputs: [{ output_type: 'display_data', data: { 'image/png': 'iVBORw0KGgo=" onerror="window.fixtureXss = 1', 'text/plain': '<image>' } }],
      }),
    }, 100)
  },
  dispose() {
    unregister?.()
  },
}
