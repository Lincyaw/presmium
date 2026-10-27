import type * as AnimeModule from 'animejs'
import type * as D3Module from 'd3'
import type { gsap as Gsap } from 'gsap'
import type * as MotionModule from 'motion'
import type * as ReactModule from 'react'
import type * as RemotionModule from 'remotion'
import type * as ThreeModule from 'three'

/** What a scene gets to draw itself. */
export interface SceneContext {
  /** Complete parameters and semantic state resolved for the authored Step ID. */
  parameters: Readonly<Record<string, unknown>>
  state?: string
  /** The element the scene draws in; the scene owns its children. */
  root: HTMLElement
  /** The length of each step of the scene (ms), from `:durations:`. */
  durations: readonly number[]
  /** Where step `k` starts on the scene's timeline (ms). */
  at(step: number): number
  /** The length of the timeline (ms). */
  total: number
  /** The layout size of `root` in CSS pixels, before any ancestor's presentation scaling. */
  width: number
  height: number
  /** A color of the design system as the page shows it now, as `rgb()` or `rgba()`: `color('accent')` is `--pm-color-accent`. */
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

/** GSAP's plugins that draw the same at the same time; ScrambleText (random each render) and the scroll and drag ones are left out. */
async function gsapPlugins(gsap: typeof Gsap) {
  // Each plugin registers itself with `window.gsap` when it loads. GSAP sets that global only when nothing holds the
  // name, and an element with the id `gsap` (a section labelled `(gsap)=`) does, so the plugins would find the element.
  const page = window as unknown as { gsap?: unknown }
  if (page.gsap !== gsap) page.gsap = gsap
  const [{ SplitText }, { TextPlugin }, { DrawSVGPlugin }, { MorphSVGPlugin }, { MotionPathPlugin }, { CustomEase }, { CustomBounce }, { CustomWiggle }, { Physics2DPlugin }, { PhysicsPropsPlugin }, { Flip }] = await Promise.all([
    import('gsap/SplitText'),
    import('gsap/TextPlugin'),
    import('gsap/DrawSVGPlugin'),
    import('gsap/MorphSVGPlugin'),
    import('gsap/MotionPathPlugin'),
    import('gsap/CustomEase'),
    import('gsap/CustomBounce'),
    import('gsap/CustomWiggle'),
    import('gsap/Physics2DPlugin'),
    import('gsap/PhysicsPropsPlugin'),
    import('gsap/Flip'),
  ])
  return { SplitText, TextPlugin, DrawSVGPlugin, MorphSVGPlugin, MotionPathPlugin, CustomEase, CustomBounce, CustomWiggle, Physics2DPlugin, PhysicsPropsPlugin, Flip }
}

export type GsapPlugins = Awaited<ReturnType<typeof gsapPlugins>>

/**
 * A GSAP timeline (or tween), built in a `gsap.context` scoped to `ctx.root`, so selectors find the
 * scene's elements and disposing reverts them. Times are seconds, as in GSAP: `ctx.at(k) / 1000`.
 * `plugins` are registered before `build`: tweens can use `drawSVG`, `morphSVG`, `motionPath`, `text`,
 * `physics2D`, `physicsProps`, and the scene can call `plugins.SplitText.create`, `plugins.CustomEase.create`.
 */
export function gsapScene(build: (ctx: SceneContext & { gsap: typeof Gsap, plugins: GsapPlugins }) => GsapAnimation): SceneDefinition {
  return {
    engine: 'gsap',
    async create(ctx) {
      const { gsap } = await import('gsap')
      const plugins = await gsapPlugins(gsap)
      // A tweened box on its own 3D layer is drawn a little differently from the same box at rest, so a frame would
      // depend on how it was reached; scenes keep 2D transforms.
      gsap.config({ force3D: false })
      gsap.registerPlugin(...Object.values(plugins))
      let animation: GsapAnimation | undefined
      const context = gsap.context(() => {
        animation = build({ ...ctx, gsap, plugins })
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
      // Until a tween has been reached once it shows the element's own value, not its from-value: going to the end and
      // back sets them all up, so a time looks the same whatever was shown before it.
      animation.seek(animation.duration, true)
      animation.seek(0, true)
      return {
        // From the start each time: going back past a later tween that gives its own from-value does not restore
        // the value before it, so a time is reached the same way whichever time was shown before.
        seek(ms) {
          animation.seek(0, true)
          animation.seek(ms, true)
        },
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
          // Only what the browser animates (opacity, background color, filter, clip-path) shows at once; transforms,
          // SVG, CSS variables and function segments wait for Motion's next frame, so it is drawn now.
          for (const step of ['update', 'preRender', 'render'] as const) motion.frameSteps[step].process(motion.frameData)
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

/** The three.js addons a scene can use: HTML labels, lines wider than a pixel, and geometries the core lacks. */
async function threeAddons() {
  const [{ CSS2DRenderer, CSS2DObject }, { Line2 }, { LineGeometry }, { LineMaterial }, { ParametricGeometry }, { RoundedBoxGeometry }, { ConvexGeometry }] = await Promise.all([
    import('three/addons/renderers/CSS2DRenderer.js'),
    import('three/addons/lines/Line2.js'),
    import('three/addons/lines/LineGeometry.js'),
    import('three/addons/lines/LineMaterial.js'),
    import('three/addons/geometries/ParametricGeometry.js'),
    import('three/addons/geometries/RoundedBoxGeometry.js'),
    import('three/addons/geometries/ConvexGeometry.js'),
  ])
  return { CSS2DRenderer, CSS2DObject, Line2, LineGeometry, LineMaterial, ParametricGeometry, RoundedBoxGeometry, ConvexGeometry }
}

export type ThreeAddons = Awaited<ReturnType<typeof threeAddons>>

/**
 * A Three.js scene: the adapter makes the WebGL renderer in `ctx.root` and keeps it the size of
 * `root`; `build` adds the scene and returns how to draw it at a time.
 */
export function threeScene(build: (ctx: SceneContext & { THREE: typeof ThreeModule, renderer: ThreeModule.WebGLRenderer, addons: ThreeAddons }) => ThreeView | ThreeView['render']): SceneDefinition {
  return {
    engine: 'three',
    async create(ctx) {
      const [THREE, addons] = await Promise.all([import('three'), threeAddons()])
      // The drawing buffer is kept so a screenshot of a frame (the lecture's video) shows it.
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
      renderer.setPixelRatio(window.devicePixelRatio)
      renderer.setSize(ctx.width, ctx.height, false)
      Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' })
      ctx.root.append(renderer.domElement)
      const made = build({ ...ctx, THREE, renderer, addons })
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

/**
 * A D3 scene: D3 turns the data into shapes (scales, axes, layouts, shape generators), and the scene draws them at
 * a time with D3's interpolators and eases. `build` returns the drawing function `(ms) => void` (or a `Scene`);
 * transitions run on D3's own timer, so they have no place here.
 */
export function d3Scene(build: (ctx: SceneContext & { d3: typeof D3Module }) => Made | Promise<Made>): SceneDefinition {
  return {
    engine: 'd3',
    async create(ctx) {
      const d3 = await import('d3')
      return scene(await build({ ...ctx, d3 }))
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
 * `React.createElement`.
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
