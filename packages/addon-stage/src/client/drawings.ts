import { createDrauu } from '@drauu/core'
import type { Drauu } from '@drauu/core'
import { useServer, useSharedState } from '@lincyaw/host'
import type { useViewer } from '@lincyaw/viewer'
import type { Component, Ref } from 'vue'
import { defineComponent, h, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { DRAWINGS_KEY, DRAWINGS_ROUTE, INKS, PEN_WIDTH, STAGE_ID } from '../domain/index.ts'
import type { PenMode } from '../domain/index.ts'
import { messages } from './locale.ts'

/**
 * Drawing on the slides (drauu): each slide's strokes are an SVG on its canvas, shared between the presenter's and the
 * audience's windows and the classroom (the host's shared state), and kept in the document's `.presmium/drawings/`
 * while a server serves the page. A slide shows its drawing in every view; it takes the pointer only while the pen is on.
 */

// Strokes are written to the server this long after the last one.
const SAVE_MS = 800

/** Whether this window draws, and with what. */
const pen = reactive({ on: false, ink: INKS[0] as string, mode: 'stylus' as PenMode })
/** The pads of the slides this window draws on, by section, with how each keeps its drawing. */
const pads = new Map<string, { pad: Drauu, commit(): void }>()

let alone: Ref<Record<string, string>> | undefined
let loaded = false

function drawingsState(): Ref<Record<string, string>> {
  try {
    return useSharedState<Record<string, string>>(DRAWINGS_KEY, {}, { scope: 'remote' })
  } catch {
    alone ??= ref({})
    return alone
  }
}

/** The drawings a server keeps, once per page, for the slides that have none yet. */
function loadSaved(drawings: Ref<Record<string, string>>): void {
  const server = useServer()
  if (loaded || !server.available) return
  loaded = true
  void server.fetch(STAGE_ID, DRAWINGS_ROUTE)
    .then(response => (response.ok ? response.json() as Promise<Record<string, string>> : {}))
    .then((saved: Record<string, string>) => {
      const missing = Object.entries(saved).filter(([section]) => drawings.value[section] === undefined)
      if (missing.length > 0) drawings.value = { ...Object.fromEntries(missing), ...drawings.value }
    })
    .catch(() => undefined)
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

function save(section: string, svg: string): void {
  const server = useServer()
  if (!server.available) return
  clearTimeout(timers.get(section))
  timers.set(section, setTimeout(() => {
    timers.delete(section)
    void server.fetch(STAGE_ID, `${DRAWINGS_ROUTE}/${encodeURIComponent(section)}`, { method: 'PUT', body: svg }).catch(() => undefined)
  }, SAVE_MS))
}

export function togglePen(): void {
  pen.on = !pen.on
}

/** A slide's drawing: drawn with the pen on the slide of an overlay view, shown as it is on the others (the print). */
export function drawingLayer(viewerOf: typeof useViewer): Component {
  return defineComponent({
    name: 'PmStageDrawing',
    props: { view: { type: String, required: true }, section: { type: String, required: true } },
    setup(props) {
      const viewer = viewerOf()
      const drawings = drawingsState()
      loadSaved(drawings)
      const svg = shallowRef<SVGSVGElement>()
      const drawn = () => drawings.value[props.section] ?? ''
      let pad: Drauu | undefined
      const commit = () => {
        if (!pad) return
        const value = pad.dump()
        if (value === drawn()) return
        drawings.value = { ...drawings.value, [props.section]: value }
        save(props.section, value)
      }
      onMounted(() => {
        // The presenter's next slide is shown inert: it is not drawn on.
        if (props.view === 'print' || !svg.value || svg.value.closest('[inert]')) return
        pad = createDrauu({ el: svg.value, brush: { mode: pen.mode, color: pen.ink, size: PEN_WIDTH } })
        pad.load(drawn())
        pad.on('committed', commit)
        pads.set(props.section, { pad, commit })
      })
      watch(drawn, (value) => {
        if (pad && value !== pad.dump()) pad.load(value)
      })
      watch(() => [pen.ink, pen.mode] as const, ([ink, mode]) => {
        if (!pad) return
        pad.brush = { ...pad.brush, color: ink }
        pad.mode = mode
      })
      onBeforeUnmount(() => {
        if (pads.get(props.section)?.pad === pad) pads.delete(props.section)
        pad?.unmount()
      })
      return () => h('svg', {
        'ref': svg,
        'class': 'pm-stage-drawing',
        'aria-hidden': 'true',
        'style': {
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: pen.on && props.section === viewer.position.value.section ? 'auto' : 'none',
          cursor: pen.on ? 'crosshair' : undefined,
          touchAction: pen.on ? 'none' : undefined,
        },
        // The printed slide shows the drawing as it is; a pad draws its own.
        ...props.view === 'print' ? { innerHTML: drawn() } : {},
      })
    },
  })
}

/** The pen's controls in the bar of an overlay view: the pen, and while it is on, its inks, the eraser, undo and clear. */
export function penControls(viewerOf: typeof useViewer): Component {
  return defineComponent({
    name: 'PmStagePen',
    setup() {
      const button = (label: string, onClick: () => void, extra: Record<string, unknown> = {}, children?: unknown) =>
        h('button', { 'type': 'button', 'class': 'pm-present__button', 'aria-label': label, onClick, ...extra }, (children ?? label) as never)
      const viewer = viewerOf()
      const current = () => pads.get(viewer.position.value.section)
      return () => {
        const t = messages().pen
        if (!pen.on) return button(t.draw, togglePen, { 'aria-pressed': 'false' })
        return [
          button(t.done, togglePen, { 'aria-pressed': 'true' }),
          ...INKS.map((ink, i) => button(t.ink(i + 1), () => {
            pen.ink = ink
            pen.mode = 'stylus'
          }, {
            'aria-pressed': String(pen.mode === 'stylus' && pen.ink === ink),
            'style': { display: 'inline-flex', alignItems: 'center' },
          }, h('span', { style: { display: 'block', width: 'var(--pm-size-icon)', height: 'var(--pm-size-icon)', borderRadius: 'var(--pm-radius-pill)', background: ink } }))),
          button(t.eraser, () => pen.mode = 'eraseLine', { 'aria-pressed': String(pen.mode === 'eraseLine') }),
          button(t.undo, () => {
            const drawn = current()
            if (drawn?.pad.undo()) drawn.commit()
          }),
          button(t.clear, () => {
            const drawn = current()
            drawn?.pad.clear()
            drawn?.commit()
          }),
        ]
      }
    },
  })
}
