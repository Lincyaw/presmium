import { claimFirst } from '@lincyaw/host'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import SessionBadge from './SessionBadge.tsx'
export default function SessionOverlays() {
  const [owns, setOwns] = useState(false)
  useEffect(() => {
    const claim = claimFirst('presmium.session.badge')
    const update = () => setOwns(claim.owns.getSnapshot())
    const stop = claim.owns.subscribe(update)
    update()
    return () => { stop(); claim.release() }
  }, [])
  return owns ? createPortal(<SessionBadge className="pm-session-badge--page" />, document.body) : null
}
