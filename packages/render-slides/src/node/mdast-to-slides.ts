import { escapeHtml, isButton, lowerMyst, publishedUrl, roleMark } from '@lincyaw/kernel'
import type { IRBlock, LinkedType, MdastNode } from '@lincyaw/kernel'
import { codeLang } from './code-fences.ts'
import type { Generation } from './generation.ts'
import { stringifyMdast } from './markdown.ts'

/** Publishes a local file a block links to with the deck; returns its URL in the deck, or undefined when it is not a local file. */
export function publishAsset(url: string, block: IRBlock, gen: Generation, type: LinkedType | 'prop', notes = false): string | undefined {
  const found = gen.ctx.localAsset(block.source, url)
  if (!found) return undefined
  gen.assets.set(found.name, found)
  if (type === 'image' && !notes) return publishedUrl(found, url, { prefix: '/' })
  const published = publishedUrl(found, url, { prefix: gen.ctx.base })
  if (type === 'link') gen.files.add(published)
  return published
}

function authorMarks(node: MdastNode): MdastNode {
  if (node.type === 'presmiumRole' && !node.children?.length) return { type: 'html', value: `<span class="pm-role-mark" data-mark="${escapeHtml(roleMark(node))}"></span>` }
  return node.children ? { ...node, children: node.children.map(authorMarks) } : node
}

function verbatim(node: MdastNode): MdastNode {
  if (node.type === 'text' && node.value?.includes('{{')) {
    return { type: 'html', value: `<span v-pre>${escapeHtml(node.value.replace(/[\\`*_[\]$~|]/g, '\\$&'))}</span>` }
  }
  return node.children ? { ...node, children: node.children.map(verbatim) } : node
}

function buttons(node: MdastNode): MdastNode {
  if (!node.children) return node
  return {
    ...node,
    children: node.children.flatMap(child => child.type === 'span' && isButton(child)
      ? [{ type: 'html', value: '<span class="pm-button pm-button--text">' }, ...(child.children ?? []).map(buttons), { type: 'html', value: '</span>' }]
      : [buttons(child)]),
  }
}

function slidevNodes(node: MdastNode, gen: Generation): MdastNode {
  if (node.type === 'code') return { ...node, lang: codeLang(node.lang), meta: null }
  const html = (value: string): MdastNode => ({ type: 'html', value })
  const children = node.children?.flatMap((child): MdastNode[] => {
    if (child.type !== 'link') return [slidevNodes(child, gen)]
    const url = String(child.url)
    const inner = (child.children ?? []).map(c => slidevNodes(c, gen))
    const slide = /^\/(\d+)$/.exec(url)?.[1]
    if (slide) return [html(`<Link to="${slide}">`), ...inner, html('</Link>')]
    if (!gen.files.has(url)) return [{ ...child, children: inner }]
    const title = typeof child.title === 'string' ? ` title="${escapeHtml(child.title)}"` : ''
    return [html(`<a href="${escapeHtml(url)}"${title} target="_blank" rel="noopener">`), ...inner, html('</a>')]
  })
  return children ? { ...node, children } : node
}

/** A Markdown tree as Markdown of the slides: MyST lowered, links to slides and published files, the author's marks in a preview. */
export function slideMarkdown(tree: MdastNode, block: IRBlock | undefined, gen: Generation, notes = false): string {
  const { mdast } = lowerMyst(buttons(verbatim(gen.ctx.preview && !notes ? authorMarks(tree) : tree)), {
    footnotes: 'gfm',
    iframes: 'element',
    cards: 'element',
    links: notes ? undefined : gen.links,
    urls: block ? (url, type) => publishAsset(url, block, gen, type, notes) : undefined,
    htmlUrls: true,
    roles: notes ? 'marks' : 'children',
  })
  return stringifyMdast(slidevNodes(mdast, gen))
}
