import { createContext, useContext, useMemo } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { components } from '@blocknote/mantine'
import { ComponentsContext, FloatingComposer, useComponentsContext } from '@blocknote/react'
import type { ComponentProps } from '@blocknote/react'
import type { BlockNoteEditor } from '@blocknote/core'

const COMPOSER_CARD = createContext<{ Card: ComponentType<ComponentProps['Comments']['Card']>, header?: ReactNode } | undefined>(undefined)

function ComposerCard(props: ComponentProps['Comments']['Card']) {
  const { Card, header } = useContext(COMPOSER_CARD)!
  return <Card {...props}>{header && <div className="pm-ui-comment-target">{header}</div>}{props.children}</Card>
}

/** Text selections and block/step anchors share the native card, editor and Post action. */
export function CommentComposer({ editor, editorComponent = components.Comments.Editor, children }: {
  editor: BlockNoteEditor<any, any, any>, editorComponent?: ComponentType<ComponentProps['Comments']['Editor']>, children?: ReactNode,
}) {
  const native = useComponentsContext()!
  const value = useMemo(() => ({ ...native, Comments: { ...native.Comments, Card: ComposerCard, Editor: editorComponent } }), [native, editorComponent])
  return <COMPOSER_CARD.Provider value={{ Card: native.Comments.Card, header: children }}><ComponentsContext.Provider value={value}>
    <FloatingComposer newCommentEditor={editor} />
  </ComponentsContext.Provider></COMPOSER_CARD.Provider>
}
