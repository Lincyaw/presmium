// The print page that `slidev export` captures (P-50) says when it is ready. The export loads the page until its
// network is idle (`--wait-until networkidle`), waits for what it finds on the page at that moment (the slides still
// loading, Mermaid diagrams), then for `--wait` ms, and prints. On a busy machine the network goes quiet while the
// browser is still evaluating the page's modules, before the app has mounted: the export finds nothing to wait for
// and prints the page without its slides (blank pages, the links lost). And a request of the page can fail (Chromium
// fails the requests in flight with `net::ERR_NETWORK_CHANGED` when the host's network changes, as when a Docker
// container starts; Vite answers "Outdated Optimize Dep" after it bundles its dependencies again): the app then never
// starts and the export times out waiting for the page's body, or a slide shows its error and is printed so.
//
// So a script at the top of the page (../index.html, which Slidev adds to the page of every deck with this addon)
// keeps a request to `PRINT_HOLD` pending from the start, and the network busy, until ./root.ts says that the page
// shows every slide (`PRINT_READY`); the export's own `--timeout` bounds the wait. Only `slidev export`'s server
// leaves that request unanswered (`printPage`); elsewhere the answer tells the script that there is nothing to hold.
// A page whose modules or slides failed to load (`PRINT_FAILED`) is reloaded instead, a few times. The names are
// repeated in ../index.html. The module is loaded in Node (./vite-plugins.ts) and in the page (./root.ts).

/** The request the print page keeps pending until it is ready, under the server's base. */
export const PRINT_HOLD = '@presmium/print-pending'

/** Dispatched on `window` once the print page shows every slide. */
export const PRINT_READY = 'presmium:print-ready'

/** Dispatched on `window` as a `CustomEvent` whose detail says which slides did not load. */
export const PRINT_FAILED = 'presmium:print-failed'

/** What of Vite's dev server the plugin uses. */
interface Server {
  middlewares: { use: (route: string, handle: () => void) => void }
}

/** The Vite plugin of `slidev export`'s server: the request it leaves pending. */
export function printPage() {
  let base = '/'
  return {
    name: 'presmium:print-page',
    configResolved(config: { base: string }) {
      base = config.base
    },
    configureServer(server: Server) {
      // Never answered: the page aborts the request when it is ready, or leaves with it.
      server.middlewares.use(`${base}${PRINT_HOLD}`, () => {})
    },
  }
}
