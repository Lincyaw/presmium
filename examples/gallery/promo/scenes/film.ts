import { defineScene, gsapScene } from '@lincyaw/addon-motion/scene'
import { type Chain, frame, frameChain, kit, playChain, ready, type Shot } from './film-kit.ts'
import { brand, lesson, studio, website } from './film-product.ts'
import { board, question, video } from './film-story.ts'
import { FADE, T } from './timeline.ts'

/**
 * From the studio to the student's reply, the film is one continuous scene: each beat carries into the next (the
 * camera pushes into the chart, the same chart in the next place takes over, the camera pulls out), so its steps
 * (studio, lesson, website, video) are states of one timeline. Times are film seconds less the section's start.
 */
const ORIGIN = T.studio
const local = (film: number) => film - ORIGIN
const ASK: Chain = {
  parts: [
    { ...studio, id: 'studio', start: 0, hero: '.pf-hero' },
    { ...lesson, id: 'lesson', start: local(T.lessonIn - FADE), hero: '.pf-hero' },
    { ...website, id: 'website', start: local(T.webIn - FADE), hero: '.pf-hero' },
    { ...video, id: 'video', start: local(T.videoIn - FADE), hero: '.pf-hero' },
  ],
  carries: [
    { from: 'studio', to: 'lesson', at: local(T.lessonIn), push: T.lessonIn - FADE - T.pushToLesson, fade: FADE, place: { x: 0.5, y: 0.46, w: 0.9 } },
    { from: 'lesson', to: 'website', at: local(T.webIn), push: T.webIn - FADE - T.pushToWeb, fade: FADE, place: { x: 0.5, y: 0.46, w: 0.9 } },
    { from: 'website', to: 'video', at: local(T.videoIn), push: T.videoIn - FADE - T.pushToVideo, fade: FADE, place: { x: 0.5, y: 0.46, w: 0.55 } },
  ],
}

/** The film's sections; `parameters.shot` picks one. Each section of `lecture.json` is a bare cut to the next. */
const SHOTS: Record<string, Shot | Chain> = { question, board, ask: ASK, brand }

/**
 * A 60-second story: a student's question at night, a teacher who changes the lesson in Presmium by asking for an
 * animation, the lesson taught in class, read on the course website and sent as a video, and the student's answer.
 * Every frame is a function of the time: the timeline is built once and sought.
 */
export default defineScene(async context => {
  const shot = SHOTS[context.parameters.shot as string]
  if (!shot) throw new Error(`unknown shot ${String(context.parameters.shot)}`)
  if ('parts' in shot) frameChain(context.root, shot)
  else frame(context.root, shot)
  await ready(context.root)
  const scene = await gsapScene(({ gsap }) => {
    const tl = gsap.timeline({ paused: true })
    if ('parts' in shot) playChain(gsap, tl, context.root, shot)
    else shot.play(kit(gsap, tl, context.root), gsap, tl, context.root)
    // The timeline runs to the end of the last step, so the last frames hold instead of ending early.
    tl.set({}, {}, context.total / 1000)
    return tl
  }).create(context)
  return { seek: ms => scene.seek(ms), dispose() { scene.dispose?.(); context.root.replaceChildren() } }
})
