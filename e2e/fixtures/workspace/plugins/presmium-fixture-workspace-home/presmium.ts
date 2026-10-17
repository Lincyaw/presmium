// An operator plugin (`operator: true`, listed in settings.presmium.workspace.plugins): its route `where`
// answers with the document it serves, '' on the home page. Plain objects; no package needed.
interface RequestContext { document: string }

export default {
  id: 'fixture.home',
  version: '0.1.0',
  kernel: '^0.1.0',
  operator: true,
  server: () => ({
    routes: {
      where: {
        role: 'reader',
        handle: (_: Request, rc: RequestContext) => new Response(JSON.stringify({ document: rc.document }), { headers: { 'Content-Type': 'application/json' } }),
      },
    },
  }),
}
