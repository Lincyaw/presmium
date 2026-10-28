import { useMemo } from 'react'
import { applyDocumentComponentAction } from '@lincyaw/kernel'
import type { Definition, TeachingDocument } from '@lincyaw/kernel'
import { PmButton, PmMenu, PmSearchList } from '../components.tsx'
import type { ComponentPropertyMessages } from '../component-property-messages.ts'

export function componentDefinitionLabel(definition: Definition): string {
  const title = typeof definition.parameterSchema === 'object' && typeof definition.parameterSchema.title === 'string' ? definition.parameterSchema.title.trim() : ''
  if (title) return Array.from(title).slice(0, 80).join('')
  const implementation = definition.implementation
  const name = implementation.type === 'file' ? implementation.path.split('/').at(-1)?.replace(/\.(tsx?|jsx?|mjs|cjs)$/, '')
    : implementation.type === 'plugin' ? implementation.name : implementation.specifier.split('/').at(-1)
  return Array.from(name || definition.kind).slice(0, 80).join('')
}

/** Selection is a proposal; only the caller's source-bound Apply changes a binding. */
export function ComponentMaterials({ document, blockId, selected, onSelect, onLocate, disabled, messages: t }: {
  document: TeachingDocument, blockId: string, selected: string, onSelect(id: string): void,
  onLocate(blockId: string): void, disabled: boolean, messages: ComponentPropertyMessages,
}) {
  const current = document.blocks[blockId]
  const choices = useMemo(() => {
    const definitions = Object.values(document.definitions), names = definitions.map(componentDefinitionLabel)
    const counts = new Map<string, number>()
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)
    return definitions.map((definition, index) => {
    let reason: string | undefined
    if (definition.implementation.type === 'module') reason = t.module
    else {
      try { applyDocumentComponentAction(document, { type: 'component.definition.use', blockId, definitionId: definition.id }) }
      catch { reason = t.incompatible }
    }
    const name = names[index]!, duplicate = counts.get(name)! > 1
    return { value: definition.id, label: duplicate ? `${name} · ${index + 1}` : name, keywords: [definition.kind, definition.id, name], disabled: Boolean(reason),
      description: reason ?? (current?.type === 'component' && current.definitionId === definition.id ? t.current : undefined) }
    })
  }, [document, blockId, current, t])
  const references = useMemo(() => {
    const pages = new Map<string, string>()
    const visit = (id: string, page: string) => {
      if (pages.has(id)) return
      pages.set(id, page)
      const block = document.blocks[id]
      if (block?.type === 'component' || block?.type === 'container') for (const child of block.children ?? []) visit(child, page)
    }
    for (const id of document.sectionOrder) for (const child of document.sections[id]!.children) visit(child, document.sections[id]!.title)
    return Object.values(document.blocks).filter(block => block.type === 'component' && block.definitionId === selected)
      .map(block => ({ id: block.id, page: pages.get(block.id) ?? '' }))
  }, [document, selected])
  return <div className="component-properties__content">
    <PmSearchList label={t.definitions} searchLabel={t.search} items={choices} value={selected} onValueChange={onSelect}
      resultsLabel={t.results} emptyLabel={t.noDefinitions} loadingLabel={t.loading} disabled={disabled} />
    <div className="component-properties__actions"><PmMenu label={t.actions} description={references.length ? `${t.copyUnavailable} ${t.inUse}` : t.unavailable}
      items={[{ id: 'copy', label: t.copy, disabled: true }, { id: 'delete', label: t.remove, disabled: true, danger: true }]} onSelect={() => {}} /></div>
    <div className="component-properties__references" role="group" aria-label={t.references}>
      <span>{t.references}</span>
      {references.map((reference, index) => <div className="component-properties__reference" key={reference.id}>
        <span>{reference.page} · {index + 1}</span><PmButton small disabled={disabled} onClick={() => onLocate(reference.id)}>{t.locate}</PmButton>
      </div>)}
    </div>
  </div>
}
