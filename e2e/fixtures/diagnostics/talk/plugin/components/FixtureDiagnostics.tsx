import { useState } from 'react'
import { PmBoundary } from '@lincyaw/host'
function CheckedContent({ fail }: { fail: boolean }) {
  if (fail) throw new Error('诊断运行错误')
  return <p>运行组件已恢复。</p>
}
export default function FixtureDiagnostics() {
  const [failed, setFailed] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setFailed(true)}>
        触发运行错误
      </button>
      <button type="button" onClick={() => setFailed(false)}>
        恢复组件
      </button>
      <PmBoundary name="FixtureDiagnostics" resetKey={String(failed)}>
        <CheckedContent key={String(failed)} fail={failed} />
      </PmBoundary>
    </>
  )
}
