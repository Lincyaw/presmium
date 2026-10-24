import { languageId } from '@lincyaw/kernel'
import type { Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { defineComponent, h, onBeforeUnmount, onMounted, shallowRef } from 'vue'

/**
 * A runnable code block's code, edited in place (CodeMirror 6) before it is run: loaded the first time a block is
 * edited, so that pages which are only read never load it. Mod-Enter runs the code; Escape then Tab leaves the editor.
 */

const LANGUAGES: Record<string, () => Promise<Extension>> = {
  python: () => import('@codemirror/lang-python').then(m => m.python()),
  javascript: () => import('@codemirror/lang-javascript').then(m => m.javascript()),
  typescript: () => import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true })),
  jsx: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true })),
  tsx: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true, typescript: true })),
}

const ALIASES: Record<string, string> = { py: 'python', js: 'javascript', mjs: 'javascript', ts: 'typescript', mts: 'typescript' }

async function editorModules(lang: string) {
  const id = languageId(lang)
  const grammar = LANGUAGES[ALIASES[id] ?? id]
  const [view, state, commands, language, highlight, extension] = await Promise.all([
    import('@codemirror/view'),
    import('@codemirror/state'),
    import('@codemirror/commands'),
    import('@codemirror/language'),
    import('@lezer/highlight'),
    grammar ? grammar() : Promise.resolve([]),
  ])
  const { tags } = highlight
  // The colours of the page's highlighted code, from the design tokens: light and dark alike.
  const style = language.HighlightStyle.define([
    { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.modifier], color: 'var(--pm-color-syntax-keyword)' },
    { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--pm-color-syntax-string)' },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.definition(tags.variableName), tags.className, tags.typeName], color: 'var(--pm-color-syntax-key)' },
    { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--pm-color-accent)' },
    { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--pm-color-gutter)', fontStyle: 'italic' },
  ])
  return { view, state, commands, language, style, extension, python: (ALIASES[id] ?? id) === 'python' }
}

export const CodeEditor = defineComponent({
  name: 'PmCodeEditor',
  props: {
    lang: { type: String, default: '' },
    value: { type: String, required: true },
  },
  emits: { change: (_value: string) => true, run: () => true },
  setup(props, { emit }) {
    const host = shallowRef<HTMLElement>()
    let editor: EditorView | undefined
    let disposed = false
    onMounted(async () => {
      const { view, state, commands, language, style, extension, python } = await editorModules(props.lang)
      if (disposed || !host.value) return
      editor = new view.EditorView({
        parent: host.value,
        state: state.EditorState.create({
          doc: props.value,
          extensions: [
            commands.history(),
            view.keymap.of([
              { key: 'Mod-Enter', run: () => (emit('run'), true) },
              ...commands.defaultKeymap,
              ...commands.historyKeymap,
              commands.indentWithTab,
            ]),
            language.indentUnit.of(python ? '    ' : '  '),
            language.syntaxHighlighting(style),
            extension,
            view.EditorView.updateListener.of((update) => {
              if (update.docChanged) emit('change', update.state.doc.toString())
            }),
          ],
        }),
      })
      editor.focus()
    })
    onBeforeUnmount(() => {
      disposed = true
      editor?.destroy()
    })
    return () => h('div', { ref: host, class: 'pm-code-editor' })
  },
})
