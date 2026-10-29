import './CompareCount.css'
import { useActions, useMessages } from '@lincyaw/host'
import { useRef, useState } from 'react'
const MESSAGES = { 'zh-CN': { count: '比较次数：', compare: '比较一次' }, en: { count: 'Comparisons: ', compare: 'Compare Once' } }

export default function CompareCount() {
  const t = useMessages(MESSAGES)
  const root = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState(0)
  const run = useActions(
    root,
    { compare: () => setCount((value) => value + 1) },
    { clear: () => setCount(0) },
  )
  return (
    <div ref={root} className="compare-count" data-count={count}>
      {t.count}<b>{count}</b>
      <button
        id="compare-once"
        type="button"
        className="pm-ui-button pm-ui-button--small"
        onClick={() => run('compare')}
      >
        {t.compare}
      </button>
    </div>
  )
}
