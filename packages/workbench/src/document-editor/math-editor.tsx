import { createElement, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PmButton, PmDialog, PmField, PmNotice, PmSkeleton, PmTextarea } from '../components.tsx'
import type { Locale } from '../messages.ts'
import { DOCUMENT_EDITOR_MESSAGES } from './messages.ts'

/** The parts of MathLive's `<math-field>` and its module that the formula dialog uses. */
interface MathField extends HTMLElement {
  value: string
  mathVirtualKeyboardPolicy: string
  setValue(value: string, options?: { silenceNotifications?: boolean }): void
}
interface MathLiveModule { MathfieldElement: { fontsDirectory: string | null, soundsDirectory: string | null } }
declare global { interface Window { mathVirtualKeyboard?: { container: HTMLElement | null } } }

let loading: Promise<void> | undefined
/**
 * MathLive is about a megabyte: it is not in the workbench's bundle. The host serves its module and fonts (`base`), and
 * the first visual edit loads them; a failed load is tried again next time.
 */
function loadMathLive(base: string): Promise<void> {
  const url = new URL('mathlive.min.mjs', base).href
  loading ??= (import(/* @vite-ignore */ url) as Promise<MathLiveModule>).then(module => {
    module.MathfieldElement.fontsDirectory = new URL('fonts/', base).href
    module.MathfieldElement.soundsDirectory = null
  }, error => { loading = undefined; throw error })
  return loading
}

/** Edit Formula: MathLive's visual input and the LaTeX it writes, kept the same; OK writes the LaTeX into the formula. */
export function MathEditorDialog({ base, initial, locale, onClose, onConfirm, onCloseAutoFocus }: { base: string, initial: string, locale: Locale, onClose(): void, onConfirm(latex: string): void, onCloseAutoFocus?(event: Event): void }) {
  const t = DOCUMENT_EDITOR_MESSAGES[locale]
  // React 18 sets a custom element's attributes as written, so the field below takes `class`, not `className`.
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [latex, setLatex] = useState(initial)
  const value = useRef(initial)
  value.current = latex
  const field = useRef<MathField | null>(null)
  useEffect(() => {
    let active = true
    loadMathLive(base).then(() => { if (active) setState('ready') }, () => { if (active) setState('failed') })
    return () => { active = false }
  }, [base])
  useEffect(() => {
    const element = field.current
    if (state !== 'ready' || !element) return
    element.mathVirtualKeyboardPolicy = 'auto'
    element.value = value.current
    // The dialog is modal: MathLive's on-screen keyboard opens inside it, where the pointer still reaches.
    const keyboard = window.mathVirtualKeyboard, dialog = element.closest<HTMLElement>('[data-pm-dialog]')
    if (keyboard && dialog) keyboard.container = dialog
    const input = () => setLatex(element.value)
    element.addEventListener('input', input)
    element.focus()
    return () => { element.removeEventListener('input', input); if (keyboard?.container === dialog) keyboard.container = null }
  }, [state])
  return (
    <PmDialog open label={t.mathEditor} closeLabel={t.cancel} onClose={onClose} onCloseAutoFocus={onCloseAutoFocus}
      footer={<><PmButton onClick={onClose}>{t.cancel}</PmButton><PmButton variant="primary" onClick={() => onConfirm(latex)}>{t.ok}</PmButton></>}>
      <div className="pm-document-editor__math-editor">
        {state === 'loading' && <PmSkeleton shape="preview" label={t.mathEditorLoading} />}
        {state === 'failed' && <PmNotice tone="warn">{t.mathEditorUnavailable}</PmNotice>}
        {state === 'ready' && <PmField label={t.mathEditorField} group>
          {/* React 18 sets a custom element's attributes as written: `class`, not `className`. */}
          {createElement('math-field', { ref: field, class: 'pm-document-editor__math-field', 'aria-label': t.mathEditorField })}
        </PmField>}
        <PmTextarea label={t.mathEditorSource} value={latex} spellCheck={false} autoGrow className="pm-document-editor__math-source" onChange={event => {
          setLatex(event.target.value)
          field.current?.setValue(event.target.value, { silenceNotifications: true })
        }} />
      </div>
    </PmDialog>
  )
}

/**
 * "Edit Visually" in an open formula popup, beside BlockNote's OK: it is placed in the popup's button row, which
 * BlockNote renders, so it shows and hides with the popup.
 */
export function MathVisualButton({ anchor, open, locale, onClick }: { anchor: HTMLElement | null, open: boolean, locale: Locale, onClick(): void }) {
  const row = open ? anchor?.closest('.bn-preview-with-source-popup')?.querySelector<HTMLElement>('.bn-code-block-source-popup-ok-button-wrapper') : undefined
  if (!row) return null
  return createPortal(<PmButton small variant="text" className="pm-document-editor__math-visual" onMouseDown={event => event.preventDefault()} onClick={event => { event.stopPropagation(); onClick() }}>{DOCUMENT_EDITOR_MESSAGES[locale].mathVisual}</PmButton>, row)
}
