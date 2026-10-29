import { createElement as h } from 'react'
import { useStartReport } from './host.ts'
import { useMessages } from './locale.ts'
import { HOST_MESSAGES } from './messages.ts'
import { useStore } from './store.ts'
import { componentErrors, componentErrorRevision } from './error-boundary.ts'
export default function StartReportPanel() { const t = useMessages(HOST_MESSAGES); const report = useStartReport(); useStore(componentErrorRevision); return h('div', { className: 'pm-start-report' }, report === undefined ? h('p', {}, t.starting) : report.plugins.length ? h('ul', {}, report.plugins.map(plugin => h('li', { key: plugin.id }, `${plugin.id}${t.because}${t.status[plugin.status]}${plugin.reason ? ` — ${plugin.reason}` : ''}`))) : h('p', {}, t.noPlugins), componentErrors().map((error, key) => h('p', { key, role: 'alert' }, t.componentError(error.component, error.message)))) }
