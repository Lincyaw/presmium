/**
 * The workspace's toolbar entries: edit mode, the document operations of the
 * home page, the revision history, and "request execution". Each shows for
 * editors and owners only; the panels are plain, styled inline so the entries
 * need no style sheet in either form.
 */
import { useMessages, useServer } from '@presmium/host'
import type { AgentClient, Revision } from '@presmium/kernel'
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { DocumentOperation, DocumentsAnswer, ExecutionState, OperationAnswer, RevertAnswer, RevisionsAnswer, WorkspaceDocument } from '../domain/api.ts'
import { WORKSPACE_ID } from '../domain/api.ts'
import { mayEdit } from '../domain/members.ts'
import { WORKSPACE_MESSAGES } from '../domain/messages.ts'

/** Whether the page shows edit mode (the `EDIT_MODE` service's state). */
export const editing = ref(false)

/** The assistant's client, when the assistant plugin provides one (WP-80): drafting a new document needs it. */
const agent = shallowRef<AgentClient>()
export function setAgent(client: AgentClient | undefined): void {
  agent.value = client
}

/** The window event after which the home page reads the documents again (see @presmium/web's home page). */
const DOCUMENTS_EVENT = 'presmium:documents'

const PANEL = {
  position: 'absolute',
  right: '0',
  top: '100%',
  zIndex: '1000',
  minWidth: '22rem',
  maxWidth: '32rem',
  maxHeight: '70vh',
  overflow: 'auto',
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

const BUTTON = { padding: '0 0.4rem', border: '1px solid var(--vp-c-divider, GrayText)', borderRadius: '4px', margin: '0 0.15rem' } as const
const INPUT = { padding: '0.1rem 0.3rem', border: '1px solid var(--vp-c-divider, GrayText)', borderRadius: '4px', minWidth: '8rem' } as const

/** The member may edit (editors and owners). */
function useEditor() {
  const server = useServer()
  return computed(() => server.available && mayEdit(server.member.value?.roles))
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await useServer().fetch(WORKSPACE_ID, path, init)
  const data = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok && !(response.status === 409 && 'conflicts' in (data as object))) throw new Error(data.error ?? `${response.status}`)
  return data
}

function post<T>(path: string, body: unknown): Promise<T> {
  return call<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

/** A toolbar button and the panel it opens. */
function entry(name: string, open: { value: boolean }, label: string, panel: () => unknown) {
  return h('span', { class: `pm-workspace-${name}`, style: { position: 'relative', display: 'inline-block' } }, [
    h('button', { 'type': 'button', 'class': `pm-workspace-${name}__toggle`, 'aria-expanded': open.value ? 'true' : 'false', 'onClick': () => open.value = !open.value }, label),
    open.value ? h('div', { 'class': `pm-workspace-${name}__panel`, 'role': 'dialog', 'aria-label': label, 'style': PANEL }, panel() as never) : null,
  ])
}

export const EditToggle = defineComponent({
  name: 'PmWorkspaceEdit',
  setup() {
    const t = useMessages(WORKSPACE_MESSAGES)
    const editor = useEditor()
    return () => (editor.value
      ? h('button', {
          'type': 'button',
          'class': 'pm-workspace-edit',
          'aria-pressed': editing.value ? 'true' : 'false',
          'onClick': () => editing.value = !editing.value,
        }, editing.value ? t.value.leaveEdit : t.value.edit)
      : null)
  },
})

export const History = defineComponent({
  name: 'PmWorkspaceHistory',
  setup() {
    const t = useMessages(WORKSPACE_MESSAGES)
    const editor = useEditor()
    const open = ref(false)
    const revisions = shallowRef<Revision[]>([])
    const message = ref<string>()
    const load = async () => {
      try {
        revisions.value = (await call<RevisionsAnswer>('revisions')).revisions
      } catch (error) {
        message.value = error instanceof Error ? error.message : String(error)
      }
    }
    const revert = async (id: string) => {
      message.value = undefined
      try {
        const result = await post<RevertAnswer>('revisions/revert', { id })
        message.value = result.ok ? t.value.reverted : t.value.conflicts(result.conflicts)
        window.dispatchEvent(new Event(DOCUMENTS_EVENT))
      } catch (error) {
        message.value = error instanceof Error ? error.message : String(error)
      }
      await load()
    }
    const onChange = () => {
      if (open.value) void load()
    }
    onMounted(() => window.addEventListener(DOCUMENTS_EVENT, onChange))
    onBeforeUnmount(() => window.removeEventListener(DOCUMENTS_EVENT, onChange))
    return () => {
      if (!editor.value) return null
      return entry('history', { get value() { return open.value }, set value(next) {
        open.value = next
        if (next) void load()
      } }, t.value.history, () => [
        message.value ? h('p', { class: 'pm-workspace-history__message', role: 'alert' }, message.value) : null,
        revisions.value.length === 0
          ? h('p', t.value.noRevisions)
          : h('ul', { class: 'pm-workspace-history__list', style: { listStyle: 'none', padding: 0, margin: 0 } }, revisions.value.map(revision => h('li', {
              'key': revision.id,
              'class': 'pm-workspace-revision',
              'data-revision': revision.id,
              'style': { padding: '0.4rem 0', borderBottom: '1px solid var(--vp-c-divider, GrayText)' },
            }, [
              h('div', { class: 'pm-workspace-revision__summary', style: { fontWeight: 600 } }, revision.message.split('\n')[0]),
              h('div', { class: 'pm-workspace-revision__meta', style: { opacity: 0.75 } }, `${t.value.origin[revision.origin.kind]} · ${revision.author} · ${new Date(revision.date).toLocaleString()}`),
              revision.revertedBy
                ? h('span', { class: 'pm-workspace-revision__reverted' }, t.value.reverted)
                : h('button', { type: 'button', class: 'pm-workspace-revision__revert', style: BUTTON, onClick: () => void revert(revision.id) }, t.value.revert),
            ]))),
      ])
    }
  },
})

export const Documents = defineComponent({
  name: 'PmWorkspaceDocuments',
  setup() {
    const t = useMessages(WORKSPACE_MESSAGES)
    const editor = useEditor()
    const open = ref(false)
    const answer = shallowRef<DocumentsAnswer>()
    const message = ref<string>()
    const busy = ref(false)
    const form = ref({ dir: '', title: '', template: '', draft: false, request: '' })
    const targets = ref<Record<string, string>>({})
    const load = async () => {
      try {
        answer.value = await call<DocumentsAnswer>('documents')
      } catch (error) {
        message.value = error instanceof Error ? error.message : String(error)
      }
    }
    const run = async (operation: DocumentOperation, after?: (result: OperationAnswer) => void) => {
      busy.value = true
      message.value = undefined
      try {
        const result = await post<OperationAnswer>('documents', operation)
        window.dispatchEvent(new Event(DOCUMENTS_EVENT))
        await load()
        after?.(result)
      } catch (error) {
        message.value = error instanceof Error ? error.message : String(error)
      } finally {
        busy.value = false
      }
    }
    const create = () => {
      const { dir, title, template, draft, request } = form.value
      const drafting = draft && agent.value?.available('chat')
      void run({ op: 'create', dir: dir.trim(), ...title.trim() ? { title: title.trim() } : {}, ...template ? { template } : {} }, (result) => {
        form.value = { dir: '', title: '', template: '', draft: false, request: '' }
        if (!drafting || !result.dir) return
        // Drafted by the agent: one chat task whose context is the new document's directory (P-121), then the document.
        agent.value!.submit({ kind: 'chat', prompt: request, context: { document: result.dir } })
        location.assign(new URL(`${encodeURI(result.dir)}/`, location.href).href)
      })
    }
    const field = (name: 'dir' | 'title' | 'request', label: string) => h('label', { style: { display: 'block', margin: '0.25rem 0' } }, [
      `${label} `,
      h(name === 'request' ? 'textarea' : 'input', {
        name,
        'value': form.value[name],
        'style': INPUT,
        'aria-label': label,
        'onInput': (event: Event) => form.value[name] = (event.target as HTMLInputElement).value,
      }),
    ])
    const onChange = () => {
      if (open.value) void load()
    }
    onMounted(() => window.addEventListener(DOCUMENTS_EVENT, onChange))
    onBeforeUnmount(() => window.removeEventListener(DOCUMENTS_EVENT, onChange))
    return () => {
      if (!editor.value) return null
      const known = answer.value
      const canDraft = Boolean(agent.value?.available('chat'))
      return entry('documents', { get value() { return open.value }, set value(next) {
        open.value = next
        if (next) void load()
      } }, t.value.documents, () => [
        h('form', { class: 'pm-workspace-create', onSubmit: (event: Event) => {
          event.preventDefault()
          create()
        } }, [
          h('h3', { style: { margin: '0 0 0.25rem', fontWeight: 600 } }, t.value.create),
          field('dir', t.value.dir),
          field('title', t.value.title),
          (known?.templates.length ?? 0) > 1
            ? h('label', { style: { display: 'block', margin: '0.25rem 0' } }, [`${t.value.template} `, h('select', {
                name: 'template',
                value: form.value.template,
                onChange: (event: Event) => form.value.template = (event.target as HTMLSelectElement).value,
              }, known!.templates.map(name => h('option', { value: name }, name)))])
            : null,
          // Drafting needs the assistant (WP-80); without one the option is not there.
          canDraft
            ? h('label', { class: 'pm-workspace-create__draft', style: { display: 'block', margin: '0.25rem 0' } }, [
                h('input', { type: 'checkbox', name: 'draft', checked: form.value.draft, onChange: (event: Event) => form.value.draft = (event.target as HTMLInputElement).checked }),
                ` ${t.value.draft(agent.value?.provider())}`,
              ])
            : null,
          canDraft && form.value.draft ? field('request', t.value.draftRequest) : null,
          h('button', { type: 'submit', disabled: busy.value, style: BUTTON }, t.value.submit),
        ]),
        message.value ? h('p', { class: 'pm-workspace-documents__message', role: 'alert' }, message.value) : null,
        h('ul', { class: 'pm-workspace-documents__list', style: { listStyle: 'none', padding: 0, margin: '0.5rem 0 0' } }, (known?.documents ?? []).map((doc: WorkspaceDocument) => h('li', {
          'key': doc.dir,
          'class': 'pm-workspace-document',
          'data-document': doc.dir,
          'style': { padding: '0.4rem 0', borderTop: '1px solid var(--vp-c-divider, GrayText)' },
        }, [
          h('div', { style: { fontWeight: 600 } }, `${doc.title} (${doc.dir})`),
          h('input', {
            'name': 'to',
            'placeholder': t.value.to,
            'aria-label': `${t.value.to} ${doc.dir}`,
            'value': targets.value[doc.dir] ?? '',
            'style': INPUT,
            'onInput': (event: Event) => targets.value = { ...targets.value, [doc.dir]: (event.target as HTMLInputElement).value },
          }),
          h('button', { type: 'button', class: 'pm-workspace-document__rename', disabled: busy.value, style: BUTTON, onClick: () => void run({ op: 'rename', dir: doc.dir, to: (targets.value[doc.dir] ?? '').trim() }) }, t.value.rename),
          h('button', { type: 'button', class: 'pm-workspace-document__copy', disabled: busy.value, style: BUTTON, onClick: () => void run({ op: 'copy', dir: doc.dir, to: (targets.value[doc.dir] ?? '').trim() }) }, t.value.copy),
          h('button', { type: 'button', class: 'pm-workspace-document__delete', disabled: busy.value, style: BUTTON, onClick: () => {
            if (window.confirm(t.value.confirmDelete(doc.dir))) void run({ op: 'delete', dir: doc.dir })
          } }, t.value.remove),
        ]))),
      ])
    }
  },
})

/** "Request execution": a document's code that did not run, asked for again (SHARED, `compile: approve`). */
export const Execution = defineComponent({
  name: 'PmWorkspaceExecution',
  setup() {
    const t = useMessages(WORKSPACE_MESSAGES)
    const editor = useEditor()
    const state = shallowRef<ExecutionState>()
    let timer: ReturnType<typeof setInterval> | undefined
    const load = async () => {
      if (!editor.value) return
      state.value = await call<ExecutionState>('execution').catch(() => undefined)
      // Only `compile: approve` leaves code to ask for again; elsewhere there is nothing to follow.
      if (state.value && state.value.mode !== 'approve') clearInterval(timer)
    }
    onMounted(() => {
      void load()
      timer = setInterval(() => void load(), 5000)
    })
    onBeforeUnmount(() => clearInterval(timer))
    return () => {
      const now = state.value
      if (!editor.value || !now || now.mode !== 'approve' || now.notRun.length === 0) return null
      if (now.pending) return h('span', { class: 'pm-workspace-execution pm-workspace-execution--pending' }, t.value.executionPending)
      return h('button', {
        type: 'button',
        class: 'pm-workspace-execution',
        onClick: async () => {
          state.value = await post<ExecutionState>('execution', {}).catch(() => state.value)
        },
      }, t.value.requestExecution(now.notRun.length))
    }
  },
})
