import { useMessages } from '@lincyaw/host'
import { slideChapters, slideShape } from '@lincyaw/kernel'
import type { IRSection, SlideShape } from '@lincyaw/kernel'
import type { PropType } from 'vue'
import { computed, defineComponent, h, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import { SECTION_CONTEXT } from '../section-context.ts'
import { useViewer } from '../viewer-state.ts'
import { layers, visuals } from './overlay.ts'

/**
 * A slide: one section at one step on a canvas of a fixed size (980 wide and 16:9 unless the document's slides say
 * otherwise), drawn in the Book layout — the chapter above the title, the section's visual blocks, a footer with the
 * deck's title, the steps done and the page — and scaled as a whole to the box it is shown in, as a projector shows it.
 */

const MESSAGES = {
  'zh-CN': { steps: (at: number, of: number) => `第 ${at} 步，共 ${of} 步` },
  'en': { steps: (at: number, of: number) => `Step ${at} of ${of}` },
}

const LAYOUTS = new Set(['default', 'cover', 'center', 'full'])

/** A section's options for its slide (`{hints} slides:`): its layout, extra classes, and the zoom of its content. */
function slideOptions(section: IRSection, cover: boolean): { layout: string, className?: string, zoom?: number } {
  const hints = section.hints.slides ?? {}
  const layout = typeof hints.layout === 'string' && LAYOUTS.has(hints.layout) ? hints.layout : cover ? 'cover' : 'default'
  const zoom = Number(hints.zoom)
  return { layout, ...typeof hints.class === 'string' ? { className: hints.class } : {}, ...Number.isFinite(zoom) && zoom > 0 ? { zoom } : {} }
}

/** The document's slides: the canvas, and each section's chapter. */
export function useSlides() {
  const viewer = useViewer()
  const shape = computed(() => slideShape(viewer.doc.value))
  const chapters = computed(() => slideChapters(viewer.doc.value))
  return { viewer, shape, chapters }
}

/** Scales its content, drawn at the canvas's size, to the box it is in, centered; or to `scale` when given. */
export const SlideFit = defineComponent({
  name: 'PmSlideFit',
  props: {
    shape: { type: Object as PropType<SlideShape>, required: true },
    scale: Number,
  },
  setup(props, { slots }) {
    const box = shallowRef<HTMLElement>()
    const size = ref<{ width: number, height: number }>()
    let observer: ResizeObserver | undefined
    onMounted(() => {
      observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry!.contentRect
        size.value = { width, height }
      })
      if (box.value) observer.observe(box.value)
    })
    onBeforeUnmount(() => observer?.disconnect())
    return () => {
      const { width, height } = props.shape
      const scale = props.scale ?? (size.value ? Math.min(size.value.width / width, size.value.height / height) : 1)
      const left = size.value && props.scale === undefined ? (size.value.width - width * scale) / 2 : 0
      const top = size.value && props.scale === undefined ? (size.value.height - height * scale) / 2 : 0
      return h('div', { ref: box, class: 'pm-slide-fit' }, h('div', {
        class: 'pm-slide-fit__canvas',
        style: { width: `${width}px`, height: `${height}px`, transform: `translate(${left}px, ${top}px) scale(${scale})` },
      }, slots.default?.()))
    }
  },
})

/** The part of a slide that holds its title and blocks: scaled down when they are more than the canvas holds. */
const SlideBody = defineComponent({
  name: 'PmSlideBody',
  props: { zoom: Number },
  setup(props, { slots }) {
    const frame = shallowRef<HTMLElement>()
    const content = shallowRef<HTMLElement>()
    const fitted = ref(1)
    const fit = () => {
      const [outer, inner] = [frame.value, content.value]
      if (!outer || !inner) return
      const next = Math.min(1, outer.clientHeight / Math.max(1, inner.scrollHeight), outer.clientWidth / Math.max(1, inner.scrollWidth))
      if (Math.abs(next - fitted.value) > 0.005) fitted.value = next
    }
    let observer: ResizeObserver | undefined
    onMounted(() => {
      observer = new ResizeObserver(() => requestAnimationFrame(fit))
      if (frame.value) observer.observe(frame.value)
      if (content.value) observer.observe(content.value)
    })
    onBeforeUnmount(() => observer?.disconnect())
    return () => h('div', { ref: frame, class: 'pm-slide__body' }, h('div', {
      ref: content,
      class: 'pm-slide__content',
      style: { ...props.zoom ? { zoom: props.zoom } : {}, ...fitted.value < 1 ? { transform: `scale(${fitted.value})` } : {} },
    }, slots.default?.()))
  },
})

/** One slide at one step. Its components see it as their section, at that step, in `view`. */
export const SlideFace = defineComponent({
  name: 'PmSlideFace',
  props: {
    section: { type: Object as PropType<IRSection>, required: true },
    step: { type: Number, required: true },
    /** The view the slide is part of, as its components see it (`present`, `presenter`, `print`). */
    view: { type: String, default: 'present' },
  },
  setup(props) {
    const { viewer, chapters } = useSlides()
    const t = useMessages(MESSAGES)
    provide(SECTION_CONTEXT, { section: computed(() => props.section), step: computed(() => props.step), view: computed(() => props.view) })
    return () => {
      const { section, step } = props
      const { sections } = viewer.doc.value
      const cover = section.index === 1 && sections.length > 1
      const options = slideOptions(section, cover)
      const chapter = options.layout === 'cover' ? undefined : chapters.value.get(section.id)
      const steps = section.steps
      const done = Math.min(step, steps)
      return h('div', {
        'class': ['pm-slide', `pm-slide--${options.layout}`, options.className],
        'data-section': section.id,
        'data-slide': section.index,
        'data-step': step,
      }, [
        chapter ? h('p', { class: 'pm-slide__chapter' }, chapter) : null,
        h(SlideBody, { key: section.id, zoom: options.zoom }, () => [
          h(options.layout === 'cover' ? 'h1' : 'h2', { class: 'pm-slide__title' }, section.title),
          ...visuals(section, step),
        ]),
        options.layout === 'full' ? null : h('footer', { class: 'pm-slide__footer' }, [
          options.layout === 'cover' ? null : h('span', { class: 'pm-slide__deck' }, viewer.doc.value.meta.title),
          steps > 0
            ? h('span', { 'class': 'pm-slide__steps', 'role': 'img', 'aria-label': t.value.steps(done, steps), 'style': { '--pm-slide-steps': steps } }, Array.from({ length: steps }, (_, i) => h('span', { 'key': i, 'data-done': i < done ? '' : undefined })))
            : null,
          h('span', { class: 'pm-slide__page' }, `${section.index} / ${sections.length}`),
        ]),
        h('div', { class: 'pm-slide__layers' }, layers(props.view, 'slide', { section: section.id, step })),
      ])
    }
  },
})

/**
 * Every slide one after the other at the canvas's size, for printing (the exports): at its last step, or each of its
 * steps with `steps`. The page marks itself ready (`html[data-presmium-printed]`) once its fonts and the slides' images
 * have loaded.
 */
export const SlidesPrint = defineComponent({
  name: 'PmSlidesPrint',
  props: {
    steps: Boolean,
    /** The slides to print, by number from 1; all by default. */
    slides: Array as PropType<readonly number[]>,
  },
  setup(props) {
    const { viewer, shape } = useSlides()
    const ready = ref(false)
    onMounted(async () => {
      await document.fonts.ready
      await Promise.all([...document.images].map(image => (image.complete ? undefined : new Promise(done => image.addEventListener('load', done, { once: true })))))
      ready.value = true
    })
    watch(ready, on => document.documentElement.toggleAttribute('data-presmium-printed', on))
    return () => {
      const { width, height } = shape.value
      const chosen = props.slides && new Set(props.slides)
      const sections = viewer.doc.value.sections.filter(s => !chosen || chosen.has(s.index))
      const pages = sections.flatMap(section => (props.steps ? Array.from({ length: section.steps + 1 }, (_, step) => ({ section, step })) : [{ section, step: section.steps }]))
      return h('div', { class: 'pm-slides-print', style: { '--pm-slide-width': `${width}px`, '--pm-slide-height': `${height}px` } }, pages.map(({ section, step }) => h('div', {
        key: `${section.id}@${step}`,
        class: 'pm-slides-print__page',
        style: { width: `${width}px`, height: `${height}px` },
      }, h(SlideFace, { section, step, view: 'print' }))))
    }
  },
})
