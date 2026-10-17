/**
 * The approvals entry of the toolbar (docs/architecture.md 10.4): shown only
 * while approvals wait for this window, with what each one asks, who asks,
 * and Allow and Deny. The web form's present and presenter views, which cover
 * the toolbar, show it in their control bars.
 */
import type { PropType } from 'vue'
import { defineComponent, h, ref, watch } from 'vue'
import { PmButton, PmNotice, PmPopover } from './design/components.ts'
import { useMessages } from './locale.ts'
import { HOST_MESSAGES } from './messages.ts'
import { approvals } from './server.ts'

export const PmApprovals = defineComponent({
  name: 'PmApprovals',
  props: {
    /** Where the panel opens: below the entry (a toolbar at the top), or above it (a control bar at the bottom). */
    placement: { type: String as PropType<'below' | 'above'>, default: 'below' },
  },
  setup(props) {
    const t = useMessages(HOST_MESSAGES)
    const open = ref(false)
    const failed = ref<string>()
    // Once nothing waits, the entry goes away; it shows closed when the next approval comes.
    watch(() => approvals.pending.value.length, (count) => {
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
      if (pending.length === 0) return null
      return h(PmPopover, {
        'open': open.value,
        'label': t.value.approvalsTitle,
        'name': 'pm-approvals',
        'placement': props.placement === 'above' ? 'above-end' : 'below-end',
        'onUpdate:open': (next: boolean) => open.value = next,
      }, {
        trigger: () => h(PmButton, {
          'variant': 'accent',
          'small': true,
          'class': 'pm-approvals__toggle',
          'aria-expanded': open.value ? 'true' : 'false',
          'onClick': () => open.value = !open.value,
        }, () => t.value.approvals(pending.length)),
        default: () => [
          ...pending.map(({ id, request }) => h('div', { 'key': id, 'class': 'pm-approvals__item', 'data-approval': id, 'style': { display: 'grid', gap: 'var(--pm-space-2)' } }, [
            h('p', { class: 'pm-approvals__title', style: { margin: 0, fontWeight: 600 } }, request.title),
            h('p', { class: 'pm-approvals__from', style: { margin: 0, color: 'var(--pm-color-muted)' } }, t.value.from(request.from)),
            request.detail ? h('pre', { class: 'pm-approvals__detail pm-ui-code', style: { margin: 0, whiteSpace: 'pre-wrap' } }, request.detail) : null,
            h('div', { class: 'pm-approvals__actions', style: { display: 'flex', gap: 'var(--pm-space-2)' } }, [
              h(PmButton, { variant: 'primary', small: true, onClick: () => answer(id, true) }, () => t.value.allow),
              h(PmButton, { small: true, onClick: () => answer(id, false) }, () => t.value.deny),
            ]),
          ])),
          failed.value ? h(PmNotice, { class: 'pm-approvals__error', tone: 'danger' }, () => failed.value) : null,
        ],
      })
    }
  },
})
