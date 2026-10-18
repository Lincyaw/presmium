// A plugin whose Node entry adds a Vite plugin (`vitePlugins`): in a build of the site it writes a
// file with the plugin's configuration, so the test sees that the site's Vite ran it with that.
interface Context { deckDir: string, workspaceRoot: string, config: Record<string, unknown> }
interface Emitter { emitFile(file: { type: 'asset', fileName: string, source: string }): void }

export default {
  id: 'fixture.site',
  version: '0.1.0',
  kernel: '^1.0.0',
  vitePlugins: ({ config }: Context) => [{
    name: 'fixture-site',
    apply: 'build',
    generateBundle(this: Emitter) {
      this.emitFile({ type: 'asset', fileName: 'fixture-vite.txt', source: String(config.message) })
    },
  }],
}
