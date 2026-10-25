import './CompareCount.css'
import { useActions } from '@lincyaw/host'
import { useRef, useState } from 'react'
export default function CompareCount() {
  const root = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState(0)
  const run = useActions(
    root,
    { compare: () => setCount((value) => value + 1) },
    { clear: () => setCount(0) },
  )
  return (
    <div ref={root} className="compare-count" data-count={count}>
      比较次数：<b>{count}</b>
      <button
        id="compare-once"
        type="button"
        className="pm-ui-button pm-ui-button--small"
        onClick={() => run('compare')}
      >
        比较一次
      </button>
    </div>
  )
}
