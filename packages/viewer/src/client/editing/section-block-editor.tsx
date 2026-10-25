import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ReactNode } from 'react'
import type { IRSection } from '@lincyaw/kernel'
import { useViewer } from '../viewer-state.ts'
import { pageCreation } from './pages.ts'
const MountedEditor = lazy(() => import('./mounted-editor.tsx'))
function editing() {
  return (
    typeof document !== 'undefined' &&
    document.documentElement.hasAttribute('data-preview-picking')
  )
}
function subscribe(changed: () => void) {
  const observer = new MutationObserver(changed)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-preview-picking'],
  })
  return () => observer.disconnect()
}
/** The full BlockNote editor loads only in the author’s editing canvas. */
export function SectionBlockEditor({
  section,
  children,
}: {
  section: IRSection
  children?: ReactNode
}) {
  const viewer = useViewer()
  const active = useSyncExternalStore(subscribe, editing, () => false)
  const sentinel = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (active) pageCreation(viewer)
  }, [active, viewer])
  useEffect(() => {
    if (!active || seen) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setSeen(true)
        observer.disconnect()
      },
      { rootMargin: '200px 0px' },
    )
    if (sentinel.current) observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [active, seen])
  return (
    <div ref={sentinel}>
      {active && seen ? (
        <Suspense fallback={children}>
          <MountedEditor key={section.id} section={section} />
        </Suspense>
      ) : (
        children
      )}
    </div>
  )
}
