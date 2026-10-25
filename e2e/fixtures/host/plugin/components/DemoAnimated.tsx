import './DemoAnimated.css'
import { usePrefersReducedMotion } from '@lincyaw/host'
export default function DemoAnimated() {
  const reduced = usePrefersReducedMotion()
  return (
    <div className="demo-animated" data-motion={reduced ? 'reduced' : 'full'}>
      <div className={'demo-animated__bar' + (!reduced ? ' demo-animated__bar--animate' : '')} />
    </div>
  )
}
