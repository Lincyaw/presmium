/** A document's card on the workspace site's home page. */
export interface HomeDocument {
  dir: string
  title: string
  lang?: string
  tags?: string[]
  href: string
  description?: string
  pages?: number
  problems?: { errors: number, warnings: number }
  sections?: { id: string, title: string, href: string }[]
}
