import type { NarrationNode } from '@lincyaw/kernel'
import type { NativeNarrationBlock, NativeNarrationInput, NativeNarrationInline } from './narration-schema.tsx'

export function narrationToNative(id: string, content: readonly NarrationNode[]): NativeNarrationInput[] {
  return [{ id: `narration:${id}`, type: 'paragraph', content: content.map((node): NativeNarrationInline => {
    if (node.type === 'text') return { type: 'text', text: node.text, styles: {} }
    return { type: 'narrationAtom', content: undefined, props: node.type === 'pronunciation'
      ? { kind: 'pronunciation', display: node.display, spoken: node.spoken, cueId: '', payload: '' }
      : { kind: 'cue', cueId: node.id, payload: JSON.stringify(node), display: '', spoken: '' } }
  }) }]
}
export function nativeToNarration(blocks: readonly NativeNarrationBlock[]): NarrationNode[] {
  const content: NarrationNode[] = []
  const text = (value: string) => {
    const last = content.at(-1)
    if (last?.type === 'text') last.text += value
    else if (value) content.push({ type: 'text', text: value })
  }
  blocks.forEach((block, index) => {
    if (index) text('\n')
    for (const inline of block.content) {
      if (inline.type === 'text') text(inline.text)
      else if (inline.type === 'link') text(inline.content.map(value => value.text).join(''))
      else if (inline.props.kind === 'pronunciation') content.push({ type: 'pronunciation', display: inline.props.display, spoken: inline.props.spoken })
      else {
        const node = JSON.parse(inline.props.payload) as NarrationNode
        if (node.type !== 'cue' || !inline.props.cueId) throw new Error('narration-cue-reference')
        content.push({ ...node, id: inline.props.cueId })
      }
    }
  })
  return content
}
