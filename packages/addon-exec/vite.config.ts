import { pyodideRuntime } from './src/node/vite.ts'

// Slidev merges addon Vite configs into the deck's; this serves the Pyodide runtime with the deck.
export default {
  plugins: [pyodideRuntime()],
}
