import { useEffect } from 'react'
import { useStore } from '@lincyaw/host'
import { findView, registryRevision } from '../registry.ts'
import { useViewer } from '../viewer-state.ts'
import { h } from '../element.ts'
export function PageViewOutlet({ sections }: { sections: string[] }) {
  const viewer = useViewer(); useStore(viewer.doc); const page = useStore(viewer.pageView); const view = useStore(viewer.view); const restoring = useStore(viewer.restoring); const position = useStore(viewer.position); useStore(registryRevision)
  useEffect(() => { if (!restoring || findView(view)?.kind !== 'page') return; const frame = requestAnimationFrame(() => { const element = document.getElementById(position.section); if (element) { element.scrollIntoView({ block: 'start' }); viewer.restoring.set(false) } else { viewer.options.navigate?.(position) } }); return () => cancelAnimationFrame(frame) }, [restoring, view, position, sections])
  const definition = findView(page) ?? findView('document')
  return h('div', { className: 'pm-view-host pm-document', 'aria-busy': restoring }, definition ? h(definition.component, { sections: sections.flatMap(id => viewer.section(id) ?? []) }) : null)
}
export function OverlayViewOutlet() { const viewer = useViewer(); const view = useStore(viewer.view); useStore(registryRevision); const definition = findView(view); return definition?.kind === 'overlay' ? h(definition.component, { key: view }) : null }
