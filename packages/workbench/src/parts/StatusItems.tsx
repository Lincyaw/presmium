import { PmIcon } from '../components.tsx'
import { useMessages, useWorkbenchState } from '../context.tsx'

export function StatusItems() {
  const t = useMessages()
  const documents = useWorkbenchState(state => state.documents)
  const document = useWorkbenchState(state => state.document)
  const activeFile = useWorkbenchState(state => state.activeFile)
  const cursorLine = useWorkbenchState(state => state.cursorLine)
  const lang = documents?.documents.find(doc => doc.dir === document)?.lang
  return (
    <>
      {documents && (
        <span className="pmw-status__item" data-status="git">
          <PmIcon name="branch" size={13} />
          {documents.git ? (documents.branch ? t.branch(documents.branch) : 'HEAD') : t.noGit}
          {documents.git && documents.uncommitted ? ` · ${t.uncommitted(documents.uncommitted)}` : ''}
        </span>
      )}
      <span className="pmw-spacer" />
      {document !== undefined && lang && <span className="pmw-status__item" data-status="lang">{t.language(lang)}</span>}
      {activeFile && <span className="pmw-status__item" data-status="encoding">{t.encoding}</span>}
      {activeFile && <span className="pmw-status__item" data-status="line">{t.line(cursorLine)}</span>}
    </>
  )
}
