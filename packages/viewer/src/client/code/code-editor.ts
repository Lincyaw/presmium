import { languageId } from '@lincyaw/kernel'
import type { Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { h } from '../element.ts'

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

export function CodeEditor({ lang = '', value, onChange, onRun }: { lang?: string, value: string, onChange?(value: string): void, onRun?(): void }) {
  const host = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onChange, onRun }); callbacks.current = { onChange, onRun }
  useEffect(() => {
    let editor: EditorView | undefined; let disposed = false
    void editorModules(lang).then(({ view, state, commands, language, style, extension, python }) => {
      if (disposed || !host.current) return
      editor = new view.EditorView({ parent: host.current, state: state.EditorState.create({ doc: value, extensions: [commands.history(), view.keymap.of([{ key: 'Mod-Enter', run: () => { callbacks.current.onRun?.(); return true } }, ...commands.defaultKeymap, ...commands.historyKeymap, commands.indentWithTab]), language.indentUnit.of(python ? '    ' : '  '), language.syntaxHighlighting(style), extension, view.EditorView.updateListener.of(update => { if (update.docChanged) callbacks.current.onChange?.(update.state.doc.toString()) })] }) })
      editor.focus()
    })
    return () => { disposed = true; editor?.destroy() }
  }, [lang])
  return h('div', { ref: host, className: 'pm-code-editor' })
}
