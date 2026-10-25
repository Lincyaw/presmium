import { claimFirst } from '@lincyaw/host'
import { useEffect, useState } from 'react'

import NotesLayer from './NotesLayer.tsx'
export default function ClassroomOverlays() {
  const [owns, setOwns] = useState(false)
  useEffect(() => {
    const claim = claimFirst('presmium.classroom.notes')
    const update = () => setOwns(claim.owns.getSnapshot())
    const stop = claim.owns.subscribe(update)
    update()
    return () => { stop(); claim.release() }
  }, [])
  return owns ? <NotesLayer /> : null
}
