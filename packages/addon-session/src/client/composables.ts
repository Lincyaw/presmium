import { useSessionSnapshot } from '@lincyaw/host'
import { isClassroomSession } from '../domain/index.ts'
import type { ClassroomSession, ClassroomSnapshot } from '../domain/index.ts'
export function useClassroomSession(): { session: ClassroomSession | undefined, snapshot: ClassroomSnapshot | undefined } {
  const host = useSessionSnapshot()
  const session = isClassroomSession(host.session) ? host.session : undefined
  return { session, snapshot: session ? host.snapshot as ClassroomSnapshot | undefined : undefined }
}
