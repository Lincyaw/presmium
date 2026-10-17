/** What the workspace's browser plugin says, in each UI language (N-07). */
import type { Locale } from '@presmium/kernel/contracts'
import type { LockKind } from './api.ts'
import type { RevisionOperation } from './revisions.ts'

/**
 * The documentation site (P-145), which the usage guide links; empty until it
 * is published (WP-93c), and the guide leaves the link out meanwhile.
 */
export const DOCS_SITE_URL = ''

/** One topic of the home page's usage guide (P-120). */
export interface GuideTopic {
  title: string
  text: string
}

export interface WorkspaceMessages {
  edit: string
  leaveEdit: string
  history: string
  noRevisions: string
  revert: string
  reverted: string
  /** The undo of an undo (F-55): its button, and what an undo that was redone says. */
  redo: string
  redone: string
  conflicts(files: string[]): string
  documents: string
  /** The heading of the dialog's list of the documents there are. */
  existing: string
  create: string
  /** The home page's main action: the document dialog, at its form. */
  newDocument: string
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
  /** The dashed card of the home page that starts an agent's draft, and its hint. */
  draftCard: string
  draftCardHint: string
  rename: string
  copy: string
  remove: string
  to: string
  confirmDelete(dir: string): string
  close: string
  origin: Record<'agent' | 'document' | 'editor', string>
  /** The short tag of a change's origin (AI, 编辑, 文档). */
  originTag: Record<'agent' | 'document' | 'editor', string>
  /** How the history names a document operation (its commit's summary stays as written, F-55). */
  operation(operation: RevisionOperation): string
  /** How the history names the undo of a change, named as `label`. */
  revertOf(label: string): string
  /** How the history names the redo of a change (the undo of its undo, F-55), named as `label`. */
  redoOf(label: string): string
  /** A document operation or an undo refused while another writer holds the document (F-09); `document` '' is the root's. */
  locked(document: string, by: LockKind): string
  /** The home page's card of the latest changes. */
  recent: string
  /** The status bar: the workspace's git repository, and the time of its latest change. */
  git(latest: string | undefined): string
  /** The status bar, when the server names them: the branch and the number of files with changes not committed. */
  branch(name: string, uncommitted: number): string
  noGit: string
  /** The usage guide of the home page (P-120): its title, its topics (`mcp` is the MCP address) and the documentation site. */
  guide: string
  guideTopics(mcp: string): GuideTopic[]
  docsSite: string
  /** The source editor (P-124): its pane, the open files and their menu, a file not saved. */
  source: string
  openFiles: string
  filesMenu: string
  closeFile: string
  unsaved: string
  noFile: string
  /** A file the editor does not open (not text), and a list of files cut at its limit. */
  binary(path: string): string
  truncated: string
  /** The problems panel: its tab with the count, and none. */
  problems(count: number): string
  noProblems: string
  /** The status bar: the file's language, its encoding and the cursor's line. */
  line(line: number): string
  /** A save refused while another writer holds the document (an agent's review): the author's text stays. */
  saveLocked(by: LockKind): string
  /** A file changed on disk since it was opened, by an agent or another editor, with the editor's text not saved. */
  changedOnDisk(path: string): string
  merge: string
  reload: string
  retry: string
  /** After a merge: the places marked as conflicts, or none. */
  merged(conflicts: number): string
  /** How the conflict markers name the two sides. */
  mergeMine: string
  mergeTheirs: string
  saveFailed(reason: string): string
  /** A save of the workspace's configuration: serve reads it when it starts. */
  configSaved: string
  /** The changes not committed (P-124): their list, its heading, the commit with its message, the discard. */
  uncommitted: string
  noUncommitted: string
  commitChanges(count: number): string
  commitMessage: string
  commit: string
  discard: string
  confirmDiscard(count: number): string
  changeKind: Record<'added' | 'modified' | 'deleted', string>
  /** The home page's file tree: a directory's toggle and the workspace's configuration. */
  fileTree: string
}

export const WORKSPACE_MESSAGES: Record<Locale, WorkspaceMessages> = {
  'zh-CN': {
    edit: '编辑',
    leaveEdit: '退出编辑',
    history: '修改历史',
    noRevisions: '还没有修改。',
    revert: '撤销',
    reverted: '已撤销',
    redo: '重做',
    redone: '已重做',
    conflicts: files => `撤销与之后的修改冲突，没有改动：${files.join('、')}`,
    documents: '管理文档',
    existing: '现有文档',
    create: '新建文档',
    newDocument: '新建文档',
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
    draftCard: '由 AI 起草一份文档',
    draftCardHint: '写一句主题，例如“给高中生讲清楚哈希表”。',
    rename: '重命名',
    copy: '复制',
    remove: '删除',
    to: '新目录',
    confirmDelete: dir => `删除文档 ${dir}？之后可以在修改历史中撤销。`,
    close: '关闭',
    origin: { agent: 'agent 修改', document: '文档操作', editor: '编辑' },
    originTag: { agent: 'AI', document: '文档', editor: '编辑' },
    operation: o => o.op === 'create' ? `新建文档 ${o.dir}` : o.op === 'delete' ? `删除文档 ${o.dir}` : o.op === 'rename' ? `重命名文档 ${o.dir} 为 ${o.to}` : `复制文档 ${o.dir} 为 ${o.to}`,
    revertOf: label => `撤销「${label}」`,
    redoOf: label => `重做「${label}」`,
    locked: (document, by) => `${document ? `文档 ${document} ` : '这份文档'}现在不能修改：${by === 'agent' ? 'agent 的修改任务正在进行或等待审阅' : by === 'revert' ? '一项修改正在撤销' : '一项文档操作正在进行'}，完成后再试。`,
    recent: '最近修改',
    git: latest => `git${latest ? ` · 最近提交 ${latest}` : ''}`,
    branch: (name, uncommitted) => `${name}${uncommitted ? ` · ${uncommitted} 处未提交` : ''}`,
    noGit: '不是 git 仓库',
    guide: '使用说明',
    guideTopics: mcp => [
      { title: '管理文档', text: '点“新建文档”从模板新建一份文档，或交给 AI 起草；在“管理文档”中重命名、复制、删除。每个操作都是一次提交。' },
      { title: '编辑模式', text: '打开一份文档，点工具栏中的“编辑”进入编辑模式：左边改源码，Ctrl+S 保存，右边的预览随之更新；点选预览中的一段，源码跳到它的行。没有提交的修改列在“修改历史”顶部，写一句说明后提交，或放弃。' },
      { title: 'AI 修改', text: '编辑模式中的“AI 修改”把批注与对话交给 agent 修改源码；修改先由你审阅，接受后提交。' },
      { title: '模型设置', text: '活动栏底部的“模型设置”填写服务提供方、地址、密钥与模型名；设置了环境变量时以环境变量为准。' },
      { title: '修改历史', text: '“修改历史”列出每次提交，来自 AI、编辑或文档操作；每一项都可以撤销，撤销之后可以重做。' },
      { title: '连接外部 agent（MCP）', text: `Claude Code、Codex 等外部 agent 经 ${mcp} 读讲义、运行代码、跳转放映，连接方法见 presmium serve 启动时的输出。` },
    ],
    docsSite: '文档站',
    source: '源码',
    openFiles: '打开的文件',
    filesMenu: '打开文件',
    closeFile: '关闭当前文件',
    unsaved: '未保存',
    noFile: '没有打开的文件：在预览中点选一段，或从“打开文件”中选一个。',
    binary: path => `${path} 不是文本文件，不能在这里编辑。`,
    truncated: '文件太多，只列出前 2000 个。',
    problems: count => `问题 ${count}`,
    noProblems: '没有问题。',
    line: line => `第 ${line} 行`,
    saveLocked: by => `${by === 'agent' ? 'AI 的修改任务正在进行或等待审阅' : by === 'revert' ? '一项修改正在撤销' : '一项文档操作正在进行'}，现在不能保存。你的修改留在编辑器中，完成后再保存。`,
    changedOnDisk: path => `${path} 在打开之后被修改了（AI 或别的编辑器）。合并保留双方的修改；重新载入放弃编辑器中没有保存的修改。`,
    merge: '合并',
    reload: '重新载入',
    retry: '再次保存',
    merged: conflicts => (conflicts ? `已合并，${conflicts} 处冲突用 <<<<<<< 与 >>>>>>> 标出，改好后保存。` : '已合并双方的修改，保存后写入文件。'),
    mergeMine: '编辑器中的修改',
    mergeTheirs: '磁盘上的修改',
    saveFailed: reason => `没有保存：${reason}`,
    configSaved: '已保存。presmium.workspace.yaml 的修改在重新启动 presmium serve 后生效。',
    uncommitted: '未提交的修改',
    noUncommitted: '没有未提交的修改。',
    commitChanges: count => `提交 ${count} 处修改`,
    commitMessage: '说明这次修改',
    commit: '提交',
    discard: '放弃',
    confirmDiscard: count => `放弃 ${count} 个文件中未提交的修改？放弃之后不能撤销。`,
    changeKind: { added: '新增', modified: '修改', deleted: '删除' },
    fileTree: '文件',
  },
  'en': {
    edit: 'Edit',
    leaveEdit: 'Stop editing',
    history: 'History',
    noRevisions: 'No changes yet.',
    revert: 'Revert',
    reverted: 'Reverted',
    redo: 'Redo',
    redone: 'Redone',
    conflicts: files => `The revert conflicts with later changes; nothing changed: ${files.join(', ')}`,
    documents: 'Documents',
    existing: 'Existing documents',
    create: 'New document',
    newDocument: 'New document',
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
    draftCard: 'Draft a document with AI',
    draftCardHint: 'Write one line about it, e.g. "hash tables for high-school students".',
    rename: 'Rename',
    copy: 'Copy',
    remove: 'Delete',
    to: 'New directory',
    confirmDelete: dir => `Delete the document ${dir}? The history can revert it.`,
    close: 'Close',
    origin: { agent: 'agent change', document: 'document operation', editor: 'edit' },
    originTag: { agent: 'AI', document: 'Document', editor: 'Edit' },
    operation: o => o.op === 'create' ? `Create document ${o.dir}` : o.op === 'delete' ? `Delete document ${o.dir}` : o.op === 'rename' ? `Rename document ${o.dir} to ${o.to}` : `Copy document ${o.dir} to ${o.to}`,
    revertOf: label => `Revert "${label}"`,
    redoOf: label => `Redo "${label}"`,
    locked: (document, by) => `${document ? `The document ${document}` : 'This document'} cannot change now: ${by === 'agent' ? 'an agent\'s change task runs or waits for its review' : by === 'revert' ? 'a change is being undone' : 'a document operation is under way'}. Try again once it is done.`,
    recent: 'Recent changes',
    git: latest => `git${latest ? ` · last commit ${latest}` : ''}`,
    branch: (name, uncommitted) => `${name}${uncommitted ? ` · ${uncommitted} uncommitted` : ''}`,
    noGit: 'not a git repository',
    guide: 'How to use',
    guideTopics: mcp => [
      { title: 'Documents', text: 'New document makes a document from a template, or lets the AI draft it; Documents renames, copies and deletes them. Each operation is one commit.' },
      { title: 'Edit mode', text: 'Open a document and choose Edit in its toolbar: change the source at the left and save with Ctrl+S; the preview at the right follows. Pick a part of the preview to go to its lines. Uncommitted changes head the history: commit them with a line saying what changed, or discard them.' },
      { title: 'AI changes', text: 'In edit mode, AI changes hands annotations and the conversation to the agent, which changes the source; you review each change before it is committed.' },
      { title: 'Model settings', text: 'Model settings, at the foot of the activity bar, takes the service provider, address, key and model name; environment variables take precedence.' },
      { title: 'History', text: 'History lists every commit, from the AI, an edit or a document operation; each can be reverted, and a revert redone.' },
      { title: 'Connect an outside agent (MCP)', text: `Claude Code, Codex and other agents read the lectures, run code and move the slides through ${mcp}; presmium serve prints how to connect when it starts.` },
    ],
    docsSite: 'Documentation',
    source: 'Source',
    openFiles: 'Open files',
    filesMenu: 'Open a file',
    closeFile: 'Close this file',
    unsaved: 'not saved',
    noFile: 'No file is open: pick a part of the preview, or choose one under "Open a file".',
    binary: path => `${path} is not a text file; it cannot be edited here.`,
    truncated: 'Too many files: the first 2000 are listed.',
    problems: count => `Problems ${count}`,
    noProblems: 'No problems.',
    line: line => `Ln ${line}`,
    saveLocked: by => `${by === 'agent' ? 'An AI change task runs or waits for its review' : by === 'revert' ? 'A change is being undone' : 'A document operation is under way'}: the file cannot be saved now. Your changes stay in the editor; save them once it is done.`,
    changedOnDisk: path => `${path} changed since it was opened (by the AI or another editor). Merge keeps both sides' changes; Reload drops the editor's unsaved changes.`,
    merge: 'Merge',
    reload: 'Reload',
    retry: 'Save again',
    merged: conflicts => (conflicts ? `Merged; ${conflicts} conflict${conflicts === 1 ? ' is' : 's are'} marked with <<<<<<< and >>>>>>>: resolve, then save.` : 'Both sides\' changes are merged; save to write them.'),
    mergeMine: 'the editor\'s changes',
    mergeTheirs: 'the changes on disk',
    saveFailed: reason => `Not saved: ${reason}`,
    configSaved: 'Saved. Changes of presmium.workspace.yaml apply once presmium serve starts again.',
    uncommitted: 'Uncommitted changes',
    noUncommitted: 'No uncommitted changes.',
    commitChanges: count => `Commit ${count} change${count === 1 ? '' : 's'}`,
    commitMessage: 'What changed',
    commit: 'Commit',
    discard: 'Discard',
    confirmDiscard: count => `Discard the uncommitted changes of ${count} file${count === 1 ? '' : 's'}? This cannot be undone.`,
    changeKind: { added: 'added', modified: 'modified', deleted: 'deleted' },
    fileTree: 'Files',
  },
}
