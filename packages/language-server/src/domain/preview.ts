import type { SectionAt } from './protocol.ts'

const page = (link: string) => link.split('#')[0]!

/**
 * Where the preview of P-81 goes to show `section`, from the dev server's
 * base URL: within the page it shows (`shown`), the section's anchor, which
 * scrolls without reloading; on another page, the page with `?section=<id>`,
 * which the web form scrolls to once loaded. Without a section, the base URL.
 */
export function previewUrl(base: string, section: SectionAt | null | undefined, shown?: SectionAt): string {
  const root = base.replace(/\/?$/, '/')
  if (!section) return root
  const id = encodeURIComponent(section.id)
  const target = shown && page(shown.link) === page(section.link) ? `${page(section.link)}#${id}` : `${page(section.link)}?section=${id}`
  return new URL(target.replace(/^\//, ''), root).href
}
