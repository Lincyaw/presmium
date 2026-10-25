import type { IRSection } from '@lincyaw/kernel'
import { SectionView } from '../section.ts'
import { h } from '../element.ts'
export function ScrollyView({ sections }: { sections: IRSection[] }) { return h('div', { className: 'pm-view pm-view--scrolly' }, sections.map(section => h(SectionView, { key: section.id, section, layout: 'scrolly' }))) }
