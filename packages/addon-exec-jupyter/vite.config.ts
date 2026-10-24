import { jupyterWsShim } from './src/node/vite.ts'

// The viewer app's build: `@jupyterlab/services` imports `ws`, which gets the package's own shim.
export default { plugins: [jupyterWsShim()] }
