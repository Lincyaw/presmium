import type { IRSection } from '@lincyaw/kernel'
import { SectionView } from '../section.ts'
import { useViewer } from '../viewer-state.ts'
import { h } from '../element.ts'
export function DocumentView({ sections }: { sections: IRSection[] }) { const viewer = useViewer(); return h('div', { className: 'pm-view pm-view--document' }, sections.map(section => h(SectionView, { key: section.id, section, layout: section.hints[viewer.options.renderer]?.layout === 'scrolly' ? 'scrolly' : 'document' }))) }
