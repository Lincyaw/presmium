import { useAppearance, usePrefersReducedMotion } from '@lincyaw/host'
import { ShikiMagicMove } from '@shikijs/magic-move/vue'
import '@shikijs/magic-move/style.css'
import type { Element, ElementContent, Root } from 'hast'
import { toHtml } from 'hast-util-to-html'
import type { PropType } from 'vue'
import { computed, defineComponent, h, onMounted, shallowRef, watch } from 'vue'
import { codeColumns } from '../../domain/index.ts'
import { highlighterFor, SHIKI_THEMES } from './highlight.ts'

type Loaded = Awaited<ReturnType<typeof highlighterFor>>

function useHighlighter(lang: () => string) {
  const shiki = shallowRef<Loaded>()
  const load = async () => {
    const wanted = lang()
    const loaded = await highlighterFor(wanted).catch(() => undefined)
    if (wanted === lang()) shiki.value = loaded
  }
  onMounted(load)
  watch(lang, load)
  return shiki
}

function lineElements(tree: Root): Element[] {
  const pre = tree.children.find((node): node is Element => node.type === 'element')
  const code = pre?.children.find((node): node is Element => node.type === 'element' && node.tagName === 'code')
  return (code?.children ?? []).filter((node: ElementContent): node is Element => node.type === 'element')
}

export const CodeView = defineComponent({
  name: 'PmCodeView',
  props: {
    lang: { type: String, default: '' },
    value: { type: String, required: true },
    highlight: { type: Array as PropType<number[]>, default: undefined },
  },
  setup(props) {
    const shiki = useHighlighter(() => props.lang)
    const code = computed(() => props.value.replace(/\n$/, ''))
    const lines = computed(() => new Set(props.highlight ?? []))
    const tree = computed(() => shiki.value && shiki.value.highlighter.codeToHast(code.value, { lang: shiki.value.lang, themes: SHIKI_THEMES, defaultColor: false }))
    const html = computed(() => {
      if (!tree.value) return undefined
      const marked = lines.value
      lineElements(tree.value).forEach((line, i) => {
        line.properties.class = marked.has(i + 1) ? 'line highlighted' : 'line'
      })
      return toHtml(tree.value)
    })
    const columns = computed(() => codeColumns(code.value))
    return () => {
      const attrs = {
        'class': ['pm-code', { 'pm-code--highlight': lines.value.size > 0 }],
        'style': { '--pm-code-columns': columns.value },
        'data-lang': props.lang || undefined,
      }
      if (html.value) return h('div', { ...attrs, key: 'shiki', innerHTML: html.value })
      const rows = code.value.split('\n').flatMap((text, i) => [h('span', { class: ['line', { highlighted: lines.value.has(i + 1) }] }, text), '\n'])
      return h('div', { ...attrs, key: 'plain' }, [h('pre', { class: 'shiki' }, [h('code', rows.slice(0, -1))])])
    }
  },
})

/** One version of a code block with versions, animated from the previous one unless the reader prefers reduced motion. */
export const VariantView = defineComponent({
  name: 'PmCodeVariant',
  props: {
    lang: { type: String, default: '' },
    value: { type: String, required: true },
  },
  setup(props) {
    const shiki = useHighlighter(() => props.lang)
    const reduced = usePrefersReducedMotion()
    const { dark } = useAppearance()
    const code = computed(() => props.value.replace(/\n$/, ''))
    return () => {
      const loaded = shiki.value
      if (!loaded || reduced.value) return h(CodeView, { lang: props.lang, value: props.value })
      return h('div', { 'class': 'pm-code pm-code--magic-move', 'style': { '--pm-code-columns': codeColumns(code.value) }, 'data-lang': props.lang || undefined }, [
        h(ShikiMagicMove, { highlighter: loaded.highlighter, lang: loaded.lang, theme: dark.value ? SHIKI_THEMES.dark : SHIKI_THEMES.light, code: code.value, options: { duration: 500 } }),
      ])
    }
  },
})
