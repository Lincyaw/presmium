import { useDoc, useCursor, useStep } from '@lincyaw/host'
export default function PmProbe() {
  const doc = useDoc()
  const cursor = useCursor()
  const step = useStep()
  const section = doc.sections.find(section => section.index === cursor.slide)
  return <div className="pm-probe" data-title={section?.title} data-accent={String(section?.hints.web?.accent ?? '')} data-page={cursor.slide} data-clicks={step}>
    <span className="pm-probe__click" data-pm-click={step >= 1 ? 'shown' : 'hidden'}>甲</span>
    <span className="pm-probe__after" data-pm-click={step >= 1 ? 'shown' : 'hidden'}>乙</span>
    <span className="pm-probe__hide" data-pm-click={step < 2 ? 'shown' : 'hidden'}>丙</span>
  </div>
}
