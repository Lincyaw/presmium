/**
 * The document open, as the design lays it out (docs/design/edit.dc.html): the
 * source editor with the problems under it on the left, the preview on the right;
 * `only` shows one of the two (a narrow screen, docs/design-dsh.md 7.7).
 */
import { ProblemsPanel } from './Problems.tsx'
import { PreviewPanel } from './Preview.tsx'
import { SourcePanel } from './Source.tsx'

export function DocumentView({ only }: { only?: 'source' | 'preview' }) {
  return (
    <div className="pmw-doc" data-only={only}>
      <div className="pmw-doc__source" hidden={only === 'preview'}>
        <SourcePanel />
        <ProblemsPanel />
      </div>
      <div className="pmw-doc__preview" hidden={only === 'source'}>
        <PreviewPanel />
      </div>
    </div>
  )
}
