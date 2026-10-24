import { fileURLToPath } from 'node:url'

export default {
  id: 'fixture.viewer-app.runtime-files',
  version: '0.1.0',
  kernel: '^1.0.0',
  // A file its browser part would load while it runs: served below the document's site path, by the viewer's server.
  assets: () => [{ name: 'fixture-runtime', prefix: 'fixture/', types: { 'runtime.txt': 'text/plain; charset=utf-8' }, source: (file: string) => fileURLToPath(new URL(`./${file}`, import.meta.url)) }],
}
