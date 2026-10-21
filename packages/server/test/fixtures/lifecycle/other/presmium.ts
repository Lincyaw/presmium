import plugin from '../plugin/presmium.ts'

export default {
  ...plugin,
  server(ctx: Parameters<typeof plugin.server>[0]) {
    return {
      ...plugin.server(ctx),
      routes: { value: { handle: () => Response.json({ implementation: 'second', value: ctx.config.value }) } },
    }
  },
}
