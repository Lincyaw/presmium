import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { python, pythonLanguage } from '@codemirror/lang-python'
import { yaml, yamlFrontmatter } from '@codemirror/lang-yaml'
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { lintGutter, setDiagnostics } from '@codemirror/lint'
import type { Diagnostic } from '@codemirror/lint'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { Compartment, EditorSelection, EditorState, StateEffect, StateField } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { Decoration, drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, MatchDecorator, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { tags } from '@lezer/highlight'

export interface EditorOptions {
  label: string
  onSave(): void
  onChange(path: string, text: string): void
  onCursorLine(line: number): void
  onSelect?(selection: { startLine: number, endLine: number, text: string }): void
}

export interface Problem {
  line: number
  severity: 'error' | 'warning' | 'info'
  message: string
}

export interface SourceEditor {
  show(path: string, text: string): void
  describe(label: string, description: string): void
  text(path: string): string | undefined
  replace(path: string, text: string, fresh: boolean): void
  reveal(line: number, endLine?: number, highlight?: boolean): void
  setProblems(path: string, problems: Problem[]): void
  paths(): string[]
  forget(path: string): void
  focus(): void
  destroy(): void
}

const MYST = new MatchDecorator({
  regexp: /^(?:`{3,}|:{3,})\{[\w.:-]+\}.*$|^:[\w-]+:(?=\s|$)|^\([^)\s]+\)=\s*$|\{[\w.:-]+\}`[^`]*`/g,
  decoration: match => Decoration.mark({ class: match[0].startsWith('(') ? 'pm-cm-myst-label' : 'pm-cm-myst' }),
})
const mystHighlighting = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) {
    this.decorations = MYST.createDeco(view)
  }

  update(update: ViewUpdate) {
    this.decorations = MYST.updateDeco(update, this.decorations)
  }
}, { decorations: plugin => plugin.decorations })

const HIGHLIGHT = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--pm-color-accent)', fontWeight: '600' },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator, tags.comment, tags.punctuation], color: 'var(--pm-color-muted)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: [tags.link, tags.url], color: 'var(--pm-color-accent)' },
  { tag: tags.monospace, color: 'var(--pm-color-syntax-string)' },
  { tag: [tags.propertyName, tags.definition(tags.propertyName), tags.attributeName, tags.labelName], color: 'var(--pm-color-syntax-key)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--pm-color-syntax-string)' },
  { tag: [tags.keyword, tags.bool, tags.null, tags.number, tags.atom], color: 'var(--pm-color-syntax-keyword)' },
])

const THEME = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--pm-color-code)', color: 'var(--pm-color-ink)', fontSize: '0.84375rem' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--pm-font-mono)', lineHeight: '1.75' },
  '.cm-content': { caretColor: 'var(--pm-color-ink)', padding: '14px 0' },
  '.cm-line': { padding: '0 14px 0 6px' },
  '.cm-gutters': { backgroundColor: 'var(--pm-color-code)', color: 'var(--pm-color-muted)', border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 4px 0 12px', minWidth: '2.5em' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--pm-color-ink)' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--pm-color-selected) 55%, transparent)' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--pm-color-ink)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--pm-color-accent-soft)' },
  '.cm-line.pm-cm-picked': { backgroundColor: 'var(--pm-color-selected)', boxShadow: 'inset 2px 0 0 var(--pm-color-accent)' },
  '.pm-cm-myst': { color: 'var(--pm-color-syntax-key)' },
  '.pm-cm-myst-label': { color: 'var(--pm-color-muted)' },
  '.cm-lintRange-error, .cm-lintRange-warning, .cm-lintRange-info': { backgroundImage: 'none', textDecoration: 'underline wavy', textUnderlineOffset: '3px' },
  '.cm-lintRange-error': { textDecorationColor: 'var(--pm-color-danger)' },
  '.cm-lintRange-warning': { textDecorationColor: 'var(--pm-color-warn)' },
  '.cm-lintRange-info': { textDecorationColor: 'var(--pm-color-accent)' },
  '.cm-tooltip': { border: '1px solid var(--pm-color-line)', backgroundColor: 'var(--pm-color-surface)', color: 'var(--pm-color-ink)', borderRadius: 'var(--pm-radius-small)' },
  '.cm-panels': { backgroundColor: 'var(--pm-color-sunk)', color: 'var(--pm-color-ink)' },
  '.cm-searchMatch': { backgroundColor: 'var(--pm-color-warn-soft)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--pm-color-accent-soft)' },
})

const highlightLines = StateEffect.define<{ from: number, to: number } | null>()
const highlightedLines = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(highlighted, transaction) {
    highlighted = highlighted.map(transaction.changes)
    for (const effect of transaction.effects) {
      if (!effect.is(highlightLines)) continue
      if (!effect.value) return Decoration.none
      const { doc } = transaction.state
      const lines = []
      for (let n = effect.value.from; n <= effect.value.to && n <= doc.lines; n++) lines.push(Decoration.line({ class: 'pm-cm-picked' }).range(doc.line(n).from))
      return Decoration.set(lines)
    }
    return highlighted
  },
  provide: field => EditorView.decorations.from(field),
})

function language(path: string): Extension {
  if (/\.(?:md|markdown)$/i.test(path)) return [yamlFrontmatter({ content: markdown({ codeLanguages: info => /^(?:python|py)\b/i.test(info) ? pythonLanguage : null }) }), mystHighlighting]
  if (/\.(?:py|pyw|pyi)$/i.test(path)) return [python(), indentUnit.of('    ')]
  if (/\.ya?ml$/i.test(path)) return yaml()
  return []
}

export function createEditor(parent: HTMLElement, options: EditorOptions): SourceEditor {
  const states = new Map<string, EditorState>()
  const problems = new Map<string, Problem[]>()
  const accessibility = new Compartment()
  let attributes: Record<string, string> = { 'aria-label': options.label }
  let current: string | undefined
  const listener = EditorView.updateListener.of((update) => {
    if (!current) return
    if (update.docChanged) options.onChange(current, update.state.doc.toString())
    if (update.docChanged || update.selectionSet) options.onCursorLine(update.state.doc.lineAt(update.state.selection.main.head).number)
    const selection = update.state.selection.main
    if (update.view.hasFocus && update.selectionSet && !selection.empty) {
      options.onSelect?.({
        startLine: update.state.doc.lineAt(selection.from).number,
        endLine: update.state.doc.lineAt(Math.max(selection.from, selection.to - 1)).number,
        text: update.state.sliceDoc(selection.from, selection.to),
      })
    }
  })
  const extensions = (path: string): Extension => [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    history(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    highlightSelectionMatches(),
    lintGutter(),
    highlightedLines,
    EditorView.lineWrapping,
    syntaxHighlighting(HIGHLIGHT),
    THEME,
    language(path),
    keymap.of([
      { key: 'Mod-s', preventDefault: true, run: () => {
        options.onSave()
        return true
      } },
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
    ]),
    accessibility.of(EditorView.contentAttributes.of(attributes)),
    listener,
  ]
  const view = new EditorView({ parent, state: EditorState.create({ doc: '', extensions: [THEME, EditorState.readOnly.of(true)] }) })

  const showProblems = () => {
    if (!current) return
    const { doc } = view.state
    const diagnostics: Diagnostic[] = (problems.get(current) ?? []).filter(problem => problem.line >= 1 && problem.line <= doc.lines).map((problem) => {
      const line = doc.line(problem.line)
      return { from: line.from, to: line.to, severity: problem.severity, message: problem.message }
    })
    view.dispatch(setDiagnostics(view.state, diagnostics))
  }

  return {
    describe(label, description) {
      attributes = { 'aria-label': label, 'aria-description': description }
      if (current) view.dispatch({ effects: accessibility.reconfigure(EditorView.contentAttributes.of(attributes)) })
    },
    show(path, text) {
      if (current === path) return
      if (current) states.set(current, view.state)
      current = path
      view.setState(states.get(path) ?? EditorState.create({ doc: text, extensions: extensions(path) }))
      showProblems()
      options.onCursorLine(view.state.doc.lineAt(view.state.selection.main.head).number)
    },
    text(path) {
      return (path === current ? view.state : states.get(path))?.doc.toString()
    },
    replace(path, text, fresh) {
      if (path !== current) {
        states.set(path, EditorState.create({ doc: text, extensions: extensions(path) }))
        return
      }
      if (fresh) {
        const head = Math.min(view.state.selection.main.head, text.length)
        view.setState(EditorState.create({ doc: text, selection: EditorSelection.cursor(head), extensions: extensions(path) }))
        showProblems()
        return
      }
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
    },
    reveal(line, endLine, highlight) {
      const { doc } = view.state
      const first = Math.min(Math.max(line, 1), doc.lines)
      const last = Math.min(Math.max(endLine ?? first, first), doc.lines)
      const position = doc.line(first).from
      view.dispatch({
        selection: { anchor: position },
        effects: [EditorView.scrollIntoView(position, { y: 'center' }), highlightLines.of(highlight ? { from: first, to: last } : null)],
      })
    },
    setProblems(path, list) {
      problems.set(path, list)
      if (path === current) showProblems()
    },
    paths: () => [...new Set([...states.keys(), ...current ? [current] : []])],
    forget(path) {
      states.delete(path)
      problems.delete(path)
      if (path === current) {
        current = undefined
        view.setState(EditorState.create({ doc: '', extensions: [THEME, EditorState.readOnly.of(true)] }))
      }
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  }
}
