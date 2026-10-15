import type { TransformersSetup } from '@slidev/types'
import { findWorkspaceRoot } from '../src/node/git.ts'
import plugin from '../src/node/presmium.ts'
import { watchedFiles } from '../src/node/transform.ts'

const roots = new Map<string, Promise<string>>()

// The slides form expands coderef blocks with the same transform the web form uses.
const setup: TransformersSetup = () => ({
  pre: [
    async ({ s, slide, options }) => {
      const content = s.toString()
      if (!content.includes('coderef')) return
      const deckDir = options.userRoot
      if (!roots.has(deckDir)) roots.set(deckDir, findWorkspaceRoot(deckDir))
      const workspaceRoot = await roots.get(deckDir)!
      const out = await plugin.transformMarkdown!({
        content,
        file: slide.source.filepath,
        slide: slide.index + 1,
        mode: 'slides',
        deckDir,
        workspaceRoot,
        headmatter: options.data.headmatter,
        frontmatter: slide.frontmatter,
      })
      // The dev server reloads the slide when the referenced code or its git refs change (K-09).
      if (options.mode === 'dev') {
        for (const file of await watchedFiles(content, workspaceRoot)) (options.data.watchFiles[file] ??= new Set()).add(slide.index)
      }
      if (out !== content) s.overwrite(0, s.original.length, out)
    },
  ],
})

export default setup
