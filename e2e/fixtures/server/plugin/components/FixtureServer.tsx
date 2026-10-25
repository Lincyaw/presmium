import { useEffect, useState } from 'react'
import { useServer } from '@lincyaw/host'
export default function FixtureServer() {
  const server = useServer()
  const [value, setValue] = useState<string>()
  const [result, setResult] = useState('')
  useEffect(() => {
    let active = true
    if (server.available)
      void server
        .fetch('fixture.server', 'value')
        .then((response) => response.json())
        .then((data: { value: string }) => {
          if (active) setValue(data.value)
        })
    return () => {
      active = false
    }
  }, [server])
  async function ask() {
    setResult('等待确认')
    const response = await server.fetch('fixture.server', 'approve', { method: 'POST' })
    setResult(((await response.json()) as { allowed: boolean }).allowed ? '已允许' : '已拒绝')
  }
  return (
    <div className="fixture-server">
      <p className="fixture-server__value">{server.available ? (value ?? '加载中') : '服务端不可用'}</p>
      {server.available && (
        <button type="button" className="fixture-server__ask" onClick={ask}>
          请求确认
        </button>
      )}
      <p className="fixture-server__result">{result}</p>
    </div>
  )
}
