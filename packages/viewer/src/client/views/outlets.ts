import { useEffect } from 'react'
import { useStore } from '@lincyaw/host'
import { blockVisible, irBlocks } from '@lincyaw/kernel'
import { findView, registryRevision } from '../registry.ts'
import { useViewer } from '../viewer-state.ts'
import { h } from '../element.ts'

/** A later step may belong to a block far below the page heading. */
function stepElement(viewer: ReturnType<typeof useViewer>, sectionId: string, step: number): HTMLElement | null {
  const heading = document.getElementById(sectionId)
  const section = viewer.section(sectionId)
  const root = heading?.closest('.pm-section')
  if (!root || !section) return heading
  if (root.classList.contains('pm-section--scrolly'))
    return root.querySelector<HTMLElement>(`.pm-step[data-step="${step}"]`) ?? heading
  if (step === 0) return heading
  const candidates = [...irBlocks(section.blocks)]
    .filter(block => block.role === 'visual' && blockVisible(block, step) && !(block.node.type === 'component' && block.node.layer === 'overlay'))
    .sort((a, b) => {
      const aCurrent = step <= a.at + (a.span ?? 0)
      const bCurrent = step <= b.at + (b.span ?? 0)
      return Number(bCurrent) - Number(aCurrent) || b.at - a.at
    })
  for (const block of candidates) {
    const id = CSS.escape(block.id)
    // BlockNote owns native body blocks; plugin blocks and published pages use the IR anchor.
    const element = root.querySelector<HTMLElement>(`[data-block="${id}"], [data-id="${id}"]`)
    if (element && element.getBoundingClientRect().height > 0 && getComputedStyle(element).visibility !== 'hidden') return element
  }
  return heading
}
export function PageViewOutlet({ sections }: { sections: string[] }) {
  const viewer = useViewer(); useStore(viewer.doc); const page = useStore(viewer.pageView); const view = useStore(viewer.view); const restoring = useStore(viewer.restoring); const position = useStore(viewer.position); useStore(registryRevision)
  useEffect(() => { if (!restoring || findView(view)?.kind !== 'page') return; const frame = requestAnimationFrame(() => { const element = stepElement(viewer, position.section, position.step); if (element) { element.scrollIntoView({ block: 'start' }); viewer.restoring.set(false) } else { viewer.options.navigate?.(position) } }); return () => cancelAnimationFrame(frame) }, [restoring, view, position, sections])
  const definition = findView(page) ?? findView('document')
  return h('div', { className: 'pm-view-host pm-document', 'aria-busy': restoring }, definition ? h(definition.component, { sections: sections.flatMap(id => viewer.section(id) ?? []) }) : null)
}
export function OverlayViewOutlet() { const viewer = useViewer(); const view = useStore(viewer.view); useStore(registryRevision); const definition = findView(view); return definition?.kind === 'overlay' ? h(definition.component, { key: view }) : null }
