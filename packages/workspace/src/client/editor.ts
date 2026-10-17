/**
 * The source editor (P-124): CodeMirror 6, loaded with the source pane only.
 * MyST is Markdown with its headmatter in YAML, and directives, their
 * options, labels and roles marked as the design's keys; a YAML file is
 * YAML. The compilation's problems are marked on their lines (the lint
 * gutter); a block picked in the preview marks its lines. Ctrl+S (⌘ S)
 * saves. Each open file keeps its own state (its undo history, its cursor),
 * shown one at a time. Colours are the design's tokens, so light and dark
 * follow the page.
 */
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { yaml, yamlFrontmatter } from '@codemirror/lang-yaml'
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { lintGutter, setDiagnostics } from '@codemirror/lint'
import type { Diagnostic } from '@codemirror/lint'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { EditorSelection, EditorState, StateEffect, StateField } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { Decoration, drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, MatchDecorator, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { tags } from '@lezer/highlight'

export interface EditorOptions {
  /** The accessible name of the text. */
  label: string
  save(): void
  /** A file's text changed in the editor. */
  changed(path: string, text: string): void
  /** The cursor is on this line of the file shown. */
  moved(line: number): void
}

/** A problem of the compilation on a line of a file. */
export interface Problem {
  line: number
  severity: 'error' | 'warning' | 'info'
  message: string
}

export interface SourceEditor {
  /** Shows a file: its state if it has one, else `text`. */
  show(path: string, text: string): void
  text(path: string): string | undefined
  /** Replaces a file's text: an edit to undo, or (`fresh`) a text loaded anew. */
  replace(path: string, text: string, fresh: boolean): void
  /** Moves the cursor to a line of the file shown and scrolls there; `mark` marks the lines up to `endLine`. */
  reveal(line: number, endLine?: number, mark?: boolean): void
  problems(path: string, problems: Problem[]): void
  forget(path: string): void
  focus(): void
  destroy(): void
}

/** MyST's own marks: a directive's fence, an option, a label, a role. */
const MYST = new MatchDecorator({
  regexp: /^(?:`{3,}|:{3,})\{[\w.:-]+\}.*$|^:[\w-]+:(?=\s|$)|^\([^)\s]+\)=\s*$|\{[\w.:-]+\}`[^`]*`/g,
  decoration: match => Decoration.mark({ class: match[0].startsWith('(') ? 'pm-cm-myst-label' : 'pm-cm-myst' }),
})
const mystMarks = ViewPlugin.fromClass(class {
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

/**
 * The design's editor (docs/design/edit.dc.html): the code colour, the mono
 * face, line numbers in the muted colour (the reference's lighter one does
 * not reach WCAG AA), the picked lines as a selected row with the accent at
 * their left.
 */
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

/** The lines a block picked in the preview takes. */
const pick = StateEffect.define<{ from: number, to: number } | null>()
const picked = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, transaction) {
    marks = marks.map(transaction.changes)
    for (const effect of transaction.effects) {
      if (!effect.is(pick)) continue
      if (!effect.value) return Decoration.none
      const { doc } = transaction.state
      const lines = []
      for (let n = effect.value.from; n <= effect.value.to && n <= doc.lines; n++) lines.push(Decoration.line({ class: 'pm-cm-picked' }).range(doc.line(n).from))
      return Decoration.set(lines)
    }
    return marks
  },
  provide: field => EditorView.decorations.from(field),
})

function language(path: string): Extension {
  if (/\.(?:md|markdown)$/i.test(path)) return [yamlFrontmatter({ content: markdown() }), mystMarks]
  if (/\.ya?ml$/i.test(path)) return yaml()
  return []
}

export function createEditor(parent: HTMLElement, options: EditorOptions): SourceEditor {
  const states = new Map<string, EditorState>()
  const problems = new Map<string, Problem[]>()
  let current: string | undefined
  const listener = EditorView.updateListener.of((update) => {
    if (!current) return
    if (update.docChanged) options.changed(current, update.state.doc.toString())
    if (update.docChanged || update.selectionSet) options.moved(update.state.doc.lineAt(update.state.selection.main.head).number)
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
    picked,
    EditorView.lineWrapping,
    syntaxHighlighting(HIGHLIGHT),
    THEME,
    language(path),
    keymap.of([
      { key: 'Mod-s', preventDefault: true, run: () => {
        options.save()
        return true
      } },
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
    ]),
    EditorView.contentAttributes.of({ 'aria-label': options.label }),
    listener,
  ]
  const view = new EditorView({ parent, state: EditorState.create({ doc: '', extensions: [THEME, EditorState.readOnly.of(true)] }) })

  const diagnose = () => {
    if (!current) return
    const { doc } = view.state
    const diagnostics: Diagnostic[] = (problems.get(current) ?? []).filter(problem => problem.line >= 1 && problem.line <= doc.lines).map((problem) => {
      const line = doc.line(problem.line)
      return { from: line.from, to: line.to, severity: problem.severity, message: problem.message }
    })
    view.dispatch(setDiagnostics(view.state, diagnostics))
  }

  return {
    show(path, text) {
      if (current === path) return
      if (current) states.set(current, view.state)
      current = path
      view.setState(states.get(path) ?? EditorState.create({ doc: text, extensions: extensions(path) }))
      diagnose()
      options.moved(view.state.doc.lineAt(view.state.selection.main.head).number)
    },
    text(path) {
      return (path === current ? view.state : states.get(path))?.doc.toString()
    },
    replace(path, text, fresh) {
      if (path !== current) {
        // A file not shown starts again from the text, with a history of its own.
        states.set(path, EditorState.create({ doc: text, extensions: extensions(path) }))
        return
      }
      if (fresh) {
        const head = Math.min(view.state.selection.main.head, text.length)
        view.setState(EditorState.create({ doc: text, selection: EditorSelection.cursor(head), extensions: extensions(path) }))
        diagnose()
        return
      }
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
    },
    reveal(line, endLine, mark) {
      const { doc } = view.state
      const first = Math.min(Math.max(line, 1), doc.lines)
      const last = Math.min(Math.max(endLine ?? first, first), doc.lines)
      const position = doc.line(first).from
      view.dispatch({
        selection: { anchor: position },
        effects: [EditorView.scrollIntoView(position, { y: 'center' }), pick.of(mark ? { from: first, to: last } : null)],
      })
    },
    problems(path, list) {
      problems.set(path, list)
      if (path === current) diagnose()
    },
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
