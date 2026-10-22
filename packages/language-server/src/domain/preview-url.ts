import type { SectionLocation } from './protocol.ts'

const page = (link: string) => link.split('#')[0]!

export function previewUrl(base: string, section: SectionLocation | null | undefined, shown?: SectionLocation): string {
  const root = base.replace(/\/?$/, '/')
  if (!section) return root
  const id = encodeURIComponent(section.id)
  const target = shown && page(shown.link) === page(section.link) ? `${page(section.link)}#${id}` : `${page(section.link)}?section=${id}`
  return new URL(target.replace(/^\//, ''), root).href
}
