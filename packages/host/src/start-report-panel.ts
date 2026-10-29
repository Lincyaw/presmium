import { createElement as h } from 'react'
import { useStartReport } from './host.ts'
import { useLocale, useMessages } from './locale.ts'
import { HOST_MESSAGES } from './messages.ts'
import { useStore } from './store.ts'
import { componentErrors, componentErrorRevision } from './error-boundary.ts'
// Plugins by the names they declare; a reason the kernel gives (service ids, error text) stays in the console, where it logs it.
export default function StartReportPanel() { const t = useMessages(HOST_MESSAGES); const locale = useLocale(); const report = useStartReport(); useStore(componentErrorRevision); return h('div', { className: 'pm-start-report' }, report === undefined ? h('p', {}, t.starting) : report.plugins.length ? h('ul', {}, report.plugins.map(plugin => h('li', { key: plugin.id, 'data-plugin': plugin.id, 'data-status': plugin.status }, `${plugin.name?.[locale] ?? t.unnamedPlugin}${t.because}${t.status[plugin.status]}`))) : h('p', {}, t.noPlugins), componentErrors().map((error, key) => h('p', { key, role: 'alert' }, t.componentError(error.component, error.message)))) }
