export default {
  id: 'fixture.viewer-app.vite-only',
  version: '0.1.0',
  kernel: '^1.0.0',
  // A Vite plugin that does more than give document modules: the dev servers run it, the viewer app cannot.
  vitePlugins: () => [{ name: 'fixture:vite-only', transformIndexHtml: (html: string) => html }],
}
