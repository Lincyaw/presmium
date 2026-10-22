import { escapeHtml } from '@lincyaw/kernel'
import 'katex/dist/katex.min.css'
import { defineComponent, h, onMounted, ref, watch } from 'vue'

type Katex = typeof import('katex').default

let katex: Promise<Katex> | undefined

function loadKatex(): Promise<Katex> {
  if (import.meta.env.SSR) return new Promise(() => {})
  katex ??= import('katex').then(m => m.default)
  return katex
}

export const PmMath = defineComponent({
  name: 'PmMath',
  props: {
    tex: { type: String, required: true },
    display: Boolean,
    html: { type: String, default: undefined },
  },
  setup(props) {
    const rendered = ref<string>()
    const render = async () => {
      if (props.html) return
      const { renderToString } = await loadKatex()
      rendered.value = renderToString(props.tex, { displayMode: props.display, throwOnError: false })
    }
    onMounted(render)
    watch(() => [props.tex, props.display, props.html], render)
    return () => {
      const html = props.html ?? rendered.value
      return h(props.display ? 'div' : 'span', {
        'class': ['pm-math', props.display ? 'pm-math--display' : 'pm-math--inline'],
        'data-rendered': html ? '' : undefined,
        'innerHTML': html ?? escapeHtml(props.tex),
      })
    }
  },
})
