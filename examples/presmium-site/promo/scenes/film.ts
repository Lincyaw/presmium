import { defineScene, gsapScene } from '@lincyaw/addon-motion/scene'
import { frame, kit, ready, type Shot } from './film-kit.ts'
import { ask, brand, done, forms, lesson, website } from './film-product.ts'
import { board, question, reply, video } from './film-story.ts'

/** The film's shots in order; `parameters.shot` picks one. Each section of `lecture.json` shows one of them. */
const SHOTS: Record<string, Shot> = { question, board, ask, done, forms, lesson, website, video, reply, brand }

/**
 * A 60-second story: a student's question at night, a teacher who changes the lesson in Presmium by asking for an
 * animation, the lesson taught in class, read on the course website and sent as a video, and the student's answer.
 * Every frame is a function of the time: the shot's timeline is built once and sought.
 */
export default defineScene(async context => {
  const shot = SHOTS[context.parameters.shot as string]
  if (!shot) throw new Error(`unknown shot ${String(context.parameters.shot)}`)
  frame(context.root, shot.css, shot.stage, shot.over, shot.pointer)
  await ready(context.root)
  const scene = await gsapScene(({ gsap }) => {
    const tl = gsap.timeline({ paused: true })
    shot.play(kit(gsap, tl, context.root), gsap, tl, context.root)
    // The timeline runs to the end of the step, so the last frames hold instead of ending early.
    tl.set({}, {}, context.total / 1000)
    return tl
  }).create(context)
  return { seek: ms => scene.seek(ms), dispose() { scene.dispose?.(); context.root.replaceChildren() } }
})
