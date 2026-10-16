import { jaxRuntime } from './src/node/jax.ts'

// Slidev merges addon Vite configs into the deck's (the web form adds the plugins too): this publishes jax-js with the deck.
export default {
  plugins: [jaxRuntime()],
}
