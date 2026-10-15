import { defineTransformersSetup } from '@slidev/types'
import { findWorkspaceRoot } from '../src/node/git.ts'
import plugin from '../src/node/presmium.ts'

const roots = new Map<string, Promise<string>>()

// The slides form expands coderef blocks with the same transform the web form uses.
export default defineTransformersSetup(() => ({
  pre: [
    async ({ s, slide, options }) => {
      const content = s.toString()
      if (!content.includes('coderef')) return
      const deckDir = options.userRoot
      if (!roots.has(deckDir)) roots.set(deckDir, findWorkspaceRoot(deckDir))
      const out = await plugin.transformMarkdown!({
        content,
        file: slide.source.filepath,
        slide: slide.index + 1,
        mode: 'slides',
        deckDir,
        workspaceRoot: await roots.get(deckDir)!,
        headmatter: options.data.headmatter,
        frontmatter: slide.frontmatter,
      })
      if (out !== content) s.overwrite(0, s.original.length, out)
    },
  ],
}))
