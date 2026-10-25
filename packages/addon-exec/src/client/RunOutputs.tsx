import { Fragment, useEffect, useState } from 'react'
import { useMessages } from '@lincyaw/host'
import type { RunResult } from '@lincyaw/kernel'
import { MESSAGES } from './messages.ts'
import { displayItem } from './outputs.ts'
import './RunOutputs.css'
export default function RunOutputs({
  result,
  hideError = false,
}: {
  result: RunResult
  hideError?: boolean
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const t = useMessages(MESSAGES)
  const outputs =
    result.outputs && result.source !== 'recorded'
      ? result.outputs.map((output) => displayItem(output, { html: mounted }))
      : [
          {
            kind: 'stream' as const,
            name: 'stdout' as const,
            text: result.stdout,
          },
          {
            kind: 'stream' as const,
            name: 'stderr' as const,
            text: result.stderr,
          },
        ]
  return (
    <>
      {outputs.map((item, i) => {
        if (item.kind === 'image')
          return (
            <img
              key={i}
              className="pm-run-panel__image"
              src={item.src}
              alt=""
            />
          )
        if (item.kind === 'html')
          return (
            <div
              key={i}
              className="pm-run-panel__html"
              dangerouslySetInnerHTML={{ __html: item.html }}
            />
          )
        const kind =
          item.kind === 'stream'
            ? item.name
            : item.kind === 'error' || item.kind === 'dropped-image'
              ? 'stderr'
              : 'stdout'
        const text = item.kind === 'dropped-image' ? t.droppedImage : item.text
        return (
          <Fragment key={i}>
            {text && !(hideError && kind === 'stderr') && (
              <pre className={`pm-run-panel__${kind}`}>{text}</pre>
            )}
          </Fragment>
        )
      })}
    </>
  )
}
