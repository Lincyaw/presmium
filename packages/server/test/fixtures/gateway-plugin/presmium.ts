// A gateway contribution (packages/server/test/gateway.test.ts): its routes show the grant of the
// caller's token, whether the gateway's credential is there (never its value), and the operator's
// settings and directory. Plain objects, so the fixture needs no package to compile.
interface GatewayContext { settings: Record<string, unknown>, operatorDir: string, secret(name: string): string | undefined }

const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })

export default {
  id: 'fixture.gateway',
  version: '0.1.0',
  kernel: '^0.1.0',
  gateway: (ctx: GatewayContext) => ({
    routes: {
      grant: { handle: (_: Request, r: { grant: unknown }) => json({ grant: r.grant, upstream: Boolean(ctx.secret('TEST_UPSTREAM_KEY')), settings: ctx.settings, operatorDir: ctx.operatorDir }) },
      service: { service: true, handle: () => json({ ok: true }) },
    },
  }),
}
