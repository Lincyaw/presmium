export { clickVisible, resolveClicks } from './clicks.ts'
export type { ClickRange, ClickSpec } from './clicks.ts'
export { applyUpdate, diffDocuments, sectionDiagnostics } from './live.ts'
export type { LiveUpdate } from './live.ts'
export {
  blockState,
  blockVisible,
  clampPosition,
  FINAL_STEP,
  itemVisible,
  narrationAt,
  nextPosition,
  prevPosition,
  stepAtLine,
} from './steps.ts'
export type { Position } from './steps.ts'
export { blockText, mdastText } from './text.ts'
