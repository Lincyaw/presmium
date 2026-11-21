import type { DocumentTreeService, TreeOperation } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'

const service = (call: Call): DocumentTreeService => { if (!call.host.documentTree) throw Object.assign(new Error('tree-host-unavailable'), { status: 503 }); return call.host.documentTree }
const id = (description: string) => ({ type: 'string', minLength: 1, maxLength: 200, description })
const ID = { id: id('The document ID (get_tree: the keys of nodes; a document\'s own `id` field).') }
const PLACE = {
  parent: { type: ['string', 'null'], minLength: 1, maxLength: 200, description: 'The parent document\'s ID, or null for the top level of the workspace.' },
  after: { type: ['string', 'null'], minLength: 1, maxLength: 200, description: 'The sibling to place it after; null or absent places it first among the parent\'s children.' },
}
const str = (value: unknown) => typeof value === 'string' ? value : ''
const place = (value: unknown) => typeof value === 'string' ? value : null

/** A tree operation asked of the workspace by an agent: approved like other workspace changes, recorded as the agent's. */
async function operate(call: Call, operation: TreeOperation) {
  if (call.caller.document !== undefined) throw Object.assign(new Error('tree-permission-denied'), { status: 403 })
  // Asked in the workspace's language: the tree belongs to no one document.
  const lang = (await call.host.documents()).find(document => document.lang)?.lang ?? 'zh-CN'
  await call.approve('operate', m => m.treeChange, { scope: 'workspace', lang })
  return service(call).apply(operation, call.caller.member, 'agent')
}

const REFERENCES = 'To cite a document, page or block inline, put a reference node in text with plan_document_change/apply_document_change (updateText or a replacement): { "type": "reference", "target": { "document": "<document ID>", "section"?: "<page ID>", "block"?: "<block ID>" }, "label"?: "<text instead of the title>", "fallback": "<the target\'s current title>" }. To show another document\'s block as a synced block, insert { "id": "<new block ID>", "type": "embed", "source": { "document": "<document ID>", "block": "<block ID>" } } with insertBlock and make it visible in a step with setStepState (its state and parameters address the source component\'s); its content is edited only in the source.'

/** The document tree's tools: reads, and the tree operations, which map one to one to the workspace's (`tree/operation`). */
export const DOCUMENT_TREE_TOOLS: ToolSpec[] = [
  { name: 'get_tree', kind: 'read', structured: true,
    description: 'The workspace\'s document tree: roots and every node (id, title, folder path, parent, rank, depth, children in display order, issues), and the trash (trashed documents with what was trashed along). Documents are addressed by ID in the tree tools; list_documents gives folders.',
    run: async call => service(call).tree() },
  { name: 'search_documents', kind: 'read', structured: true,
    description: `Find documents by title (first), then by page title and block text; each hit has its ancestors' titles and, for text, the matching sentence and its page and block. Use it to find the IDs a reference or synced block needs. ${REFERENCES}`,
    properties: { query: { type: 'string', minLength: 1, maxLength: 200 }, limit: { type: 'integer', minimum: 1, maximum: 100, description: 'At most this many hits (20).' } }, required: ['query'],
    run: async call => ({ hits: service(call).search(str(call.args.query), typeof call.args.limit === 'number' ? call.args.limit : 20) }) },
  { name: 'get_backlinks', kind: 'read', structured: true,
    description: 'A document\'s references in both directions: incoming (who cites it inline or shows its blocks as synced blocks, with the sentence around each reference) and outgoing (what it cites, with current titles and missing or trashed targets).',
    properties: { document: id('The document ID.') }, required: ['document'],
    run: async call => service(call).links(str(call.args.document)) },
  { name: 'get_document_preview', kind: 'read', structured: true,
    description: 'What a reference to a document, page or block shows on hover: title, ancestors, first paragraph, pages, steps and how many documents cite it; missing or trashed when so.',
    properties: { document: id('The document ID.'), section: id('A page ID in it.'), block: id('A block ID in it.') }, required: ['document'],
    run: async call => service(call).preview(str(call.args.document), { ...typeof call.args.section === 'string' ? { section: call.args.section } : {}, ...typeof call.args.block === 'string' ? { block: call.args.block } : {} }) },
  { name: 'create_document', kind: 'operate', structured: true,
    description: 'Creates a document in the tree: a new folder docs/<slug>/ with an empty first page, under parent after a sibling. A child inherits its parent\'s language, plugins and forms. Returns the tree, the new document\'s ID (created) and its revision.',
    properties: { title: { type: 'string', minLength: 1, maxLength: 200 }, ...PLACE }, required: ['title', 'parent'],
    run: call => operate(call, { type: 'create', title: str(call.args.title), parent: place(call.args.parent), ...call.args.after !== undefined ? { after: place(call.args.after) } : {} }) },
  { name: 'move_document', kind: 'operate', structured: true,
    description: 'Moves a document (with its children) to another place in the tree; its folder stays where it is. Refused with tree.cycle under its own descendant.',
    properties: { ...ID, ...PLACE }, required: ['id', 'parent'],
    run: call => operate(call, { type: 'move', id: str(call.args.id), parent: place(call.args.parent), ...call.args.after !== undefined ? { after: place(call.args.after) } : {} }) },
  { name: 'rename_document', kind: 'operate', structured: true,
    description: 'Changes a document\'s title (not its folder). References that show the title follow it.',
    properties: { ...ID, title: { type: 'string', minLength: 1, maxLength: 200 } }, required: ['id', 'title'],
    run: call => operate(call, { type: 'rename', id: str(call.args.id), title: str(call.args.title) }) },
  { name: 'duplicate_document', kind: 'operate', structured: true,
    description: 'Copies a document (not its children) into a new folder with a new ID, placed right after it; references inside it are unchanged.',
    properties: { ...ID }, required: ['id'],
    run: call => operate(call, { type: 'duplicate', id: str(call.args.id) }) },
  { name: 'trash_document', kind: 'operate', structured: true,
    description: 'Moves a document and its children to the trash (.trash/<id>/). References to it then show their last title; synced blocks from it still show, with a warning. restore_document brings it back.',
    properties: { ...ID }, required: ['id'],
    run: call => operate(call, { type: 'trash', id: str(call.args.id) }) },
  { name: 'restore_document', kind: 'operate', structured: true,
    description: 'Brings a trashed document (and what was trashed with it) back to its folder and its place in the tree; to the top level when its parent is gone.',
    properties: { ...ID }, required: ['id'],
    run: call => operate(call, { type: 'restore', id: str(call.args.id) }) },
  { name: 'purge_document', kind: 'operate', structured: true,
    description: 'Deletes a trashed document for good. Synced blocks that show its blocks are first converted to copies in their documents (listed in converted); references to it become missing.',
    properties: { ...ID }, required: ['id'],
    run: call => operate(call, { type: 'purge', id: str(call.args.id) }) },
  { name: 'convert_embed_to_copy', kind: 'operate', structured: true,
    description: 'Replaces a synced block with a copy of its source\'s content that this document owns: new block IDs, the files it needs copied into this document\'s folder, component definitions copied or reused.',
    properties: { document: id('The ID of the document holding the synced block.'), block: id('The synced block\'s ID.') }, required: ['document', 'block'],
    run: call => operate(call, { type: 'embed-to-copy', document: str(call.args.document), block: str(call.args.block) }) },
]
