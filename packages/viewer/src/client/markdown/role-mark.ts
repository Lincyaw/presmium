import { useEffect, useState } from 'react'
import { AUTHOR_MARKS_CLASS } from '@lincyaw/kernel'
import { useSectionContext } from '../section-context.ts'
import { h } from '../element.ts'
export function PmRoleMark({ mark }: { mark: string }) {
  const section = useSectionContext(); const [shown, setShown] = useState(false)
  useEffect(() => { const root = document.documentElement; const update = () => setShown(root.classList.contains(AUTHOR_MARKS_CLASS)); update(); const observer = new MutationObserver(update); observer.observe(root, { attributes: true, attributeFilter: ['class'] }); return () => observer.disconnect() }, [])
  return shown || section?.view === 'presenter' ? h('span', { className: 'pm-role-mark' }, mark) : null
}
