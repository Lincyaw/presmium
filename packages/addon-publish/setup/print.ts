export const PRINT_HOLD = '@presmium/print-pending'

export const PRINT_READY = 'presmium:print-ready'

export const PRINT_FAILED = 'presmium:print-failed'

interface Server {
  middlewares: { use: (route: string, handle: () => void) => void }
}

export function printPage() {
  let base = '/'
  return {
    name: 'presmium:print-page',
    configResolved(config: { base: string }) {
      base = config.base
    },
    configureServer(server: Server) {
      server.middlewares.use(`${base}${PRINT_HOLD}`, () => {})
    },
  }
}
