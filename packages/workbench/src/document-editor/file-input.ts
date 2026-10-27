import { createExtension, getBlockInfoNearPos, getNodeId } from '@blocknote/core'
import { FileHandler } from '@tiptap/extension-file-handler'
import { DOCUMENT_IMAGE_MEDIA_TYPES } from '@lincyaw/kernel'
import { isObservedWorkspaceFailure, WorkspaceServerError } from '../workspace-client.ts'
import type { NativeDocumentEditor } from './schema.tsx'

export type ImageImportFailureKind = 'unsupported' | 'format' | 'size' | 'dimensions' | 'failed'
export interface ImageImportFailure { name: string, kind: ImageImportFailureKind }
interface Options { onStart(): void, onFailure(failure: ImageImportFailure): void }

const supported = (file: File) => (DOCUMENT_IMAGE_MEDIA_TYPES as readonly string[]).includes(file.type)
  || !file.type && /\.(?:png|jpe?g|gif|webp|svg|bmp)$/i.test(file.name)
const failureKind = (error: unknown): ImageImportFailureKind => {
  if (!(error instanceof WorkspaceServerError)) return 'failed'
  if (error.answer.error === 'document-image-format') return 'format'
  if (error.answer.error === 'document-image-size') return 'size'
  if (error.answer.error === 'document-image-dimensions') return 'dimensions'
  return 'failed'
}

/** FileHandler snapshots native files before the browser closes the drop data store. */
export const imageFileInput = createExtension(({ editor, options }: { editor: NativeDocumentEditor, options: Options }) => {
  let mounted: AbortSignal | undefined
  const insert = (files: File[], position = editor.prosemirrorState.selection.head): void => {
    const owner = mounted
    const active = () => owner !== undefined && owner === mounted && !owner.aborted && !editor.prosemirrorView.isDestroyed
    const fail = (file: File, kind: ImageImportFailureKind) => { if (active()) options.onFailure({ name: file.name, kind }) }
    if (!active() || !editor.isEditable || !editor.uploadFile || !files.length) return
    options.onStart()
    const accepted = files.filter(file => { if (supported(file)) return true; fail(file, 'unsupported'); return false })
    if (!accepted.length) return
    let pending: { file: File, id: string }[]
    try {
      const state = editor.prosemirrorState, info = getBlockInfoNearPos(state, position)
      const anchor = editor.getBlock(getNodeId(info.block.node, state.doc))
      if (!anchor) throw new Error('document-file-position')
      const blocks = accepted.map(file => ({ id: crypto.randomUUID(), type: 'image' as const, props: { name: file.name } }))
      const before = anchor.type !== 'presmiumPage' && position <= (info.contentStart ?? info.block.beforePos)
      const inserted = editor.insertBlocks(blocks, anchor, before ? 'before' : 'after')
      pending = inserted.map((block, index) => ({ file: accepted[index]!, id: block.id }))
    } catch (error) {
      for (const file of accepted) fail(file, failureKind(error))
      return
    }
    const upload = async () => {
      for (const { file, id } of pending) {
        if (!active()) return
        try {
          const block = editor.getBlock(id)
          if (block?.type !== 'image' || block.props.url) continue
          const result = await editor.uploadFile!(file, id)
          if (!active()) return
          const current = editor.getBlock(id)
          if (current?.type !== 'image' || current.props.url) continue
          editor.updateBlock(id, typeof result === 'string' ? { props: { url: result } } : result)
        } catch (error) {
          if (!active()) return
          if (error instanceof Error && error.name === 'AbortError') continue
          // The existing request observer owns transport and server failures.
          if (!isObservedWorkspaceFailure(error)) fail(file, failureKind(error))
        }
      }
    }
    void upload()
  }
  return {
    key: 'presmiumImageFileInput', insert,
    mount: ({ signal }: { signal: AbortSignal }) => { mounted = signal },
    tiptapExtensions: [FileHandler.extend({ priority: 1000 }).configure({ onDrop: (_editor, files, position) => insert(files, position) })],
  }
})
