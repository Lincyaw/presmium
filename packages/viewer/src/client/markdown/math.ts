import { useEffect, useState } from 'react'
import { escapeHtml } from '@lincyaw/kernel'
import { h } from '../element.ts'
import 'katex/dist/katex.min.css'
export function PmMath({ tex, display, html }: { tex: string, display?: boolean, html?: string }) {
  const [rendered, setRendered] = useState<string>()
  useEffect(() => { let active = true; if (!html) void import('katex').then(m => { if (active) setRendered(m.default.renderToString(tex, { displayMode: display, throwOnError: false })) }); return () => { active = false } }, [tex, display, html])
  const output = html ?? rendered
  return h(display ? 'div' : 'span', { className: `pm-math pm-math--${display ? 'display' : 'inline'}`, 'data-rendered': output ? '' : undefined, innerHTML: output ?? escapeHtml(tex) })
}
