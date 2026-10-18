import { basename, dirname, join, relative, sep } from 'node:path'
import { definePreparserSetup } from '@slidev/types'
import { DRAWINGS_DIR } from '../src/domain/index.ts'

export default definePreparserSetup(({ filepath, headmatter }) => {
  if ('drawings' in headmatter) return []
  const persist = drawingsDir(dirname(filepath))
  return [{
    name: 'presmium-stage-drawings',
    async transformSlide(_content, frontmatter) {
      if ('addons' in frontmatter) frontmatter.drawings = { persist }
      return undefined
    },
  }]
})

function drawingsDir(dir: string): string {
  for (let d = dir; dirname(d) !== d; d = dirname(d)) {
    if (basename(d) === '.presmium') return relative(dir, join(dirname(d), DRAWINGS_DIR)).split(sep).join('/')
  }
  return DRAWINGS_DIR
}
