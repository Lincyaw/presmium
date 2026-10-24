export { dropChangedSections, trimToDeck } from './audience.ts'
export { lectureGap, lectureVoice, lexiconOf } from './config.ts'
export type { LectureVoice } from './config.ts'
export { blockDrift, blockKey, blockOf, eventDrift, irHash, playedBlocks, referencedBlocks, sectionHashes, trackBlock, unchanged } from './drift.ts'
export type { BlockDrift, EventDrift, Grade } from './drift.ts'
export { bindEvents, editUtterance, resynthesizedTrack, transcribedTrack } from './editing.ts'
export type { SegmentTranscript } from './editing.ts'
export { clockText, fileStem } from './format.ts'
export { LECTURE_MESSAGES } from './messages.ts'
export type { LectureMessages } from './messages.ts'
export { CUE_COMMANDS, lectureRole, parseCue, spokenText } from './narration.ts'
export type { CueCommand, CueMark, SpokenText } from './narration.ts'
export { lecturePlan, plannedUtterances, sectionHints } from './plan.ts'
export type { LecturePlan, PlannedCue, PlannedParagraph, PlannedPiece, PlannedSection, PlanProblem, ScriptFileSections } from './plan.ts'
export { recordedTrack, sectionSpan, simplifyPath, spliceSection } from './recording.ts'
export type { PathPoint, Recording, TrackHead } from './recording.ts'
export { scriptTrack } from './script-track.ts'
export type { Clip, CutAnimation, ScriptHead } from './script-track.ts'
export { anchorOf, lastIndexAt, stepStops, textPieces, timedEvents, trackChapters, utteranceAt, wordTime } from './timing.ts'
export type { StepStop, TextPiece, TimedEvent, TrackChapter } from './timing.ts'
export {
  audioSegments,
  CLIP_FILE,
  defaultTrack,
  CLIPS_DIR,
  eventLine,
  formatTrack,
  LECTURE_ID,
  LECTURE_RENDERER,
  LECTURES_DIR,
  parseTrack,
  PLAYER_RENDERER,
  SCRIPT_TRACK,
  sortEvents,
  spokenDuration,
  TRACK_ID,
  TRACK_VERSION,
  trackDuration,
  utteranceLine,
} from './track.ts'
export type { AudioSegment, LectureTrack, MediaSegment, TrackBlock, Translation, Utterance, VideoSegment, Voice, Word } from './track.ts'
export { isStale, translationDigest, translationItems } from './translation.ts'
export type { TranslationItem } from './translation.ts'
export { captionLanguages, captionsVtt, captionText, chaptersVtt, eventsVtt, vttTime } from './vtt.ts'
export type { Captions } from './vtt.ts'
export { charOffset, isWide, locate, realign, trackWords, wordIndexAt } from './words.ts'
export { cueFor, narrationDraft, narrationSource } from './writeback.ts'
export type { DraftSection, DraftStep, NarrationDraft, NarrationSource } from './writeback.ts'
