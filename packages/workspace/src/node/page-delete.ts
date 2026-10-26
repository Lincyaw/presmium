import { fnv1a64, irBlocks, isRecord, jsonResponse, pageIncomingReferences, pageRemovalTargets, removePageSource } from '@lincyaw/kernel'
import { WORKSPACE_CONFIG } from '@lincyaw/compiler'
import type { IRBlock, IRSection, MdastNode, PageDeleteAnswer, PageDeletePlan, RequestContext, Route } from '@lincyaw/kernel'
import { listDocuments, readWorkspaceConfig } from './config.ts'
import type { WorkspaceConfig } from './config.ts'
import { catchRequestErrors, RequestError } from './errors.ts'
import { lockedError } from './locks.ts'
import type { DocumentLocks } from './locks.ts'
import type { Revisions } from './revisions.ts'
import type { SourceEditor } from './source-editor.ts'
import type { WorkbenchApi } from './workbench-api.ts'

interface Options { config: WorkspaceConfig, editor: SourceEditor, workbench: WorkbenchApi, locks: DocumentLocks, revisions?: Revisions }
const markdown = (node: MdastNode): MdastNode => ({ ...node, position: undefined, ...node.children ? { children: node.children.map(markdown) } : {} })
const blockSemantic = (block: IRBlock): unknown => ({ ...block, source: undefined, node: block.node.type === 'markdown' ? { ...block.node, mdast: markdown(block.node.mdast) } : block.node.type === 'component' ? { ...block.node, ...block.node.children ? { children: block.node.children.map(blockSemantic) } : {}, ...block.node.fallback ? { fallback: markdown(block.node.fallback) } : {} } : block.node })
const semantic = (section: IRSection): string => JSON.stringify({ ...section, index: undefined, source: undefined, blocks: section.blocks.map(blockSemantic) })

/** Source ranges and incoming links are checked again at confirmation, never trusted from the browser's plan. */
export function pageDeleteRoute({ config, editor, workbench, locks, revisions }: Options): Route {
  const inspect = async (ctx: RequestContext, section: string) => {
    const answer = await workbench.ir(ctx.document)
    const page = answer.doc.sections.find(page => page.id === section)
    if (!page) throw new RequestError(409, 'page-context-changed')
    const source = editor.read(editor.scope(ctx.document), answer.doc.meta.entry, ctx.member)
    if (answer.sourceFingerprints?.[source.path] !== fnv1a64(source.content)) throw new RequestError(409, 'page-context-changed')
    const blocks = [...irBlocks(page.blocks)]
    const plan: PageDeletePlan = {
      document: ctx.document, section, revision: answer.revision, source: { path: source.path, version: source.version },
      counts: { steps: page.steps + 1, blocks: blocks.length, narration: blocks.filter(block => block.role === 'narration').length },
      last: answer.doc.sections.length === 1, allowed: true,
    }
    const emptyTitle = answer.doc.meta.lang?.startsWith('en') ? 'Untitled page' : '未命名页面'
    let removal
    try { removal = removePageSource(answer.doc, section, source.content, emptyTitle, answer.sourceCapabilities) }
    catch (error) { plan.allowed = false; plan.reason = error instanceof Error ? error.message : 'page-boundary'; return { plan, answer, source } }
    const targets = pageRemovalTargets(answer.doc, section, source.content)
    const others = listDocuments(config).filter(document => document.dir !== ctx.document)
    const checked = await Promise.all(others.map(async document => ({ document: document.dir, answer: await workbench.ir(document.dir) })))
    const references = checked.flatMap(other => pageIncomingReferences(other.answer.doc, answer.doc.meta.entry, targets).map(reference => ({ document: other.document, ...reference })))
    const dependencies = new Map<string, string>()
    if (!config.singleDeck) {
      const workspaceSource = editor.read(editor.scope(''), WORKSPACE_CONFIG, ctx.member)
      const currentConfig = readWorkspaceConfig(config.root)
      if (JSON.stringify(currentConfig.documents) !== JSON.stringify(config.documents)) throw new RequestError(409, 'page-references-unavailable')
      dependencies.set(workspaceSource.path, workspaceSource.version)
      const workspaceView = { ...answer.doc, meta: { ...answer.doc.meta, entry: WORKSPACE_CONFIG }, config: { ...answer.doc.config, presmium: { site: currentConfig.site } }, sections: [] }
      if (pageIncomingReferences(workspaceView, answer.doc.meta.entry, targets).length) references.push({ document: '', section })
    }
    for (const other of checked) {
      if (!other.answer.sourceFingerprints?.[other.answer.doc.meta.entry]) throw new RequestError(409, 'page-references-unavailable')
      if (other.answer.sourceFingerprints[source.path]) references.push({ document: other.document, section: other.answer.doc.sections.find(page => page.source.file === source.path)?.id ?? '' })
      for (const [path, fingerprint] of Object.entries(other.answer.sourceFingerprints)) {
        const opened = editor.read(editor.scope(''), path, ctx.member)
        if (fnv1a64(opened.content) !== fingerprint) throw new RequestError(409, 'page-references-unavailable')
        dependencies.set(path, opened.version)
      }
    }
    if (references.length) { plan.allowed = false; plan.reason = 'page-referenced'; plan.references = references }
    return { plan, answer, source, removal, dependencies }
  }
  return {
    role: 'editor', maxBody: 8192,
    handle: (request, ctx) => catchRequestErrors(async () => {
      if (request.method === 'GET') return jsonResponse((await inspect(ctx, new URL(request.url).searchParams.get('section') ?? '')).plan)
      if (request.method !== 'POST') throw new RequestError(405, 'GET or POST')
      const body: unknown = await request.json().catch(() => undefined)
      if (!isRecord(body) || typeof body.section !== 'string' || typeof body.revision !== 'string' || typeof body.base !== 'string') throw new RequestError(400, '{ section, revision, base }')
      // Other Studio writes cannot add a new incoming reference between this check and the commit.
      const directories = listDocuments(config).map(document => document.dir)
      // The empty document key is the global lock. The source save itself owns
      // that lock when editing a root document; dependency versions cover the
      // interval before it is acquired.
      const claimed = locks.claimAll(ctx.document === '' ? [] : directories.filter(directory => directory !== ctx.document && directory !== ''), 'editor:page-delete-check')
      if ('holder' in claimed) throw lockedError(claimed.document, claimed.holder)
      try {
        const { plan, answer, source, removal, dependencies } = await inspect(ctx, body.section)
        if (!plan.allowed || !removal) throw new RequestError(409, plan.reason ?? 'page-boundary')
        if (plan.revision !== body.revision || source.version !== body.base) throw new RequestError(409, 'page-context-changed')
        const expected = answer.doc.sections.filter(page => page.id !== body.section)
        let changed = answer
        const saved = await editor.save(editor.scope(ctx.document), source.path, removal.content, source.version, ctx.member, async path => {
          const started = Date.now()
          while (changed.revision === answer.revision) {
            if (Date.now() - started > 15000) throw new RequestError(409, 'page-compile-timeout')
            await new Promise(resolve => setTimeout(resolve, 20))
            changed = await workbench.ir(ctx.document)
          }
          const actual = changed.doc.sections
          if (editor.read(editor.scope(ctx.document), source.path, ctx.member).content !== removal.content) throw new RequestError(409, 'page-context-changed')
          for (const [path, version] of dependencies ?? []) if (editor.read(editor.scope(''), path, ctx.member).version !== version) throw new RequestError(409, 'page-references-unavailable')
          if (removal.retainedEmpty ? actual.length !== 1 || actual[0]?.id !== body.section || actual[0]?.blocks.length !== 0
            : actual.length !== expected.length || expected.some((page, index) => {
              // The compiler treats the first H1 as its cover. Removing the old
              // cover normalizes the next unchanged H1 from depth 1 to 0.
              const normalized = index === 0 && page.depth === 1 && actual[index]?.depth === 0 ? { ...page, depth: 0 } : page
              return actual[index]?.id !== page.id || semantic(actual[index]!) !== semantic(normalized)
            })) throw new RequestError(409, 'page-result-changed')
          if (JSON.stringify(listDocuments(config).map(document => document.dir)) !== JSON.stringify(directories)) throw new RequestError(409, 'page-context-changed')
          return await revisions?.commit({ files: [path], message: answer.doc.meta.lang?.startsWith('en') ? `Delete page “${answer.doc.sections.find(page => page.id === body.section)!.title}”` : `删除页面“${answer.doc.sections.find(page => page.id === body.section)!.title}”`, origin: { kind: 'editor', member: ctx.member } })
        })
        return jsonResponse({ document: ctx.document, selected: removal.selected, retainedEmpty: removal.retainedEmpty, sourceVersion: saved.version, irRevision: changed.revision, ...saved.revision ? { commit: saved.revision } : {} } satisfies PageDeleteAnswer)
      } finally { claimed.release() }
    }),
  }
}

