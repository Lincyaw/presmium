import { PmDialog, PmIcon, useMessages } from '@lincyaw/host'
import { tokenize } from '@lincyaw/kernel/reading'
import type MiniSearch from 'minisearch'
import type { SearchResult } from 'minisearch'
import { useEffect, useRef, useState } from 'react'
import { SEARCH_FIELDS, WEB_MESSAGES } from '../../domain/index.ts'
const QUERY = { prefix: true, fuzzy: 0.2, boost: { title: 4, text: 2, titles: 1 } }
const indexes = new Map<string, Promise<MiniSearch>>()
function loadIndex(url: string): Promise<MiniSearch> {
  let index = indexes.get(url)
  if (!index) { index = Promise.all([import('minisearch'), fetch(url).then(response => { if (!response.ok) throw new Error(`search index HTTP ${response.status}`); return response.text() })]).then(([{ default: Search }, json]) => Search.loadJSON(json, { ...SEARCH_FIELDS, tokenize })); index.catch(() => indexes.delete(url)); indexes.set(url, index) }
  return index
}
export function forgetIndex(url: string) { indexes.delete(url) }
export function SearchDialog({ open, index, onOpenChange }: { open: boolean, index: string, onOpenChange?(open: boolean): void }) {
  const t = useMessages(WEB_MESSAGES), [query, setQuery] = useState(''), [results, setResults] = useState<SearchResult[]>([]), [active, setActive] = useState(0), [failed, setFailed] = useState(false)
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLUListElement>(null)
  useEffect(() => { let current = true; if (!query.trim()) { setResults([]); return } void loadIndex(index).then(search => { if (current) { setResults(search.search(query.trim(), QUERY).slice(0, 30)); setActive(0); setFailed(false) } }).catch(error => { if (current) { console.warn('[presmium] search unavailable', error); setFailed(true) } }); return () => { current = false } }, [query, index])
  useEffect(() => { if (open) { const frame = requestAnimationFrame(() => { input.current?.focus(); input.current?.select() }); return () => cancelAnimationFrame(frame) } }, [open])
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [active])
  return <PmDialog open={open} label={t.search} closeLabel={t.close} name="pm-site-search" onOpenChange={onOpenChange}><label className="pm-ui-search pm-site-search__field"><PmIcon name="search" /><input ref={input} className="pm-site-search__input" type="search" aria-controls="pm-site-search-results" aria-label={t.search} placeholder={t.searchPlaceholder} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (results.length) setActive((active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length) } else if (event.key === 'Enter') { const link = list.current?.querySelector<HTMLAnchorElement>('[aria-selected="true"] a'); if (link) { event.preventDefault(); onOpenChange?.(false); link.click() } } }} /></label><ul id="pm-site-search-results" ref={list} className="pm-site-search__results" role="listbox" aria-label={t.search}>{results.map((result, i) => <li key={String(result.id)} role="option" aria-selected={i === active} className="pm-site-search__result" onMouseEnter={() => setActive(i)}><a className="pm-site-search__link" href={String(result.id)} aria-label={[...(result.titles as string[] | undefined) ?? [], String(result.title)].join(' > ')} onClick={() => onOpenChange?.(false)}>{(result.titles as string[] | undefined)?.length ? <span className="pm-site-search__path">{(result.titles as string[]).join(' › ')}</span> : null}<span className="pm-site-search__title">{String(result.title)}</span></a></li>)}</ul>{((query.trim() && !results.length) || failed) && <p className="pm-site-search__empty">{t.noResults(query.trim())}</p>}<p className="pm-site-search__keys"><span><kbd className="pm-ui-kbd" aria-label={t.keyEnter}>↵</kbd> {t.searchSelect}</span><span><kbd className="pm-ui-kbd" aria-label={t.keyUp}>↑</kbd><kbd className="pm-ui-kbd" aria-label={t.keyDown}>↓</kbd> {t.searchNavigate}</span><span><kbd className="pm-ui-kbd" aria-label={t.keyEscape}>Esc</kbd> {t.searchClose}</span></p></PmDialog>
}
