import CursorPath from '../src/client/CursorPath.tsx'
import { planCursorPath } from '../src/domain/index.ts'
import type { Waypoint } from '../src/domain/index.ts'
export default function PmCursor({ path }: { path: Waypoint[] }) {
  const plan = planCursorPath(path ?? [])
  return <CursorPath key={JSON.stringify(plan)} plan={plan} />
}
