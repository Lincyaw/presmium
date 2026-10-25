import { PmIcon } from '@lincyaw/host'
import type { IRSection } from '@lincyaw/kernel'
import { h } from './element.ts'
import { viewerMessages } from './viewer-messages.ts'

/** Author controls are excluded by the preview's text reader and are hidden outside document editing. */
export function contentMarks(section: IRSection, role: 'visual' | 'narration' | 'reading', at: number, span = 0) {
  const label = viewerMessages().contentRoles[role]
  const place = `${section.index} · ${at + 1}${span > 0 ? `–${at + span + 1}` : ''}`
  return h('span', { class: 'pm-content-marks', contenteditable: 'false', 'data-preview-ui': '' }, [h('button', {
    'type': 'button', 'class': 'pm-content-mark',
    'data-content-section': section.id, 'data-content-step': at,
    'title': `${label} · ${place}`, 'aria-label': `${label} · ${place}`,
  }, [h(PmIcon, { name: role === 'visual' ? 'slides' : role === 'reading' ? 'notebook' : 'captions' }), h('span', place)])])
}
