/**
 * Browser entry of the stage (`@presmium/slidev-addon-stage/client`): the
 * viewer plugin of the web form and the audience screen state it shares.
 * The slides form loads the addon's setup files and layer instead.
 */
export { CLEAR_DRAWING, DRAWINGS_DIR, SCREEN_KEY, screenMode, STAGE_ID, toggleScreen } from '../domain/index.ts'
export type { ScreenMode } from '../domain/index.ts'
export { messages } from './messages.ts'
export { default as stageViewerPlugin } from './viewer.ts'
export type { StageViewerContext } from './viewer.ts'
