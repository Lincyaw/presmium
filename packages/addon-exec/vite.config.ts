import { prebundled, pyodideRuntime } from './src/node/vite.ts'

// Slidev merges addon Vite configs into the deck's, and the web form takes their plugins: this
// serves the Pyodide runtime with the deck, and has the dev servers pre-bundle the run panel's `diff`.
export default {
  plugins: [pyodideRuntime(), prebundled()],
}
