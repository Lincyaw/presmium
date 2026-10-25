import { lazy, Suspense, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { IRSection } from '@lincyaw/kernel'
const MountedEditor = lazy(() => import('./mounted-editor.tsx'))
function editing() { return typeof document !== 'undefined' && document.documentElement.hasAttribute('data-preview-picking') }
function subscribe(changed: () => void) {
  const observer = new MutationObserver(changed)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-preview-picking'] })
  return () => observer.disconnect()
}
/** The full BlockNote editor loads only in the author’s editing canvas. */
export function SectionBlockEditor({ section, children }: { section: IRSection, children?: ReactNode }) {
  const active = useSyncExternalStore(subscribe, editing, () => false)
  return active ? <Suspense fallback={children}><MountedEditor key={section.id} section={section} /></Suspense> : children
}
