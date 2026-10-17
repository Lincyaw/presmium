// A gateway contribution (packages/server/test/gateway.test.ts): its routes show the grant of the
// caller's token, whether the gateway's credential is there (never its value), and the operator's
// settings and directory; one redirects. Plain objects, so the fixture needs no package to compile.
interface GatewayContext { settings: Record<string, unknown>, operatorDir: string, secret(name: string): string | undefined }

const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })

export default {
  id: 'fixture.gateway',
  version: '0.1.0',
  kernel: '^0.1.0',
  gateway: (ctx: GatewayContext) => ({
    routes: {
      grant: { handle: (request: Request, r: { grant: unknown }) => json({ grant: r.grant, upstream: Boolean(ctx.secret('TEST_UPSTREAM_KEY')), settings: ctx.settings, operatorDir: ctx.operatorDir, cookie: request.headers.get('cookie'), member: request.headers.get('x-forwarded-email') }) },
      service: { service: true, handle: () => json({ ok: true }) },
      // A route that sends its caller elsewhere: a client of the gateway must not follow it with its token.
      moved: { handle: () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1:9/elsewhere' } }) },
    },
  }),
}
