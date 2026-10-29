import './MergeCounter.css'
import { useActions, useMessages } from '@lincyaw/host'
import { useRef, useState } from 'react'
const VOCABULARY = ['l', 'o', 'w', 'e', 'r', 's', 't']
const NEW = ['lo', 'low', 'er', 'est']
const MESSAGES = {
  'zh-CN': { size: (n: number) => `词表大小：${n}`, merge: '合并一次', reset: '重置' },
  en: { size: (n: number) => `Vocabulary size: ${n}`, merge: 'Merge Once', reset: 'Reset' },
}

export default function MergeCounter() {
  const t = useMessages(MESSAGES)
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
      <p className="merge-counter__size">{t.size(VOCABULARY.length + merges)}</p>
      <div className="merge-counter__actions">
        <button
          id="merge-once"
          type="button"
          className="pm-ui-button pm-ui-button--primary"
          onClick={() => run('merge')}
        >
          {t.merge}
        </button>
        <button id="merge-reset" type="button" className="pm-ui-button" onClick={() => run('reset')}>
          {t.reset}
        </button>
      </div>
    </div>
  )
}
