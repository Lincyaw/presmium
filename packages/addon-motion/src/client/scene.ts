import type * as AnimeModule from 'animejs'
import type { gsap as Gsap } from 'gsap'
import type * as MotionModule from 'motion'
import type * as ReactModule from 'react'
import type * as RemotionModule from 'remotion'
import type * as ThreeModule from 'three'

/** What a scene gets to draw itself. */
export interface SceneContext {
  /** The element the scene draws in; the scene owns its children. */
  root: HTMLElement
  /** The length of each step of the scene (ms), from `:durations:`. */
  durations: readonly number[]
  /** Where step `k` starts on the scene's timeline (ms). */
  at(step: number): number
  /** The length of the timeline (ms). */
  total: number
  /** The size of `root` when the scene is created (CSS pixels). */
  width: number
  height: number
  /** A color of the design system as the page shows it now: `color('accent')` is `--pm-color-accent`. */
  color(name: string): string
}

/** A scene drawn at a place on its timeline. Its look is a function of that place only. */
export interface Scene {
  /** Shows the scene at `ms` on its timeline. */
  seek(ms: number): void
  /** `root` changed size (the scene is shown again at its place afterwards). */
  resize?(width: number, height: number): void
  dispose?(): void
}

export interface SceneDefinition {
  engine: string
  create(ctx: SceneContext): Promise<Scene>
}

type Made = Scene | ((ms: number) => void)

function scene(made: Made): Scene {
  return typeof made === 'function' ? { seek: made } : made
}

/** A scene of its own code: `create` draws in `ctx.root` and returns the function of the time (or a `Scene`). */
export function defineScene(create: (ctx: SceneContext) => Made | Promise<Made>): SceneDefinition {
  return { engine: 'custom', create: async ctx => scene(await create(ctx)) }
}

type GsapAnimation = ReturnType<typeof Gsap.timeline> | ReturnType<typeof Gsap.to>

/**
 * A GSAP timeline (or tween), built in a `gsap.context` scoped to `ctx.root`, so selectors find the
 * scene's elements and disposing reverts them. Times are seconds, as in GSAP: `ctx.at(k) / 1000`.
 */
export function gsapScene(build: (ctx: SceneContext & { gsap: typeof Gsap }) => GsapAnimation): SceneDefinition {
  return {
    engine: 'gsap',
    async create(ctx) {
      const { gsap } = await import('gsap')
      let animation: GsapAnimation | undefined
      const context = gsap.context(() => {
        animation = build({ ...ctx, gsap })
      }, ctx.root)
      animation?.pause()
      return {
        seek: ms => animation?.totalTime(ms / 1000, true),
        dispose: () => context.revert(),
      }
    },
  }
}

type AnimeAnimation = ReturnType<typeof AnimeModule.createTimeline> | ReturnType<typeof AnimeModule.animate>

/** An Anime.js timeline (or animation), made in a scope rooted at `ctx.root`. Times are milliseconds. */
export function animeScene(build: (ctx: SceneContext & { anime: typeof AnimeModule }) => AnimeAnimation): SceneDefinition {
  return {
    engine: 'anime',
    async create(ctx) {
      const anime = await import('animejs')
      const scope = anime.createScope({ root: ctx.root })
      const animation = scope.execute(() => build({ ...ctx, anime }))
      animation.pause()
      return {
        seek: ms => void animation.seek(ms, true),
        dispose: () => scope.revert(),
      }
    },
  }
}

type MotionControls = ReturnType<typeof MotionModule.animate>

/** A Motion sequence, to type the segments a scene builds. */
export type MotionSequence = MotionModule.AnimationSequence

/** Motion animations (`animate`, a sequence, or several); Motion counts seconds, so the scene sets `time` to `ms / 1000`. */
export function motionScene(build: (ctx: SceneContext & { motion: typeof MotionModule }) => MotionControls | MotionControls[]): SceneDefinition {
  return {
    engine: 'motion',
    async create(ctx) {
      const motion = await import('motion')
      const controls = [build({ ...ctx, motion })].flat()
      for (const control of controls) control.pause()
      return {
        seek(ms) {
          for (const control of controls) control.time = ms / 1000
        },
        dispose() {
          for (const control of controls) control.cancel()
        },
      }
    },
  }
}

export interface ThreeView {
  /** Draws the scene at `ms` on the timeline (`renderer.render(scene, camera)`). */
  render(ms: number): void
  resize?(width: number, height: number): void
  dispose?(): void
}

/**
 * A Three.js scene: the adapter makes the WebGL renderer in `ctx.root` and keeps it the size of
 * `root`; `build` adds the scene and returns how to draw it at a time.
 */
export function threeScene(build: (ctx: SceneContext & { THREE: typeof ThreeModule, renderer: ThreeModule.WebGLRenderer }) => ThreeView | ThreeView['render']): SceneDefinition {
  return {
    engine: 'three',
    async create(ctx) {
      const THREE = await import('three')
      // The drawing buffer is kept so a screenshot of a frame (the lecture's video) shows it.
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
      renderer.setPixelRatio(window.devicePixelRatio)
      renderer.setSize(ctx.width, ctx.height, false)
      Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' })
      ctx.root.append(renderer.domElement)
      const made = build({ ...ctx, THREE, renderer })
      const view: ThreeView = typeof made === 'function' ? { render: made } : made
      return {
        seek: ms => view.render(ms),
        resize(width, height) {
          renderer.setSize(width, height, false)
          view.resize?.(width, height)
        },
        dispose() {
          view.dispose?.()
          renderer.dispose()
          renderer.forceContextLoss()
          renderer.domElement.remove()
        },
      }
    },
  }
}

export interface RemotionComposition {
  component: ReactModule.ComponentType<Record<string, unknown>>
  fps: number
  width: number
  height: number
  /** Default: the scene's timeline at `fps`. */
  durationInFrames?: number
  inputProps?: Record<string, unknown>
}

/**
 * A Remotion composition, drawn frame by frame with the player's `Thumbnail`: the scene's place on
 * its timeline picks the frame. `build` gets React and Remotion to write the component with
 * `React.createElement` (scene files are not JSX: the slides form would compile JSX for Vue).
 */
export function remotionScene(build: (ctx: SceneContext & { React: typeof ReactModule, remotion: typeof RemotionModule }) => RemotionComposition | Promise<RemotionComposition>): SceneDefinition {
  return {
    engine: 'remotion',
    async create(ctx) {
      const [React, { flushSync }, { createRoot }, remotion, { Thumbnail }] = await Promise.all([
        import('react'),
        import('react-dom'),
        import('react-dom/client'),
        import('remotion'),
        import('@remotion/player'),
      ])
      const composition = await build({ ...ctx, React, remotion })
      const frames = composition.durationInFrames ?? Math.max(1, Math.ceil(ctx.total * composition.fps / 1000))
      const root = createRoot(ctx.root)
      return {
        seek(ms) {
          const frame = Math.min(frames - 1, Math.max(0, Math.floor(ms * composition.fps / 1000)))
          flushSync(() => root.render(React.createElement(Thumbnail, {
            component: composition.component,
            compositionWidth: composition.width,
            compositionHeight: composition.height,
            durationInFrames: frames,
            fps: composition.fps,
            frameToDisplay: frame,
            inputProps: composition.inputProps ?? {},
            noSuspense: true,
            style: { width: '100%', height: '100%' },
          })))
        },
        dispose: () => root.unmount(),
      }
    },
  }
}
