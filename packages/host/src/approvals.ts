/**
 * The approvals entry of the toolbar (docs/architecture.md 10.4): shown only
 * while approvals wait for this window, with what each one asks, who asks,
 * and Allow and Deny. In SHARED mode an owner's site window only learns how
 * many wait in the owner console, and links to it.
 */
import { defineComponent, h, ref, watch } from 'vue'
import { useMessages } from './locale.ts'
import { HOST_MESSAGES } from './messages.ts'
import { approvals } from './server.ts'

/** Inline, so the entry needs no style sheet of its own in either form. */
const PANEL = {
  position: 'absolute',
  right: '0',
  top: '100%',
  zIndex: '1000',
  minWidth: '18rem',
  maxWidth: '28rem',
  padding: '0.75rem',
  background: 'var(--vp-c-bg, Canvas)',
  color: 'var(--vp-c-text-1, CanvasText)',
  border: '1px solid var(--vp-c-divider, GrayText)',
  borderRadius: '6px',
  boxShadow: '0 4px 16px rgb(0 0 0 / 0.15)',
  fontSize: '0.875rem',
  lineHeight: '1.4',
  textAlign: 'start',
} as const

export const PmApprovals = defineComponent({
  name: 'PmApprovals',
  setup() {
    const t = useMessages(HOST_MESSAGES)
    const open = ref(false)
    const failed = ref<string>()
    // Once nothing waits, the entry goes away; it shows closed when the next approval comes.
    watch(() => approvals.pending.value.length + (approvals.elsewhere.value?.count ?? 0), (count) => {
      if (count === 0) open.value = false
    })
    const answer = (id: string, allow: boolean) => {
      failed.value = undefined
      approvals.answer(id, allow).catch((error: unknown) => {
        failed.value = error instanceof Error ? error.message : String(error)
      })
    }
    return () => {
      const pending = approvals.pending.value
      const elsewhere = approvals.elsewhere.value
      if (pending.length === 0 && !elsewhere) return null
      const children = [h('button', {
        'type': 'button',
        'class': 'pm-approvals__toggle',
        'aria-expanded': open.value ? 'true' : 'false',
        'onClick': () => open.value = !open.value,
      }, t.value.approvals(pending.length + (elsewhere?.count ?? 0)))]
      if (open.value) {
        children.push(h('div', { 'class': 'pm-approvals__panel', 'role': 'dialog', 'aria-label': t.value.approvalsTitle, 'style': PANEL }, [
          ...pending.map(({ id, request }) => h('div', { 'key': id, 'class': 'pm-approvals__item', 'data-approval': id }, [
            h('p', { class: 'pm-approvals__title' }, request.title),
            h('p', { class: 'pm-approvals__from' }, t.value.from(request.from)),
            request.detail ? h('pre', { class: 'pm-approvals__detail', style: { whiteSpace: 'pre-wrap' } }, request.detail) : null,
            h('div', { class: 'pm-approvals__actions', style: { display: 'flex', gap: '0.5rem' } }, [
              h('button', { type: 'button', onClick: () => answer(id, true) }, t.value.allow),
              h('button', { type: 'button', onClick: () => answer(id, false) }, t.value.deny),
            ]),
          ])),
          elsewhere
            ? h('p', { class: 'pm-approvals__elsewhere' }, [
                t.value.inConsole(elsewhere.count),
                elsewhere.console ? [' ', h('a', { href: elsewhere.console, target: '_blank', rel: 'noopener' }, t.value.openConsole)] : null,
              ])
            : null,
          failed.value ? h('p', { class: 'pm-approvals__error', role: 'alert' }, failed.value) : null,
        ]))
      }
      return h('span', { class: 'pm-approvals', style: { position: 'relative', display: 'inline-block' } }, children)
    }
  },
})
