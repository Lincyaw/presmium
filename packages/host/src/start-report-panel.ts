import { createElement as h } from 'react'
import { useStartReport } from './host.ts'
import { useStore } from './store.ts'
import { componentErrors, componentErrorRevision } from './error-boundary.ts'
export default function StartReportPanel() { const report = useStartReport(); useStore(componentErrorRevision); return h('div', { className: 'pm-start-report' }, h('ul', {}, report?.plugins.map(plugin => h('li', { key: plugin.id }, `${plugin.id}: ${plugin.status}${plugin.reason ? ` — ${plugin.reason}` : ''}`))), componentErrors().map((error, key) => h('p', { key, role: 'alert' }, `${error.component}: ${error.message}`))) }
