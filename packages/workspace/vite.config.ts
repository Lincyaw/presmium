/**
 * The workspace's browser part in the site's dev servers (`presmium serve`,
 * the site's own plugins' Vite plugins, docs/architecture.md 5.11): the
 * source editor's dependencies (CodeMirror 6 and what it imports, node-diff3)
 * are ES modules served as they are, not optimized. Vite optimizes a
 * dependency it finds after it started (the editor loads with the source
 * pane) by reloading the page, which would leave edit mode. Plain object:
 * `vite` is the web renderer's dependency, not ours.
 */
const EDITOR_DEPENDENCIES = [
  '@codemirror/autocomplete',
  '@codemirror/commands',
  '@codemirror/lang-css',
  '@codemirror/lang-html',
  '@codemirror/lang-javascript',
  '@codemirror/lang-markdown',
  '@codemirror/lang-yaml',
  '@codemirror/language',
  '@codemirror/lint',
  '@codemirror/search',
  '@codemirror/state',
  '@codemirror/streamparser',
  '@codemirror/view',
  '@lezer/common',
  '@lezer/css',
  '@lezer/highlight',
  '@lezer/html',
  '@lezer/javascript',
  '@lezer/lr',
  '@lezer/markdown',
  '@lezer/yaml',
  '@marijn/find-cluster-break',
  'crelt',
  'node-diff3',
  'style-mod',
  'w3c-keyname',
]

export default {
  plugins: [{
    name: 'presmium:workspace-editor',
    config: () => ({ optimizeDeps: { exclude: EDITOR_DEPENDENCIES } }),
  }],
}
