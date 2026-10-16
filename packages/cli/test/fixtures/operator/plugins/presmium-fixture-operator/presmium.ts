// An operator plugin (operator: true): its Node service holds its operator setting, which its pass
// writes into the IR, so a build shows that both ran. Plain objects; no package needed.
const STAMP = { id: 'fixture.operator.stamp' }

export default {
  id: 'fixture.operator',
  version: '0.1.0',
  kernel: '^0.1.0',
  operator: true,
  services: (ctx: { settings: Record<string, unknown> }) => [[STAMP, { stamp: ctx.settings.stamp }]],
  passes: [{
    name: 'stamp',
    run(doc: { meta: Record<string, unknown> }, ctx: { service?(token: { id: string }): { stamp: unknown } | undefined }) {
      doc.meta.operatorStamp = ctx.service?.(STAMP)?.stamp ?? 'no service'
    },
  }],
}
