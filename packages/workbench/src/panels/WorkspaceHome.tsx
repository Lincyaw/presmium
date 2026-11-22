import { useState } from 'react'
import type { ReactNode } from 'react'
import { PmButton, PmCard, PmIcon, PmNotice } from '../components.tsx'
import { useMessages, useTreeMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { IMPORT_MESSAGES } from '../import-messages.ts'
import { timeAgo } from '../messages.ts'
import { DocumentImportDialog } from './DocumentImportDialog.tsx'
import { MaterialsDialog } from './MaterialsDialog.tsx'
import { SearchDialog } from './WorkspaceSidebar.tsx'

/**
 * The workspace's home when it has a document tree: start a document (blank or imported), what needs attention, and
 * the documents opened recently. The tree in the sidebar is the way to every other document.
 */
export function WorkspaceHome({ actions }: { actions?: ReactNode }) {
  const t = useMessages()
  const tt = useTreeMessages()
  const workbench = useWorkbench()
  const answer = useWorkbenchState(state => state.documents)
  const tree = useWorkbenchState(state => state.documentTree)!
  const recent = useWorkbenchState(state => state.recentDocuments ?? [])
  const locale = useWorkbenchState(state => state.locale)
  const busy = useWorkbenchState(state => Boolean(state.isDocumentTreeBusy))
  const failure = useWorkbenchState(state => state.documentsFailure)
  const attention = useWorkbenchState(state => state.workspaceAttention)
  const canAskAgent = useWorkbenchState(state => Boolean(state.canAskAgent))
  const needsModel = useWorkbenchState(state => state.agentReadiness === 'missing')
  const importMessages = IMPORT_MESSAGES[locale]
  const [importing, setImporting] = useState(false)
  const [searching, setSearching] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  const [writing, setWriting] = useState(false)
  const readOnly = workbench.client.capabilities?.readOnly === true
  const canImport = Boolean(answer?.git && !answer.single && workbench.client.importDocuments && !readOnly)
  // Only the AI writes from source material: without a conversation there is no card, without a model it says so.
  const canWrite = Boolean(canAskAgent && !answer?.single && workbench.client.addDocumentMaterials && workbench.tree.available && !readOnly)
  const count = Object.keys(tree.nodes).length
  const issues = Object.values(tree.nodes).filter(node => node.issues?.length)
  const pending = answer?.migration?.documents.length ?? 0
  const shown = recent.filter(entry => tree.nodes[entry.id]).slice(0, 8)
  const { references: brokenReferences, embeds: brokenSynced } = attention ?? {}
  const create = () => void workbench.tree.create(null)
  const upgrade = async () => {
    setUpgrading(true)
    try { workbench.tree.toast(tt.upgraded((await workbench.migrateWorkspace()).documents.length)) } catch { workbench.tree.toast(tt.operationFailed(tt.failureGeneric), 'danger') } finally { setUpgrading(false) }
  }
  return (
    <section className="pmw-home pmw-workspace-home" aria-labelledby="pmw-home-title">
      <header className="pmw-home__bar">
        <h1 id="pmw-home-title" className="pmw-home__title">{answer?.title ?? t.documents}</h1>
        {actions}
        {canImport && <PmButton icon="upload" onClick={() => setImporting(true)}>{importMessages.title}</PmButton>}
        {!readOnly && <PmButton variant="primary" icon="plus" loading={busy} onClick={create}>{tt.newDocument}</PmButton>}
      </header>
      <p className="pmw-muted pmw-workspace-home__meta">{tt.documentCount(count)}</p>
      {failure && <PmNotice tone="danger">{failure}</PmNotice>}
      {!readOnly && <ul className="pmw-workspace-home__start">
        <li><PmCard variant="interactive">
          <span className="pm-ui-card__icon"><PmIcon name="document" /></span>
          <button type="button" className="pm-ui-card__cover" disabled={busy} onClick={create}>{tt.blankDocument}</button>
          <p className="pm-ui-card__hint">{tt.blankDocumentHint}</p>
        </PmCard></li>
        {canImport && <li><PmCard variant="interactive">
          <span className="pm-ui-card__icon"><PmIcon name="upload" /></span>
          <button type="button" className="pm-ui-card__cover" onClick={() => setImporting(true)}>{importMessages.title}</button>
          <p className="pm-ui-card__hint">{tt.importHint}</p>
        </PmCard></li>}
        {canWrite && <li><PmCard variant="interactive">
          <span className="pm-ui-card__icon"><PmIcon name="sparkle" /></span>
          <button type="button" className="pm-ui-card__cover" disabled={busy} onClick={() => needsModel ? workbench.openAgentSetup() : setWriting(true)}>{tt.fromMaterials}</button>
          <p className="pm-ui-card__hint">{needsModel ? tt.fromMaterialsNeedsModel : tt.fromMaterialsHint}</p>
        </PmCard></li>}
      </ul>}
      {(pending > 0 || issues.length > 0 || brokenReferences || brokenSynced) && <>
        <div className="pmw-home__heading-row"><h2 className="pmw-home__heading">{tt.needsAttention}</h2></div>
        <div className="pmw-workspace-home__attention">
          {pending > 0 && workbench.client.migrateWorkspace && <PmNotice tone="warn" action={<PmButton small loading={upgrading} onClick={() => void upgrade()}>{tt.upgrade}</PmButton>}>{tt.upgradePending(pending)}</PmNotice>}
          {issues.length > 0 && <PmNotice tone="warn" action={<PmButton small onClick={() => void workbench.tree.openPlace({ document: issues[0]!.id })}>{tt.show}</PmButton>}>{tt.treeIssues(issues.length)}</PmNotice>}
          {brokenReferences && <PmNotice tone="warn" action={<PmButton small onClick={() => void workbench.tree.openPlace(brokenReferences.first)}>{tt.show}</PmButton>}>{tt.brokenReferences(brokenReferences.places, brokenReferences.documents)}</PmNotice>}
          {brokenSynced && <PmNotice tone="warn" action={<PmButton small onClick={() => void workbench.tree.openPlace(brokenSynced.first)}>{tt.show}</PmButton>}>{tt.brokenSynced(brokenSynced.places, brokenSynced.documents)}</PmNotice>}
        </div>
      </>}
      <div className="pmw-home__heading-row">
        <h2 className="pmw-home__heading">{tt.recent}</h2>
        {count > 0 && <PmButton small variant="text" onClick={() => setSearching(true)}>{tt.searchTitle}</PmButton>}
      </div>
      {shown.length === 0
        ? <p className="pmw-muted">{count === 0 && !pending ? tt.treeEmpty : tt.recentEmpty}</p>
        : <ul className="pmw-home__cards" aria-label={tt.recent}>
          {shown.map(entry => {
            const node = tree.nodes[entry.id]!
            return <li key={entry.id} className="pmw-home__card">
              <button type="button" className="pmw-home__open" onClick={() => void workbench.tree.openPlace({ document: entry.id })}>
                <span className="pmw-home__doc-icon" aria-hidden="true"><PmIcon name="document" /></span>
                <span className="pmw-home__doc-title">{node.title || tt.untitled}</span>
                <span className="pmw-workspace-home__path">{workbench.tree.ancestors(entry.id).map(item => item.title).join(' › ')}</span>
                <span className="pmw-workspace-home__time">{timeAgo(entry.at, locale)}</span>
              </button>
            </li>
          })}
        </ul>}
      {importing && <DocumentImportDialog onClose={() => setImporting(false)} onImported={result => {
        setImporting(false)
        // One document opens at once; several stay listed in the tree, the first a click away.
        const first = result.documents[0]
        const open = () => { if (first) void workbench.openDocument(first.dir) }
        workbench.tree.toast(importMessages.done(result.documents.length, result.unresolved, result.warnings), 'neutral', result.documents.length > 1 ? { label: importMessages.open, run: open } : undefined)
        if (result.documents.length === 1) open()
      }} />}
      {writing && <MaterialsDialog onClose={() => setWriting(false)} />}
      {searching && <SearchDialog onClose={() => setSearching(false)} onOpen={(id, section, block) => { setSearching(false); void workbench.tree.openPlace({ document: id, ...section ? { section } : {}, ...block ? { block } : {} }) }} />}
    </section>
  )
}
