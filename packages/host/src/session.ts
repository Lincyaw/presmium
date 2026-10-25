import { useEffect, useState } from 'react'
import { SESSION } from '@lincyaw/kernel'
import type { SessionSnapshot } from '@lincyaw/kernel'
import { useService } from './host.ts'
export function useSessionSnapshot() {
  const session = useService(SESSION)
  const [snapshot, setSnapshot] = useState<SessionSnapshot>()
  useEffect(() => { setSnapshot(session?.snapshot()); return session?.subscribe(setSnapshot) }, [session])
  return { session, snapshot }
}
