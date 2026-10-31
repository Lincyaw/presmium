import type { IRDocument } from '@lincyaw/kernel'
import { createStore } from '@lincyaw/host'
import { loadDocumentParts } from '@lincyaw/viewer'
import { renderToString } from 'react-dom/server'
import type { AppConfig } from '../domain/index.ts'
import { createPageApp } from './page-app.ts'

/**
 * The viewer app on the server: a built site's pages rendered to HTML, which the browser then hydrates. The document's
 * components render as the browser first renders them, as placeholders that load once the page is mounted, so only
 * their names are needed here.
 */

const never = () => new Promise<never>(() => {})

export interface RenderInput {
  config: AppConfig
  doc?: IRDocument
  /** The names of the components the document can show: the plugins' and its own. */
  components: string[]
}

export async function render({ config, doc, components }: RenderInput): Promise<string> {
  if (doc) await loadDocumentParts(doc)
  const { app } = createPageApp({
    config,
    doc,
    components: Object.fromEntries(components.map(name => [name, never])),
    embedded: false,
    ssr: true,
    dark: createStore(false),
  })
  return await renderToString(app.element)
}
