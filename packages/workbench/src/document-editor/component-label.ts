import type { Definition } from '@lincyaw/kernel'

/** What an author calls a component: their title, otherwise a readable implementation name, never source code. */
export function componentDefinitionLabel(definition: Definition): string {
  const title = typeof definition.parameterSchema === 'object' && typeof definition.parameterSchema.title === 'string' ? definition.parameterSchema.title.trim() : ''
  if (title) return Array.from(title).slice(0, 80).join('')
  const implementation = definition.implementation
  const name = implementation.type === 'file' ? implementation.path.split('/').at(-1)?.replace(/\.(tsx?|jsx?|mjs|cjs)$/, '')
    : implementation.type === 'plugin' ? implementation.name : implementation.specifier.split('/').at(-1)
  return Array.from(name || definition.kind).slice(0, 80).join('')
}
