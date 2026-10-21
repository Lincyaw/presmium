// Deliberately no restartable declaration: successful setup alone cannot promise safe reuse.
const plugin = {
  manifest: { id: 'fixture.preview-cache.legacy', version: '0.1.0', kernel: '^1.0.0' },
  setup() {
    document.documentElement.dataset.previewCacheLegacyPlugin = 'started'
  },
}

export default plugin
