/**
 * `@presmium/studio`: `presmium studio`, Presmium's workbench on DeepSeek
 * Harness in one command (docs/design-dsh.md section 11; experimental, 0.x).
 */
export { main } from './cli.ts'
export type { MainOptions } from './cli.ts'
export { DEFAULT_PORT, PROFILE, presmiumBin, startStudio, studioHome } from './studio.ts'
export type { Studio, StudioOptions } from './studio.ts'
export { modelEnv } from './model.ts'
export type { ModelEnv } from './model.ts'
