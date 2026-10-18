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
