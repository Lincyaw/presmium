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

export function CodeEditor({ lang = '', label, value, onChange, onRun, onSave, onError, shouldFocus }: { lang?: string, label?: string, value: string, onChange?(value: string): void, onRun?(): void, onSave?(): void, onError?(error: unknown): void, shouldFocus?(): boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const active = useRef<EditorView>()
  const replacing = useRef(false)
  const currentValue = useRef(value); currentValue.current = value
  const callbacks = useRef({ onChange, onRun, onSave, onError, shouldFocus }); callbacks.current = { onChange, onRun, onSave, onError, shouldFocus }
  useEffect(() => {
    let editor: EditorView | undefined; let disposed = false
    void editorModules(lang).then(({ view, state, commands, language, style, extension, python }) => {
      if (disposed || !host.current) return
      editor = new view.EditorView({ parent: host.current, state: state.EditorState.create({ doc: currentValue.current, extensions: [commands.history(), view.EditorView.contentAttributes.of(label ? { 'aria-label': label, 'aria-multiline': 'true', role: 'textbox' } : {}), view.keymap.of([{ key: 'Mod-Enter', run: () => { if (!callbacks.current.onRun) return false; callbacks.current.onRun(); return true } }, { key: 'Mod-s', run: () => { if (!callbacks.current.onSave) return false; callbacks.current.onSave(); return true } }, ...commands.defaultKeymap, ...commands.historyKeymap, commands.indentWithTab]), language.indentUnit.of(python ? '    ' : '  '), language.syntaxHighlighting(style), extension, view.EditorView.updateListener.of(update => { if (update.docChanged && !replacing.current) callbacks.current.onChange?.(update.state.doc.toString()) })] }) })
      active.current = editor
      if (callbacks.current.shouldFocus?.() !== false) editor.focus()
    }).catch(error => {
      if (disposed) return
      console.error('[presmium] the code editor failed to initialize', error)
      callbacks.current.onError?.(error)
    })
    return () => { disposed = true; if (active.current === editor) active.current = undefined; editor?.destroy() }
  }, [lang, label])
  useEffect(() => {
    const editor = active.current
    if (!editor || editor.state.doc.toString() === value) return
    replacing.current = true
    try { editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } }) }
    finally { replacing.current = false }
  }, [value])
  return h('div', { ref: host, className: 'pm-code-editor' })
}
