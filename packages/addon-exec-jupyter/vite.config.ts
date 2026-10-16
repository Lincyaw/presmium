import { servicesInBrowserBuilds } from './src/node/vite.ts'

// Slidev merges addon Vite configs into the deck's, and the web form takes their plugins: the
// Jupyter client keeps to its browser shim of `ws` in every bundle of the site (./src/node/vite.ts).
export default {
  plugins: [servicesInBrowserBuilds()],
}
