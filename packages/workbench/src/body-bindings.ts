import type { IRBlock, IRSection } from '@lincyaw/kernel'

interface FileBindings { version: string, sections: Map<string, Map<string, IRBlock>> }

/** Deleted source bindings are valid only along this editor's confirmed source-write chain. */
export class BodyBindings {
  readonly #files = new Map<string, FileBindings>()

  read(path: string, version: string, section: string): ReadonlyMap<string, IRBlock> | undefined {
    const file = this.#files.get(path)
    if (file?.version !== version) { this.#files.delete(path); return undefined }
    return file.sections.get(section)
  }

  saved(path: string, base: string, version: string, section: string, before: IRBlock[], after: IRSection | undefined): void {
    const previous = this.#files.get(path)
    const sections = previous?.version === base ? previous.sections : new Map<string, Map<string, IRBlock>>()
    const bindings = sections.get(section) ?? new Map<string, IRBlock>()
    const present = new Set(after?.blocks.map(block => block.id))
    for (const id of present) bindings.delete(id)
    for (const block of before) if (!present.has(block.id)) bindings.set(block.id, block)
    // This is a bounded recovery aid, never another persistent content store.
    while (bindings.size > 512) bindings.delete(bindings.keys().next().value!)
    if (bindings.size) sections.set(section, bindings)
    else sections.delete(section)
    this.#files.set(path, { version, sections })
  }

  clear(): void { this.#files.clear() }
}
