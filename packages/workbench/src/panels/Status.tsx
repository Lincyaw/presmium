/**
 * The status items (docs/design-dsh.md 7.3): the git branch and the files not
 * committed, the document's language, the encoding and the cursor's line. The
 * model's state is the AI's (WP-96e).
 */
import { PmIcon } from '../components.tsx'
import { useMessages, useWorkbench } from '../react.tsx'

export function StatusItems() {
  const t = useMessages()
  const documents = useWorkbench(state => state.documents)
  const document = useWorkbench(state => state.document)
  const active = useWorkbench(state => state.active)
  const line = useWorkbench(state => state.line)
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
      {active && <span className="pmw-status__item" data-status="encoding">{t.encoding}</span>}
      {active && <span className="pmw-status__item" data-status="line">{t.line(line)}</span>}
    </>
  )
}
