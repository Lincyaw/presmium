export default {
  id: 'fixture.workspaceVite',
  vitePlugins: ({ config }) => [{
    name: 'fixture-workspace-vite',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'vite-config.txt', source: config.message })
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0].endsWith('/fixture-vite')) response.end(config.message)
        else next()
      })
    },
  }],
}
