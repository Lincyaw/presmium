import { useAppearance, usePrefersReducedMotion } from '@lincyaw/host'
import { ShikiMagicMove } from '@shikijs/magic-move/react'
import '@shikijs/magic-move/style.css'
import { useEffect, useState } from 'react'
import type { Element, ElementContent, Root } from 'hast'
import { toHtml } from 'hast-util-to-html'
import { codeColumns } from '../../domain/index.ts'
import { highlighterFor, SHIKI_THEMES } from './highlight.ts'
import { h } from '../element.ts'
type Loaded = Awaited<ReturnType<typeof highlighterFor>>
function useHighlighter(lang: string) { const [loaded, setLoaded] = useState<Loaded>(); useEffect(() => { let active = true; void highlighterFor(lang).then(value => { if (active) setLoaded(value) }).catch(() => {}); return () => { active = false } }, [lang]); return loaded }
function lineElements(tree: Root): Element[] { const pre = tree.children.find((node): node is Element => node.type === 'element'); const code = pre?.children.find((node): node is Element => node.type === 'element' && node.tagName === 'code'); return (code?.children ?? []).filter((node: ElementContent): node is Element => node.type === 'element') }
export function CodeView({ lang = '', value, highlight }: { lang?: string, value: string, highlight?: number[] }) {
  const shiki = useHighlighter(lang); const code = value.replace(/\n$/, ''); const lines = new Set(highlight ?? [])
  let html: string | undefined
  if (shiki) { const tree = shiki.highlighter.codeToHast(code, { lang: shiki.lang, themes: SHIKI_THEMES, defaultColor: false }); lineElements(tree).forEach((line, i) => line.properties.class = lines.has(i + 1) ? 'line highlighted' : 'line'); html = toHtml(tree) }
  const attrs = { className: `pm-code${lines.size ? ' pm-code--highlight' : ''}`, style: { '--pm-code-columns': codeColumns(code) }, 'data-lang': lang || undefined }
  if (html) return h('div', { ...attrs, innerHTML: html })
  const rows = code.split('\n').flatMap((text, i) => [h('span', { key: i, className: `line${lines.has(i + 1) ? ' highlighted' : ''}` }, text), '\n'])
  return h('div', attrs, h('pre', { className: 'shiki' }, h('code', {}, rows.slice(0, -1))))
}
export function VariantView({ lang = '', value }: { lang?: string, value: string }) { const loaded = useHighlighter(lang); const reduced = usePrefersReducedMotion(); const { dark } = useAppearance(); if (!loaded || reduced) return h(CodeView, { lang, value }); const code = value.replace(/\n$/, ''); return h('div', { className: 'pm-code pm-code--magic-move', style: { '--pm-code-columns': codeColumns(code) }, 'data-lang': lang || undefined }, h(ShikiMagicMove, { highlighter: loaded.highlighter, lang: loaded.lang, theme: dark ? SHIKI_THEMES.dark : SHIKI_THEMES.light, code })) }
