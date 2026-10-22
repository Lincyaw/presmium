export { clickVisible, resolveClicks } from './clicks.ts'
export type { ClickRange, ClickSpec } from './clicks.ts'
export { applyUpdate, diffDocuments, sectionDiagnostics } from './live.ts'
export type { LiveUpdate } from './live.ts'
export { VIEWER_MESSAGES } from './messages.ts'
export type { Messages } from './messages.ts'
export { ORIGIN_MESSAGES, originParts, outputNotes } from './origin.ts'
export type { OriginBar, OriginMessages, OriginPart } from './origin.ts'
export {
  clampPosition,
  FINAL_STEP,
  itemVisible,
  keepPosition,
  nextPosition,
  prevPosition,
  stepAtLine,
} from './steps.ts'
export type { Position } from './steps.ts'
export { codeColumns, footnoteSections } from './text.ts'
