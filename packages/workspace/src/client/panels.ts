/**
 * The workspace's entries in the shell (P-120, P-121, N-10): the edit
 * switch of a document's page; on the home page the document operations
 * (a button and a dialog), the agent's draft card, the latest changes, the
 * usage guide; everywhere the revision history (an icon of the home page's
 * activity bar) and the git status of the status bar. Each is for editors and
 * owners only, drawn with the host's components and tokens.
 */
import { currentLocale, PmBadge, PmButton, PmCard, PmDialog, PmEmpty, PmField, PmIcon, PmNotice, PmToolbarEntry, useMessages, useServer, useToolbarPlace } from '@presmium/host'
import type { AgentClient, AgentTask, ReviewChange } from '@presmium/kernel'
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { DocumentOperation, DocumentsAnswer, HistoryRevision, LockedAnswer, OperationAnswer, RevertAnswer, RevisionsAnswer, WorkspaceDocument } from '../domain/api.ts'
import { lockKind, WORKSPACE_ID } from '../domain/api.ts'
import { mayEdit } from '../domain/members.ts'
import { DOCS_SITE_URL, WORKSPACE_MESSAGES } from '../domain/messages.ts'
import type { WorkspaceMessages } from '../domain/messages.ts'

/** Whether the page shows edit mode (the `EDIT_MODE` service's state). */
export const editing = ref(false)

/** The assistant's client, when the assistant plugin provides one (WP-80): drafting a new document needs it. */
const agent = shallowRef<AgentClient>()
export function setAgent(client: AgentClient | undefined): void {
  agent.value = client
}

/** The window event after which the home page reads the documents again (see @presmium/web's home page). */
const DOCUMENTS_EVENT = 'presmium:documents'

/** The document dialog of the home page, which its button, its draft card and the dialog itself open and close. */
const dialog = ref(false)
/** The dialog opens at its form, with "draft with the agent" chosen (the draft card). */
const draftChosen = ref(false)

/** The member may edit (editors and owners). */
function useEditor() {
  const server = useServer()
  return computed(() => server.available && mayEdit(server.member.value?.roles))
}

/** A refusal of the workspace's routes; `locked` when another writer holds a document it would change (409, F-09). */
class RouteError extends Error {
  readonly locked?: LockedAnswer['locked']
  constructor(message: string, locked?: LockedAnswer['locked']) {
    super(message)
    this.locked = locked
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await useServer().fetch(WORKSPACE_ID, path, init)
  const data = await response.json().catch(() => ({})) as T & { error?: string, locked?: LockedAnswer['locked'] }
  if (!response.ok && !(response.status === 409 && 'conflicts' in (data as object))) {
    const locked = typeof data.locked?.document === 'string' && typeof data.locked.holder === 'string' ? data.locked : undefined
    throw new RouteError(data.error ?? `${response.status}`, locked)
  }
  return data
}

/** What a panel says of a failure: a document's lock in the reader's language (N-07), else the server's text. */
function failure(error: unknown, t: WorkspaceMessages): string {
  if (error instanceof RouteError && error.locked) return t.locked(error.locked.document, lockKind(error.locked.holder))
  return error instanceof Error ? error.message : String(error)
}

function post<T>(path: string, body: unknown): Promise<T> {
  return call<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

/** Calls `load` again whenever a plugin says the documents changed (an operation, an undo). */
function onDocumentsChange(load: () => void): void {
  onMounted(() => window.addEventListener(DOCUMENTS_EVENT, load))
  onBeforeUnmount(() => window.removeEventListener(DOCUMENTS_EVENT, load))
}

/** A time as the home page says it: the hour today, else yesterday, else the date (N-07). */
function shortTime(date: string): string {
  const when = new Date(date)
  const locale = currentLocale()
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(when).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days === 0) return when.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-1, 'day')
  return when.toLocaleDateString(locale)
}

export const EditToggle = defineComponent({
  name: 'PmWorkspaceEdit',
  setup() {
    const t = useMessages(WORKSPACE_MESSAGES)
    const editor = useEditor()
    return () => (editor.value
      ? h(PmButton, {
          'class': 'pm-workspace-edit',
          'small': true,
          'icon': 'edit',
          'aria-pressed': editing.value ? 'true' : 'false',
          'onClick': () => editing.value = !editing.value,
        }, () => (editing.value ? t.value.leaveEdit : t.value.edit))
      : null)
  },
})

/** A commit's first line. */
const summaryOf = (revision: HistoryRevision) => revision.message.split('\n')[0] ?? ''

/** The subject an undo's commit quotes (`Revert "<subject>"`), unwrapped `times` times. */
function unwrap(summary: string, times: number): string {
  let subject = summary
  for (let i = 0; i < times; i++) subject = /^Revert "(.*)"$/.exec(subject)?.[1] ?? subject
  return subject
}

/**
 * How many undos a revision is away from a change (F-55): 0 for a change, 1
 * for its undo, 2 for the undo of that undo (a redo), and so on. The chain of
 * `reverts` among the listed revisions says it; where it leaves the list, the
 * nesting of the commit's subject does.
 */
function undoDepth(revision: HistoryRevision, find: (id: string) => HistoryRevision | undefined): number {
  let depth = 0
  for (let at = revision; at.reverts; depth++) {
    const next = find(at.reverts)
    if (!next) {
      let nested = 0
      for (let subject = summaryOf(at); /^Revert ".*"$/.test(subject); nested++) subject = unwrap(subject, 1)
      return depth + Math.max(nested, 1)
    }
    at = next
  }
  return depth
}

/** The lookup of `undoDepth` among `revisions`, by full or abbreviated commit id. */
function finder(revisions: HistoryRevision[]): (id: string) => HistoryRevision | undefined {
  const byId = new Map(revisions.map(revision => [revision.id, revision]))
  return id => byId.get(id) ?? revisions.find(revision => revision.id.startsWith(id) || id.startsWith(revision.id))
}

/**
 * How the history names a revision in the reader's language (N-07, F-55): a document operation by its origin; an
 * undo by what it undoes, a redo (the undo of an undo) as the redo of the change; others (an agent's commit,
 * written in the deck's language) by their summary. The commit's own summary stays as written.
 */
function revisionLabel(revision: HistoryRevision, depth: number, t: WorkspaceMessages): string {
  const change = revision.operation ? t.operation(revision.operation) : unwrap(summaryOf(revision), depth)
  if (depth === 0) return change
  return depth % 2 === 1 ? t.revertOf(change) : t.redoOf(change)
}

/** The tag of a revision's origin: the AI's changes stand out. */
function originTag(revision: HistoryRevision, t: WorkspaceMessages) {
  const kind = revision.origin.kind
  return h(PmBadge, { class: 'pm-workspace-revision__origin', tone: kind === 'agent' ? 'accent' : 'outline', pill: true }, () => t.originTag[kind])
}

export const History = defineComponent({
  name: 'PmWorkspaceHistory',
  setup() {
    const t = useMessages(WORKSPACE_MESSAGES)
    const editor = useEditor()
    const open = ref(false)
    const revisions = shallowRef<HistoryRevision[]>([])
    const message = ref<string>()
    const load = async () => {
      try {
        revisions.value = (await call<RevisionsAnswer>('revisions')).revisions
      } catch (error) {
        message.value = failure(error, t.value)
      }
    }
    const revert = async (id: string) => {
      message.value = undefined
      try {
        const result = await post<RevertAnswer>('revisions/revert', { id })
        message.value = result.ok ? undefined : t.value.conflicts(result.conflicts)
        window.dispatchEvent(new Event(DOCUMENTS_EVENT))
      } catch (error) {
        message.value = failure(error, t.value)
      }
      await load()
    }
    onDocumentsChange(() => {
      if (open.value) void load()
    })
    const item = (revision: HistoryRevision, find: (id: string) => HistoryRevision | undefined) => {
      const depth = undoDepth(revision, find)
      // An undo is undone by a redo; a change or a redo by an undo.
      const undoes = depth % 2 === 1
      return h('li', { 'key': revision.id, 'class': 'pm-workspace-revision', 'data-revision': revision.id, 'data-undo': depth === 0 ? undefined : undoes ? 'undo' : 'redo' }, [
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 'var(--pm-space-2)' } }, [
          originTag(revision, t.value),
          h('div', { class: 'pm-workspace-revision__summary', style: { flex: 1, minWidth: 0, fontWeight: 500, overflowWrap: 'anywhere' } }, revisionLabel(revision, depth, t.value)),
        ]),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--pm-space-2)', marginTop: 'var(--pm-space-1)' } }, [
          h('div', { class: 'pm-workspace-revision__meta', style: { flex: 1, minWidth: 0, color: 'var(--pm-color-muted)', fontSize: 'var(--pm-text-sm)' } }, [
            `${t.value.origin[revision.origin.kind]} · `,
            h('span', { title: revision.author }, revision.author.replace(/\s*<[^>]*>$/, '')),
            ' · ',
            h('time', { datetime: revision.date }, new Date(revision.date).toLocaleString(currentLocale())),
          ]),
          revision.revertedBy
            ? h(PmBadge, { class: 'pm-workspace-revision__reverted' }, () => (undoes ? t.value.redone : t.value.reverted))
            : h(PmButton, { class: 'pm-workspace-revision__revert', small: true, icon: undoes ? 'redo' : 'undo', onClick: () => void revert(revision.id) }, () => (undoes ? t.value.redo : t.value.revert)),
        ]),
      ])
    }
    return () => {
      if (!editor.value) return null
      const find = finder(revisions.value)
      return h(PmToolbarEntry, {
        'name': 'pm-workspace-history',
        'icon': 'history',
        'label': t.value.history,
        'closeLabel': t.value.close,
        'open': open.value,
        'onUpdate:open': (next: boolean) => {
          open.value = next
          if (next) void load()
        },
      }, () => [
        message.value ? h(PmNotice, { class: 'pm-workspace-history__message', tone: 'danger', role: 'alert' }, () => message.value) : null,
        revisions.value.length === 0
          ? h(PmEmpty, { icon: 'history' }, () => t.value.noRevisions)
          : h('ul', { class: 'pm-workspace-history__list pm-ui-list' }, revisions.value.map(revision => item(revision, find))),
      ])
    }
  },
})

/** The agent's draft of a new document, followed until its commit. */
interface Draft {
  dir: string
  task: AgentTask
  state: 'drafting' | 'review' | 'failed'
  /** The agent's latest progress or message, or why the draft failed. */
  note?: string
  /** The changes a review shows. */
  changes?: ReviewChange[]
}

/** The page of a document of the site. */
function documentUrl(dir: string): string {
  return new URL(`${encodeURI(dir)}/`, location.href).href
}

/**
 * The home page's document operations (P-121): the button of the dialog and
 * "new document", and the dialog: a form that makes a document from a
 * template or has the agent draft it, and the documents, each renamed,
 * copied or deleted. Every operation is one commit.
 */
export const Documents = defineComponent({
  name: 'PmWorkspaceDocuments',
  setup() {
    const t = useMessages(WORKSPACE_MESSAGES)
    const editor = useEditor()
    const answer = shallowRef<DocumentsAnswer>()
    const message = ref<string>()
    const busy = ref(false)
    const form = ref({ dir: '', title: '', template: '', draft: false, request: '' })
    const agentDraft = shallowRef<Draft>()
    /**
     * Follows the drafting task (P-121): the page stays until the task ends
     * with its commit (`done`), answering a review it waits for here, then
     * opens the new document with the draft. Leaving at once would lose the
     * task's events, and show the template before the draft.
     */
    const follow = async (dir: string, task: AgentTask) => {
      const update = (next: Partial<Draft>) => agentDraft.value = { ...agentDraft.value!, ...next }
      agentDraft.value = { dir, task, state: 'drafting' }
      try {
        for await (const event of task.events) {
          if (event.type === 'progress' || event.type === 'message') update({ note: event.text })
          else if (event.type === 'review') update({ state: 'review', changes: event.changes })
          else if (event.type === 'error') return update({ state: 'failed', note: event.message })
          else if (event.type === 'done') return location.assign(documentUrl(dir))
        }
        update({ state: 'failed', note: undefined })
      } catch (error) {
        update({ state: 'failed', note: error instanceof Error ? error.message : String(error) })
      }
    }
    const review = (accept: boolean) => {
      const current = agentDraft.value
      if (!current) return
      agentDraft.value = { ...current, state: 'drafting', changes: undefined }
      current.task.review({ accept }).catch((error: unknown) => {
        agentDraft.value = { ...current, state: 'failed', note: error instanceof Error ? error.message : String(error) }
      })
    }
    const targets = ref<Record<string, string>>({})
    const load = async () => {
      try {
        answer.value = await call<DocumentsAnswer>('documents')
      } catch (error) {
        message.value = failure(error, t.value)
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
        message.value = failure(error, t.value)
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
        // Drafted by the agent: one chat task whose context is the new document's directory (P-121), followed until its commit.
        void follow(result.dir, agent.value!.submit({ kind: 'chat', prompt: request, context: { document: result.dir } }))
      })
    }
    // However it opens (its button, "new document", the draft card): the documents are read again, and the
    // draft card's choice is taken, with the focus on the request (the dialog puts it on its first field).
    watch(dialog, async (open) => {
      if (!open) return
      void load()
      if (!draftChosen.value) return
      draftChosen.value = false
      form.value = { ...form.value, draft: true }
      await nextTick()
      await nextTick()
      document.querySelector<HTMLElement>('.pm-workspace-documents__panel [name="request"]')?.focus()
    }, { immediate: true })
    const field = (name: 'dir' | 'title' | 'request', label: string) => h(PmField, { label }, () => h(name === 'request' ? 'textarea' : 'input', {
      name,
      'class': name === 'request' ? 'pm-ui-textarea' : 'pm-ui-input',
      'rows': name === 'request' ? 3 : undefined,
      'value': form.value[name],
      'aria-label': label,
      'onInput': (event: Event) => form.value[name] = (event.target as HTMLInputElement).value,
    }))
    onDocumentsChange(() => {
      if (dialog.value) void load()
    })
    const draftStatus = (current: Draft) => h('div', { 'class': 'pm-workspace-draft', 'data-state': current.state, 'role': 'status', 'style': { display: 'grid', gap: 'var(--pm-space-2)', padding: 'var(--pm-space-3)', borderRadius: 'var(--pm-radius-control)', background: 'var(--pm-color-accent-soft)' } }, current.state === 'failed'
      ? [
          h('p', { role: 'alert', style: { margin: 0 } }, t.value.draftFailed(current.note)),
          h('a', { class: 'pm-workspace-draft__open pm-ui-link', href: documentUrl(current.dir) }, t.value.openDocument(current.dir)),
        ]
      : current.state === 'review'
        ? [
            h('p', { style: { margin: 0 } }, t.value.draftReview),
            h('ul', { class: 'pm-workspace-draft__changes', style: { margin: 0, fontFamily: 'var(--pm-font-mono)', fontSize: 'var(--pm-text-sm)' } }, (current.changes ?? []).map(change => h('li', { key: change.path }, `${change.path} (+${change.added} −${change.removed})`))),
            h('div', { style: { display: 'flex', gap: 'var(--pm-space-2)' } }, [
              h(PmButton, { class: 'pm-workspace-draft__accept', variant: 'primary', small: true, onClick: () => review(true) }, () => t.value.accept),
              h(PmButton, { class: 'pm-workspace-draft__reject', small: true, onClick: () => review(false) }, () => t.value.reject),
            ]),
          ]
        : [
            h('p', { style: { margin: 0 } }, t.value.drafting(current.dir)),
            current.note ? h('p', { class: 'pm-workspace-draft__note', style: { margin: 0, color: 'var(--pm-color-muted)' } }, current.note) : null,
          ])
    const createForm = (known: DocumentsAnswer | undefined, canDraft: boolean) => h('form', {
      class: 'pm-workspace-create',
      style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: 'var(--pm-space-3)', alignItems: 'end' },
      onSubmit: (event: Event) => {
        event.preventDefault()
        create()
      },
    }, [
      h('h3', { class: 'pm-ui-heading', style: { gridColumn: '1 / -1' } }, t.value.create),
      field('dir', t.value.dir),
      field('title', t.value.title),
      (known?.templates.length ?? 0) > 1
        ? h(PmField, { label: t.value.template }, () => h('select', {
            name: 'template',
            class: 'pm-ui-select',
            value: form.value.template,
            onChange: (event: Event) => form.value.template = (event.target as HTMLSelectElement).value,
          }, known!.templates.map(name => h('option', { value: name }, name))))
        : null,
      // Drafting needs the assistant (WP-80); without one the option is not there.
      canDraft
        ? h('label', { class: 'pm-workspace-create__draft pm-ui-field pm-ui-field--inline', style: { gridColumn: '1 / -1' } }, [
            h('input', { type: 'checkbox', name: 'draft', class: 'pm-ui-checkbox', checked: form.value.draft, onChange: (event: Event) => form.value.draft = (event.target as HTMLInputElement).checked }),
            h('span', { class: 'pm-ui-field__label' }, ` ${t.value.draft(agent.value?.provider())}`),
          ])
        : null,
      canDraft && form.value.draft ? h('div', { style: { gridColumn: '1 / -1', display: 'grid' } }, [field('request', t.value.draftRequest)]) : null,
      h('div', { style: { gridColumn: '1 / -1' } }, [
        h(PmButton, { type: 'submit', variant: 'primary', icon: 'plus', disabled: busy.value || agentDraft.value?.state === 'drafting' || agentDraft.value?.state === 'review' }, () => t.value.submit),
      ]),
    ])
    const row = (doc: WorkspaceDocument) => h('li', { 'key': doc.dir, 'class': 'pm-workspace-document', 'data-document': doc.dir, 'style': { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--pm-space-2)' } }, [
      h('div', { style: { flex: '1 1 12rem', minWidth: 0 } }, [
        h('div', { style: { fontFamily: 'var(--pm-font-serif)', fontWeight: 600, fontSize: 'var(--pm-text-lg)' } }, doc.title),
        h('div', { style: { color: 'var(--pm-color-muted)', fontFamily: 'var(--pm-font-mono)', fontSize: 'var(--pm-text-xs)' } }, `${doc.dir}/`),
      ]),
      h('input', {
        'name': 'to',
        'class': 'pm-ui-input',
        'placeholder': t.value.to,
        'aria-label': `${t.value.to} ${doc.dir}`,
        'value': targets.value[doc.dir] ?? '',
        'style': { flex: '0 1 9rem' },
        'onInput': (event: Event) => targets.value = { ...targets.value, [doc.dir]: (event.target as HTMLInputElement).value },
      }),
      h(PmButton, { class: 'pm-workspace-document__rename', small: true, disabled: busy.value, onClick: () => void run({ op: 'rename', dir: doc.dir, to: (targets.value[doc.dir] ?? '').trim() }) }, () => t.value.rename),
      h(PmButton, { class: 'pm-workspace-document__copy', small: true, disabled: busy.value, onClick: () => void run({ op: 'copy', dir: doc.dir, to: (targets.value[doc.dir] ?? '').trim() }) }, () => t.value.copy),
      h(PmButton, { class: 'pm-workspace-document__delete', small: true, variant: 'danger', disabled: busy.value, onClick: () => {
        if (window.confirm(t.value.confirmDelete(doc.dir))) void run({ op: 'delete', dir: doc.dir })
      } }, () => t.value.remove),
    ])
    return () => {
      if (!editor.value) return null
      const known = answer.value
      const canDraft = Boolean(agent.value?.available('chat'))
      return h('span', { class: 'pm-workspace-documents', style: { display: 'inline-flex', gap: 'var(--pm-space-2)' } }, [
        h(PmButton, {
          'class': 'pm-workspace-documents__toggle',
          'aria-expanded': dialog.value ? 'true' : 'false',
          'onClick': () => dialog.value = !dialog.value,
        }, () => t.value.documents),
        h(PmButton, { class: 'pm-workspace-documents__new', variant: 'primary', icon: 'plus', onClick: () => dialog.value = true }, () => t.value.newDocument),
        h(PmDialog, { 'open': dialog.value, 'label': t.value.documents, 'closeLabel': t.value.close, 'name': 'pm-workspace-documents', 'onUpdate:open': (open: boolean) => dialog.value = open }, () => [
          h('div', { style: { display: 'grid', gap: 'var(--pm-space-5)' } }, [
            createForm(known, canDraft),
            agentDraft.value ? draftStatus(agentDraft.value) : null,
            message.value ? h(PmNotice, { class: 'pm-workspace-documents__message', tone: 'danger', role: 'alert' }, () => message.value) : null,
            h('section', { style: { display: 'grid', gap: 'var(--pm-space-2)' } }, [
              h('h3', { class: 'pm-ui-heading' }, t.value.existing),
              h('ul', { class: 'pm-workspace-documents__list pm-ui-list' }, (known?.documents ?? []).map(row)),
            ]),
          ]),
        ]),
      ])
    }
  },
})

/** The dashed card beside the documents (the `create` slot): the agent drafts a new document, in the document dialog. */
export const DraftCard = defineComponent({
  name: 'PmWorkspaceDraftCard',
  setup() {
    const t = useMessages(WORKSPACE_MESSAGES)
    const editor = useEditor()
    return () => (editor.value && agent.value?.available('chat')
      ? h('button', {
          type: 'button',
          class: 'pm-workspace-draft-card pm-ui-card pm-ui-card--dashed',
          onClick: () => {
            draftChosen.value = true
            dialog.value = true
          },
        }, [
          h('span', { style: { display: 'flex', alignItems: 'center', gap: 'var(--pm-space-2)', color: 'var(--pm-color-ink)', fontSize: '0.9375rem', fontWeight: 600 } }, [
            h('span', { style: { color: 'var(--pm-color-accent)', display: 'inline-flex' } }, [h(PmIcon, { name: 'sparkle', size: 16 })]),
            t.value.draftCard,
          ]),
          h('span', t.value.draftCardHint),
        ])
      : null)
  },
})

/** The home page's card of the latest changes (the `home` slot), each tagged with its origin. */
export const RecentChanges = defineComponent({
  name: 'PmWorkspaceRecent',
  setup() {
    const t = useMessages(WORKSPACE_MESSAGES)
    const editor = useEditor()
    const revisions = shallowRef<HistoryRevision[]>([])
    const load = async () => {
      try {
        revisions.value = (await call<RevisionsAnswer>('revisions?limit=12')).revisions
      } catch {
        revisions.value = []
      }
    }
    onMounted(() => void load())
    onDocumentsChange(() => void load())
    return () => {
      if (!editor.value) return null
      const find = finder(revisions.value)
      return h(PmCard, { class: 'pm-workspace-recent' }, () => [
        h('h2', { class: 'pm-ui-heading' }, t.value.recent),
        revisions.value.length === 0
          ? h('p', { style: { margin: 0, color: 'var(--pm-color-muted)' } }, t.value.noRevisions)
          : h('ul', { class: 'pm-ui-list', style: { display: 'grid', gap: 'var(--pm-space-2)', fontSize: '0.84375rem' } }, revisions.value.slice(0, 4).map(revision => h('li', {
              key: revision.id,
              style: { display: 'flex', alignItems: 'baseline', gap: 'var(--pm-space-2)', padding: 0, border: 0 },
            }, [
              originTag(revision, t.value),
              h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, revisionLabel(revision, undoDepth(revision, find), t.value)),
              h('time', { datetime: revision.date, style: { color: 'var(--pm-color-muted)', whiteSpace: 'nowrap' } }, shortTime(revision.date)),
            ]))),
      ])
    }
  },
})

/** The status bar's entry: the workspace's git repository and its latest commit. */
export const GitStatus = defineComponent({
  name: 'PmWorkspaceGit',
  setup() {
    const t = useMessages(WORKSPACE_MESSAGES)
    const editor = useEditor()
    const git = ref<boolean>()
    const latest = ref<string>()
    const load = async () => {
      try {
        git.value = (await call<DocumentsAnswer>('documents')).git
        const [last] = git.value ? (await call<RevisionsAnswer>('revisions?limit=1')).revisions : []
        latest.value = last?.date
      } catch {
        git.value = undefined
      }
    }
    onMounted(() => void load())
    onDocumentsChange(() => void load())
    return () => (editor.value && git.value !== undefined
      ? h('span', { class: 'pm-workspace-git', style: { display: 'inline-flex', alignItems: 'center', gap: 'var(--pm-space-1)' } }, [
          h(PmIcon, { name: 'branch', size: 14 }),
          git.value ? t.value.git(latest.value && shortTime(latest.value)) : t.value.noGit,
        ])
      : null)
  },
})

/** The address of the MCP service of this server (`/mcp`, docs/architecture.md 10.2). */
function mcpAddress(): string {
  return `${location.origin}/mcp`
}

/**
 * The usage guide of the home page (P-120): the document operations, edit
 * mode, the AI's changes, the model settings, the history, an outside agent
 * over MCP, and the documentation site.
 */
export const Guide = defineComponent({
  name: 'PmWorkspaceGuide',
  setup() {
    const t = useMessages(WORKSPACE_MESSAGES)
    const editor = useEditor()
    const open = ref(false)
    const place = useToolbarPlace()
    return () => (editor.value
      ? h(PmToolbarEntry, { 'name': 'pm-workspace-guide', 'icon': 'help', 'label': t.value.guide, 'closeLabel': t.value.close, 'open': open.value, 'onUpdate:open': (next: boolean) => open.value = next }, () => [
          h('ol', { class: 'pm-ui-list', style: { counterReset: 'none', maxWidth: place === 'activity' ? undefined : '28rem' } }, t.value.guideTopics(mcpAddress()).map(topic => h('li', { key: topic.title }, [
            h('h3', { style: { margin: '0 0 var(--pm-space-1)', fontSize: 'var(--pm-text-md)', fontWeight: 600 } }, topic.title),
            h('p', { style: { margin: 0, color: 'var(--pm-color-muted)' } }, topic.text),
          ]))),
          DOCS_SITE_URL
            ? h('p', { style: { margin: 'var(--pm-space-3) 0 0' } }, [h('a', { class: 'pm-ui-link', href: DOCS_SITE_URL, target: '_blank', rel: 'noopener' }, t.value.docsSite)])
            : null,
        ])
      : null)
  },
})
