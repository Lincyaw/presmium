// In `slidev export`'s server, the page's first request for ./main.ts fails: the page cannot load its modules, as
// when Vite answers "Outdated Optimize Dep" (504) or Chromium fails the requests in flight because the host's
// network changed (`net::ERR_NETWORK_CHANGED`). (No import: the default export is the setup function.)

interface Request { url?: string }
interface Response { statusCode: number, end: () => void }

export default function setup(options: { mode: string }) {
  let failed = false
  return options.mode !== 'export'
    ? []
    : [{
        name: 'fixture:fail-a-request',
        configureServer(server: { middlewares: { use: (handle: (req: Request, res: Response, next: () => void) => void) => void } }) {
          server.middlewares.use((req, res, next) => {
            if (failed || !req.url?.includes('/slow-start/setup/main.ts')) return next()
            failed = true
            res.statusCode = 504
            res.end()
          })
        },
      }]
}
