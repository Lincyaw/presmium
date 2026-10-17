/** What the workspace's browser plugin says, in each UI language (N-07). */
import type { Locale } from '@presmium/kernel/contracts'
import type { LockKind } from './api.ts'
import type { RevisionOperation } from './revisions.ts'

export interface WorkspaceMessages {
  edit: string
  leaveEdit: string
  history: string
  noRevisions: string
  revert: string
  reverted: string
  conflicts(files: string[]): string
  documents: string
  create: string
  dir: string
  title: string
  template: string
  submit: string
  /** The new document is drafted by the agent (P-121); `provider` names the model's service provider (N-08). */
  draft(provider: string | undefined): string
  draftRequest: string
  /** The agent drafts the new document; the page opens it once the draft is committed. */
  drafting(dir: string): string
  /** The draft waits for its requester's review (`settings.presmium.assistant.review: required`). */
  draftReview: string
  accept: string
  reject: string
  draftFailed(reason: string | undefined): string
  openDocument(dir: string): string
  rename: string
  copy: string
  remove: string
  to: string
  confirmDelete(dir: string): string
  close: string
  origin: Record<'agent' | 'document' | 'editor', string>
  /** How the history names a document operation (its commit's summary stays as written, F-55). */
  operation(operation: RevisionOperation): string
  /** How the history names the undo of a change, named as `label`. */
  revertOf(label: string): string
  /** A document operation or an undo refused while another writer holds the document (F-09); `document` '' is the root's. */
  locked(document: string, by: LockKind): string
}

export const WORKSPACE_MESSAGES: Record<Locale, WorkspaceMessages> = {
  'zh-CN': {
    edit: '编辑',
    leaveEdit: '退出编辑',
    history: '修改历史',
    noRevisions: '还没有修改。',
    revert: '撤销',
    reverted: '已撤销',
    conflicts: files => `撤销与之后的修改冲突，没有改动：${files.join('、')}`,
    documents: '管理文档',
    create: '新建文档',
    dir: '目录',
    title: '标题',
    template: '模板',
    submit: '新建',
    draft: provider => `由 agent 起草${provider ? `（模型由 ${provider} 提供）` : ''}`,
    draftRequest: '起草的要求',
    drafting: dir => `agent 正在起草 ${dir}，完成并提交后打开它。`,
    draftReview: '初稿等待审阅，接受后提交：',
    accept: '接受',
    reject: '拒绝',
    draftFailed: reason => `起草没有完成${reason ? `：${reason}` : '。'}`,
    openDocument: dir => `打开 ${dir}`,
    rename: '重命名',
    copy: '复制',
    remove: '删除',
    to: '新目录',
    confirmDelete: dir => `删除文档 ${dir}？之后可以在修改历史中撤销。`,
    close: '关闭',
    origin: { agent: 'agent 修改', document: '文档操作', editor: '编辑' },
    operation: o => o.op === 'create' ? `新建文档 ${o.dir}` : o.op === 'delete' ? `删除文档 ${o.dir}` : o.op === 'rename' ? `重命名文档 ${o.dir} 为 ${o.to}` : `复制文档 ${o.dir} 为 ${o.to}`,
    revertOf: label => `撤销「${label}」`,
    locked: (document, by) => `${document ? `文档 ${document} ` : '这份文档'}现在不能修改：${by === 'agent' ? 'agent 的修改任务正在进行或等待审阅' : by === 'revert' ? '一项修改正在撤销' : '一项文档操作正在进行'}，完成后再试。`,
  },
  'en': {
    edit: 'Edit',
    leaveEdit: 'Stop editing',
    history: 'History',
    noRevisions: 'No changes yet.',
    revert: 'Revert',
    reverted: 'Reverted',
    conflicts: files => `The revert conflicts with later changes; nothing changed: ${files.join(', ')}`,
    documents: 'Documents',
    create: 'New document',
    dir: 'Directory',
    title: 'Title',
    template: 'Template',
    submit: 'Create',
    draft: provider => `Draft with the agent${provider ? ` (model by ${provider})` : ''}`,
    draftRequest: 'What to write',
    drafting: dir => `The agent is drafting ${dir}; it opens once the draft is committed.`,
    draftReview: 'The draft waits for your review; accepting commits it:',
    accept: 'Accept',
    reject: 'Reject',
    draftFailed: reason => `The draft did not finish${reason ? `: ${reason}` : '.'}`,
    openDocument: dir => `Open ${dir}`,
    rename: 'Rename',
    copy: 'Copy',
    remove: 'Delete',
    to: 'New directory',
    confirmDelete: dir => `Delete the document ${dir}? The history can revert it.`,
    close: 'Close',
    origin: { agent: 'agent change', document: 'document operation', editor: 'edit' },
    operation: o => o.op === 'create' ? `Create document ${o.dir}` : o.op === 'delete' ? `Delete document ${o.dir}` : o.op === 'rename' ? `Rename document ${o.dir} to ${o.to}` : `Copy document ${o.dir} to ${o.to}`,
    revertOf: label => `Revert "${label}"`,
    locked: (document, by) => `${document ? `The document ${document}` : 'This document'} cannot change now: ${by === 'agent' ? 'an agent\'s change task runs or waits for its review' : by === 'revert' ? 'a change is being undone' : 'a document operation is under way'}. Try again once it is done.`,
  },
}
