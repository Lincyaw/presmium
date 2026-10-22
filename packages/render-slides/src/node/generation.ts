import type { CodeNode, LocalAsset, Locale, RenderContext } from '@lincyaw/kernel'
import type { SlidesMessages } from './messages.ts'

/** The state of writing one deck: the files it publishes and what the slides being written need to know. */
export interface Generation {
  ctx: RenderContext
  dir: string
  locale: Locale
  t: SlidesMessages
  assets: Map<string, LocalAsset>
  files: Set<string>
  links: (label: string) => string | undefined
  section: string
  live: boolean
  chapters: Map<string, string>
  liveRunKeys: WeakMap<CodeNode, string>
}
