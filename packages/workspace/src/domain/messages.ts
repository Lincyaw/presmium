/** What the workspace's browser plugin says, in each UI language (N-07). */
import type { Locale } from '@presmium/kernel/contracts'

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
  requestExecution(count: number): string
  executionPending: string
  close: string
  origin: Record<'agent' | 'document' | 'editor', string>
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
    requestExecution: count => `请求执行（${count}）`,
    executionPending: '等待所有者确认执行',
    close: '关闭',
    origin: { agent: 'agent 修改', document: '文档操作', editor: '编辑' },
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
    requestExecution: count => `Request execution (${count})`,
    executionPending: 'Waiting for the owner to allow the execution',
    close: 'Close',
    origin: { agent: 'agent change', document: 'document operation', editor: 'edit' },
  },
}
