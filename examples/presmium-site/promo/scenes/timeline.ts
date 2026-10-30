// The film's clock, shared by the scenes (`film.ts`) and the score (`tools/score.mjs`): every cut, step, press and hit
// is a beat of the music, so the picture and the sound take their times from the same constants. Pure data, no DOM.
//
// Music: "Newer Wave" by Kevin MacLeod (incompetech.com), CC BY 4.0, the excerpt from 30.5678 s of the original.
// Its beat grid was measured (spectral-flux onsets, a line fitted through them: 99% of beats within 10 ms, no drift).

/** Where the excerpt starts in the original recording, and how long it is (seconds). */
export const MUSIC = {
  title: 'Newer Wave',
  author: 'Kevin MacLeod',
  url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Newer%20Wave.mp3',
  license: 'CC BY 4.0',
  from: 30.5678,
  length: 62,
} as const

/** 110 BPM, four beats a bar; beat 0 is at 0.0009 s of the excerpt. */
export const FIRST_BEAT = 0.0009
export const BEAT = 0.545441
export const beat = (n: number) => FIRST_BEAT + n * BEAT
export const bar = (n: number) => beat(4 * n)

/** The quiet build before the drop, the drop, and the bar line the film ends on. */
export const BUILD = beat(44)
export const DROP = beat(48)
export const END = bar(28)

/** Film times (seconds) of the moments the picture and the sound share. */
export const T = {
  // The question: the phone wakes on the bar, the student types, the question lands on the next bar.
  wake: bar(1),
  typing: beat(6),
  question: bar(2),
  // The studio, that night.
  studio: bar(6),
  commentClick: beat(29),
  saveClick: beat(35),
  assistantClick: beat(38),
  composerClick: beat(40),
  sendClick: beat(42),
  /** The AI's change arrives on the drop; the preview's steps 2, 3, 4 are pressed on the next three beats. */
  previewClicks: [beat(49), beat(50), beat(51)],
  pushToLesson: bar(13),
  /** The classroom is fully in (the crossfade ends here); its step starts here. */
  lessonIn: beat(54),
  /** The class opens on the slide the studio's preview ended on (learning rate 2.2, update 3); the clicker then plays
   * the 0.35 run, five presses. */
  firstSlide: 3,
  clicker: [beat(62), beat(63), beat(64), beat(65), beat(66)],
  aha: bar(17),
  pushToWeb: beat(74),
  webIn: bar(19),
  pushToVideo: beat(82),
  videoIn: bar(21),
  scrubGrab: bar(22),
  playOn: [beat(90), beat(91)],
  closeTap: bar(23),
  typingReply: beat(93),
  reply: beat(94),
  // The brand card: four words on four beats, then the mark on the bar.
  brand: bar(25),
  words: [beat(100), beat(101), beat(102), beat(103)],
  mark: bar(26),
  note: beat(105),
} as const

/** A carry's crossfade, at the matched framing (seconds). */
export const FADE = 0.22

/** The steps of the film in order, each with its section, the state its scene shows, and its span in film seconds. */
export const STEPS = [
  { id: 'question-step', section: 'film-question', state: 'show', from: 0, to: bar(4) },
  { id: 'board-step', section: 'film-board', state: 'show', from: bar(4), to: T.studio },
  { id: 'ask-step', section: 'film-ask', state: 'studio', from: T.studio, to: T.lessonIn },
  { id: 'lesson-step', section: 'film-ask', state: 'lesson', from: T.lessonIn, to: T.webIn },
  { id: 'website-step', section: 'film-ask', state: 'website', from: T.webIn, to: T.videoIn },
  { id: 'video-step', section: 'film-ask', state: 'video', from: T.videoIn, to: T.brand },
  { id: 'brand-step', section: 'film-brand', state: 'show', from: T.brand, to: END },
] as const

/** Steps are whole milliseconds; each boundary is rounded once, so the sum is the film and nothing drifts. */
export const ms = (seconds: number) => Math.round(seconds * 1000)
export const stepMs = (step: { from: number, to: number }) => ms(step.to) - ms(step.from)

/** The sounds of visible presses, one take per kind: a mouse click, the clicker's button, a fingertip on glass. */
export const SOUNDS = [
  ...[T.commentClick, T.saveClick, T.assistantClick, T.composerClick, T.sendClick, ...T.previewClicks].map(at => ({ at, kind: 'click' as const })),
  ...T.clicker.map(at => ({ at, kind: 'clicker' as const })),
  ...[T.scrubGrab, T.closeTap].map(at => ({ at, kind: 'tap' as const })),
].sort((a, b) => a.at - b.at)
