import './MergeCounter.css'
import { useActions } from '@lincyaw/host'
import { useRef, useState } from 'react'
const VOCABULARY = ['l', 'o', 'w', 'e', 'r', 's', 't']
const NEW = ['lo', 'low', 'er', 'est']
export default function MergeCounter() {
  const root = useRef<HTMLDivElement>(null)
  const [merges, setMerges] = useState(0)
  const run = useActions(
    root,
    { merge: () => setMerges((value) => Math.min(NEW.length, value + 1)), reset: () => setMerges(0) },
    { clear: () => setMerges(0) },
  )
  return (
    <div ref={root} className="merge-counter" data-merges={merges}>
      <div className="merge-counter__vocab">
        {VOCABULARY.map((token) => (
          <span key={token} className="merge-counter__token">
            {token}
          </span>
        ))}
        {NEW.slice(0, merges).map((token) => (
          <span key={token} className="merge-counter__token merge-counter__token--new">
            {token}
          </span>
        ))}
      </div>
      <p className="merge-counter__size">词表大小：{VOCABULARY.length + merges}</p>
      <div className="merge-counter__actions">
        <button
          id="merge-once"
          type="button"
          className="pm-ui-button pm-ui-button--primary"
          onClick={() => run('merge')}
        >
          合并一次
        </button>
        <button id="merge-reset" type="button" className="pm-ui-button" onClick={() => run('reset')}>
          重置
        </button>
      </div>
    </div>
  )
}
