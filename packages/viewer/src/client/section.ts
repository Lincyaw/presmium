import { memo, useEffect, useRef, useState } from 'react'
import { useStore } from '@lincyaw/host'
import { isChapterTitle, narrationAt } from '@lincyaw/kernel'
import type { IRSection } from '@lincyaw/kernel'
import { FINAL_STEP, sectionDiagnostics } from '../domain/index.ts'
import { BlockView } from './block.ts'
import { contentMarks } from './content-marks.ts'
import { SECTION_CONTEXT } from './section-context.ts'
import { viewerMessages } from './viewer-messages.ts'
import { useViewer } from './viewer-state.ts'
import { SectionBlockEditor } from './editing/section-block-editor.tsx'
import { h } from './element.ts'
export type SectionLayout = 'document' | 'scrolly'
function SectionViewContent({ section, layout = 'document' }: { section: IRSection, layout?: SectionLayout }) {
  const viewer = useViewer(); const doc = useStore(viewer.doc); const view = useStore(viewer.pageView); const [scrolled, setScrolled] = useState(0); const root = useRef<HTMLElement>(null)
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting) && viewer.view.getSnapshot() === viewer.pageView.getSnapshot() && !viewer.restoring.getSnapshot()) { const current = viewer.position.getSnapshot(); if (current.section !== section.id) viewer.go({ section: section.id, step: 0 }) } }, { rootMargin: '-10% 0px -70% 0px' })
    if (root.current) observer.observe(root.current)
    return () => observer.disconnect()
  }, [section.id, viewer])
  useEffect(() => { if (layout !== 'scrolly') return; const update = () => { const markers = [...root.current?.querySelectorAll<HTMLElement>('.pm-step') ?? []]; const step = Math.max(0, markers.filter(el => el.getBoundingClientRect().top < window.innerHeight * .6).length - 1); setScrolled(step); if (viewer.view.getSnapshot() === view) viewer.go({ section: section.id, step }) }; window.addEventListener('scroll', update, true); return () => window.removeEventListener('scroll', update, true) }, [layout, section.id, view])
  const step = layout === 'scrolly' ? scrolled : FINAL_STEP
  const title = isChapterTitle(doc, section) ? 'h1' : 'h2'; const t = viewerMessages().section
  const blocks = section.blocks.filter(block => block.role === 'visual' || (block.only && !block.only.includes('lecture')) || Boolean(doc.config.renderers.lecture?.script))
  const findings = viewer.options.diagnostics ? sectionDiagnostics(section, doc.diagnostics) : []
  const body = layout === 'scrolly' ? [h('div', { className: 'pm-stage pm-board' }, blocks.filter(b => b.role === 'visual').map(block => h(BlockView, { key: block.id, block, section, step }))), h('div', { className: 'pm-track' }, Array.from({ length: section.steps + 1 }, (_, k) => h('div', { key: k, className: `pm-step${k === step ? ' pm-step--current' : ''}`, 'data-step': k }, narrationAt(section, k).map(block => h(BlockView, { key: block.id, block, section, step }))))) ] : h(SectionBlockEditor, { section }, h('div', { className: 'pm-section__body' }, blocks.map(block => h(BlockView, { key: block.id, block, section, step, expanded: true }))))
  return h(SECTION_CONTEXT.Provider, { value: { section, step, view } }, h('section', { ref: root, className: `pm-section pm-section--${layout}`, 'data-section': section.id, 'data-index': section.index, 'data-step': layout === 'scrolly' ? step : undefined }, [h(title, { id: section.id, className: 'pm-section__title', tabIndex: -1, 'data-content-role': 'visual', 'data-content-label': viewerMessages().contentRoles.visual }, [contentMarks(section, 'visual', 0), section.title, viewer.options.sectionHeading?.(section, step), h('a', { className: 'header-anchor', href: `#${section.id}`, 'aria-label': t.anchor(section.title) }, '​')]), findings.length ? h('ul', { className: 'pm-diagnostics', role: 'alert' }, findings.map((finding, key) => h('li', { key, 'data-severity': finding.severity }, finding.message))) : null, body]))
}

export const SectionView = memo(SectionViewContent)
