import { createContext, useContext, useMemo } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { insertOrUpdateBlockForSlashMenu, isTableCell, mapTableCell } from '@blocknote/core'
import type { Block } from '@blocknote/core'
import { SideMenuExtension, SourceBlockWithPreviewExtension, TableHandlesExtension } from '@blocknote/core/extensions'
import { DeleteButton, AddButton, DeleteLinkButton, DragHandleMenu, EditLinkButton, LinkToolbar, RemoveBlockItem, SideMenu, SplitButton, TableCellButton, TableCellMenu, TableColumnHeaderItem, TableHandle, TableRowHeaderItem, useBlockNoteEditor, useComponentsContext, useDictionary, useEditorState, useExtension, useExtensionState, usePortalElement, useUIMode } from '@blocknote/react'
import type { DefaultReactSuggestionItem, LinkToolbarProps, SideMenuProps, TableCellButtonProps, TableHandleMenuProps, TableHandleProps } from '@blocknote/react'
import { TextSelection } from '@tiptap/pm/state'
import { DOCUMENT_COLOR_NAMES, documentColorToken, documentColorValue } from '@lincyaw/kernel'
import type { DocumentColorKind } from '@lincyaw/kernel'
import { PmIcon } from '../components.tsx'
import { DOCUMENT_EDITOR_MESSAGES } from './messages.ts'
import { DOCUMENT_EDITOR_LOCALE } from './math.tsx'
import type { NativeDocumentEditor } from './schema.tsx'

const useMessages = () => DOCUMENT_EDITOR_MESSAGES[useContext(DOCUMENT_EDITOR_LOCALE)]

interface ColorChoice { color: string, setColor(color: string): void }

function Swatch({ kind, value }: { kind: DocumentColorKind, value: string }) {
  const style = value === 'default' ? undefined : { '--pm-swatch': documentColorValue(value, kind) } as CSSProperties
  return <span className="pm-ui-color-swatch" data-kind={kind} style={style} aria-hidden="true">A</span>
}

/**
 * Arrow keys move through the swatches as a grid: left and right within a group, up and down to the same colour in
 * the other group. Mantine's own menu keys run after these and would only step through the items in order, so the
 * keys handled here stop there; in a submenu the left arrow on a group's first swatch still returns to the parent item.
 */
function moveInGrid(event: KeyboardEvent<HTMLDivElement>, sub: boolean) {
  const item = (event.target as HTMLElement).closest<HTMLElement>('[data-document-color]')
  const rows = [...event.currentTarget.querySelectorAll('[role=group]')].map(group => [...group.querySelectorAll<HTMLElement>('[data-document-color]')])
  const row = rows.findIndex(swatches => item && swatches.includes(item))
  if (row < 0) return
  const swatches = rows[row]!, column = swatches.indexOf(item!)
  const at = (index: number) => rows[(index + rows.length) % rows.length]![column]
  let target: HTMLElement | undefined
  if (event.key === 'ArrowRight') target = swatches[(column + 1) % swatches.length]
  else if (event.key === 'ArrowLeft' && !(sub && column === 0)) target = swatches[(column - 1 + swatches.length) % swatches.length]
  else if (event.key === 'ArrowDown') target = at(row + 1)
  else if (event.key === 'ArrowUp') target = at(row - 1)
  if (!target) return
  event.preventDefault()
  event.stopPropagation()
  target.focus()
}

/** The document's semantic palette as two rows of swatches; choosing one saves its design token. */
function DocumentColorPicker({ text, background, sub = false }: { text?: ColorChoice, background?: ColorChoice, sub?: boolean }) {
  const Components = useComponentsContext()!, t = useMessages()
  const section = (kind: DocumentColorKind, choice: ColorChoice) => {
    const current = choice.color === 'default' ? 'default' : documentColorValue(choice.color, kind)
    const heading = kind === 'text' ? t.textColor : t.backgroundColor
    return <div className="bn-color-picker-group" role="group" aria-label={heading}>
      <Components.Generic.Menu.Label>{heading}</Components.Generic.Menu.Label>
      {(['default', ...DOCUMENT_COLOR_NAMES] as const).map(name => {
        const value = name === 'default' ? 'default' : documentColorToken(name, kind), checked = current === value
        const label = name === 'default' ? kind === 'text' ? t.colorDefault : t.backgroundDefault : (kind === 'text' ? t.colorNames : t.backgroundNames)[name]
        // The item's role is fixed to menuitem, so the current colour is announced as aria-current.
        return <Components.Generic.Menu.Item key={`${kind}-${name}`} data-document-color={`${kind}-${name}`} data-checked={checked || undefined}
          aria-label={label} aria-current={checked || undefined} {...{ title: label }} onClick={() => choice.setColor(value)}>
          <Swatch kind={kind} value={value} />{checked && <PmIcon name="check" />}
        </Components.Generic.Menu.Item>
      })}
    </div>
  }
  return <div className="bn-color-picker-grid" onKeyDownCapture={event => moveInGrid(event, sub)}>{text && section('text', text)}{background && section('background', background)}</div>
}

function ColorSubmenu({ children, text, background }: { children: ReactNode, text?: ColorChoice, background?: ColorChoice }) {
  const Components = useComponentsContext()!, portalElement = usePortalElement()
  return <Components.Generic.Menu.Root position="right" sub={true} portalElement={portalElement}>
    <Components.Generic.Menu.Trigger sub={true}><Components.Generic.Menu.Item className="bn-menu-item" subTrigger={true}>{children}</Components.Generic.Menu.Item></Components.Generic.Menu.Trigger>
    <Components.Generic.Menu.Dropdown sub={true} className="bn-menu-dropdown bn-color-picker-dropdown"><DocumentColorPicker text={text} background={background} sub={true} /></Components.Generic.Menu.Dropdown>
  </Components.Generic.Menu.Root>
}

/** Formatting-toolbar colours for the selected text. */
export function DocumentColorButton() {
  const Components = useComponentsContext()!, portalElement = usePortalElement(), uiMode = useUIMode(), t = useMessages()
  const editor = useBlockNoteEditor<any, any, any>()
  const state = useEditorState({ editor, selector: ({ editor }) => {
    if (!editor.isEditable || !(editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block]).some(block => block.content !== undefined)) return undefined
    const styles = editor.getActiveStyles() as { textColor?: string, backgroundColor?: string }
    return { text: styles.textColor || 'default', background: styles.backgroundColor || 'default' }
  } })
  if (!state) return null
  const set = (style: 'textColor' | 'backgroundColor') => (color: string) => {
    if (color === 'default') editor.removeStyles({ [style]: color })
    else editor.addStyles({ [style]: color })
    editor.focus()
  }
  return <Components.Generic.Menu.Root portalElement={portalElement} preventFocusOnOpen={uiMode === 'mobile'}>
    <Components.Generic.Menu.Trigger>
      <Components.FormattingToolbar.Button className="bn-button" data-document-colors="" label={t.colors} mainTooltip={t.colors}
        icon={<span className="pm-ui-color-swatch pm-ui-color-swatch--pair" style={{ ...state.text !== 'default' ? { '--pm-swatch': documentColorValue(state.text, 'text') } : {}, ...state.background !== 'default' ? { '--pm-swatch-background': documentColorValue(state.background, 'background') } : {} } as CSSProperties} aria-hidden="true">A</span>} />
    </Components.Generic.Menu.Trigger>
    <Components.Generic.Menu.Dropdown className="bn-menu-dropdown bn-color-picker-dropdown">
      <DocumentColorPicker text={{ color: state.text, setColor: set('textColor') }} background={{ color: state.background, setColor: set('backgroundColor') }} />
    </Components.Generic.Menu.Dropdown>
  </Components.Generic.Menu.Root>
}

function BlockColorsItem({ children }: { children: ReactNode }) {
  const editor = useBlockNoteEditor<any, any, any>()
  const block = useExtensionState(SideMenuExtension, { editor, selector: state => state?.block }) as Block<any, any, any> | undefined
  if (!block || !('textColor' in block.props) && !('backgroundColor' in block.props)) return null
  const choice = (property: 'textColor' | 'backgroundColor'): ColorChoice | undefined => property in block.props
    ? { color: String(block.props[property] ?? 'default'), setColor: color => editor.updateBlock(block, { props: { [property]: color } }) } : undefined
  return <ColorSubmenu text={choice('textColor')} background={choice('backgroundColor')}>{children}</ColorSubmenu>
}

function DocumentDragHandleMenu() {
  const dict = useDictionary()
  return <DragHandleMenu>
    <RemoveBlockItem>{dict.drag_handle.delete_menuitem}</RemoveBlockItem>
    <BlockColorsItem>{dict.drag_handle.colors_menuitem}</BlockColorsItem>
    <TableRowHeaderItem>{dict.drag_handle.header_row_menuitem}</TableRowHeaderItem>
    <TableColumnHeaderItem>{dict.drag_handle.header_column_menuitem}</TableColumnHeaderItem>
  </DragHandleMenu>
}
export function DocumentSideMenu(props: SideMenuProps) { return <SideMenu {...props} dragHandleMenu={DocumentDragHandleMenu} /> }

type TableBlock = Block<any, any, any> & { type: 'table', content: { type: 'tableContent', rows: { cells: any[] }[], headerRows?: number, headerCols?: number } }

function useTableColors(cells: { row: number, col: number }[]) {
  const editor = useBlockNoteEditor<any, any, any>()
  const block = useExtensionState(TableHandlesExtension, { selector: state => state?.block }) as TableBlock | undefined
  if (!block || !cells.length) return undefined
  const rows = block.content.rows
  const value = (property: 'textColor' | 'backgroundColor') => {
    const values = cells.map(({ row, col }) => { const cell = rows[row]?.cells[col]; return cell && isTableCell(cell) ? cell.props[property] : 'default' })
    return values.every(item => item === values[0]) ? values[0] ?? 'default' : 'default'
  }
  const update = (property: 'textColor' | 'backgroundColor') => (color: string) => {
    const next = rows.map(row => ({ ...row, cells: row.cells.map(cell => mapTableCell(cell)) }))
    for (const { row, col } of cells) if (next[row]?.cells[col]) next[row]!.cells[col]!.props[property] = color
    editor.updateBlock(block, { type: 'table', content: { ...block.content, rows: next } })
    editor.setTextCursorPosition(block)
  }
  return { text: { color: value('textColor'), setColor: update('textColor') }, background: { color: value('backgroundColor'), setColor: update('backgroundColor') } }
}

function CellColors() {
  const dict = useDictionary()
  const position = useExtensionState(TableHandlesExtension, { selector: state => state?.rowIndex === undefined || state.colIndex === undefined ? undefined : `${state.rowIndex}:${state.colIndex}` })
  const cells = useMemo(() => position ? [{ row: Number(position.split(':')[0]), col: Number(position.split(':')[1]) }] : [], [position])
  const colors = useTableColors(cells)
  return colors ? <ColorSubmenu {...colors}>{dict.drag_handle.colors_menuitem}</ColorSubmenu> : null
}
function DocumentTableCellMenu() { return <TableCellMenu><SplitButton /><CellColors /></TableCellMenu> }
export function DocumentTableCellButton(props: TableCellButtonProps) { return <TableCellButton {...props} tableCellMenu={DocumentTableCellMenu} /> }

function LineColors({ orientation }: TableHandleMenuProps) {
  const dict = useDictionary(), tableHandles = useExtension(TableHandlesExtension)
  const { block, index } = useExtensionState(TableHandlesExtension, { selector: state => ({ block: state?.block, index: orientation === 'column' ? state?.colIndex : state?.rowIndex }) })
  const cells = useMemo(() => !block || index === undefined ? [] : orientation === 'row' ? tableHandles.getCellsAtRowHandle(block, index) : tableHandles.getCellsAtColumnHandle(block, index), [block, index, orientation, tableHandles])
  const colors = useTableColors(cells)
  return colors ? <ColorSubmenu {...colors}>{dict.drag_handle.colors_menuitem}</ColorSubmenu> : null
}
// BlockNote's own header buttons are not exported, so the first row and column handles get the same toggle here.
function LineHeader({ orientation }: TableHandleMenuProps) {
  const Components = useComponentsContext()!, dict = useDictionary(), editor = useBlockNoteEditor<any, any, any>()
  const { block, index } = useExtensionState(TableHandlesExtension, { selector: state => ({ block: state?.block as TableBlock | undefined, index: orientation === 'column' ? state?.colIndex : state?.rowIndex }) })
  if (!block || index !== 0 || !editor.settings.tables.headers) return null
  const key = orientation === 'row' ? 'headerRows' : 'headerCols', checked = Boolean(block.content[key])
  return <Components.Generic.Menu.Item className="bn-menu-item" checked={checked} onClick={() => editor.updateBlock(block, { ...block, content: { ...block.content, [key]: checked ? undefined : 1 } })}>
    {orientation === 'row' ? dict.drag_handle.header_row_menuitem : dict.drag_handle.header_column_menuitem}
  </Components.Generic.Menu.Item>
}
function DocumentTableHandleMenu({ orientation }: TableHandleMenuProps) {
  const Components = useComponentsContext()!
  return <Components.Generic.Menu.Dropdown className="bn-table-handle-menu">
    <DeleteButton orientation={orientation} />
    <AddButton orientation={orientation} side={orientation === 'row' ? 'above' : 'left' as any} />
    <AddButton orientation={orientation} side={orientation === 'row' ? 'below' : 'right' as any} />
    <LineHeader orientation={orientation} />
    <LineColors orientation={orientation} />
  </Components.Generic.Menu.Dropdown>
}
// BlockNote passes the orientation at runtime, but its public menu type declares no props.
const RowHandleMenu = () => <DocumentTableHandleMenu orientation="row" />
const ColumnHandleMenu = () => <DocumentTableHandleMenu orientation="column" />
export function DocumentTableHandle(props: TableHandleProps) { return <TableHandle {...props} tableHandleMenu={props.orientation === 'row' ? RowHandleMenu : ColumnHandleMenu} /> }

function openBlockFormula(editor: NativeDocumentEditor, id: string): void {
  editor.setTextCursorPosition(id, 'end')
  editor.getExtension(SourceBlockWithPreviewExtension)?.store.setState(state => ({ ...state, popupOpen: id }))
}

/** Inserts a typed inline formula and places the caret in its source, which opens the formula popup. */
export function insertInlineFormula(editor: NativeDocumentEditor, source = ''): void {
  const start = editor.prosemirrorState.selection.from
  editor.insertInlineContent([{ type: 'presmiumMathInline', props: {}, content: source }])
  editor.transact(transaction => {
    // The formula replaces the selection at its start; the caret goes to the end of its source.
    const node = transaction.doc.nodeAt(start)
    if (node?.type.name === 'presmiumMathInline') transaction.setSelection(TextSelection.create(transaction.doc, start + node.nodeSize - 1))
  })
  editor.focus()
}

export function formulaSlashItems(editor: NativeDocumentEditor, locale: keyof typeof DOCUMENT_EDITOR_MESSAGES, group: string): DefaultReactSuggestionItem[] {
  const t = DOCUMENT_EDITOR_MESSAGES[locale]
  return [{
    title: t.formulaBlock, subtext: t.formulaBlockHint, group, icon: <PmIcon name="formula" />, aliases: ['formula', 'math', 'equation', 'latex', 'tex', '公式', '数学'],
    onItemClick: () => openBlockFormula(editor, insertOrUpdateBlockForSlashMenu(editor, { type: 'presmiumMath', content: '' }).id),
  }, {
    title: t.formulaInline, subtext: t.formulaInlineHint, group, icon: <PmIcon name="formula" />, aliases: ['inline formula', 'inline math', 'latex', 'tex', '行内公式', '公式'],
    onItemClick: () => insertInlineFormula(editor),
  }]
}

/** Turns the selected text into an inline formula, its text becoming the LaTeX source. */
export function FormulaToolbarButton() {
  const Components = useComponentsContext()!, t = useMessages()
  const editor = useBlockNoteEditor<any, any, any>() as unknown as NativeDocumentEditor
  const show = useEditorState({ editor, selector: ({ editor }) => {
    const blocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block]
    return editor.isEditable && blocks.length === 1 && blocks[0]!.content !== undefined && blocks[0]!.type !== 'codeBlock' && blocks[0]!.type !== 'presmiumMath' && !editor.getActiveStyles().code
  } })
  if (!show) return null
  return <Components.FormattingToolbar.Button className="bn-button" data-document-formula="" label={t.formulaInline} mainTooltip={t.formulaInline} icon={<PmIcon name="formula" />}
    onClick={() => insertInlineFormula(editor, editor.getSelectedText().replace(/\n/g, ' '))} />
}

export interface DocumentLinks {
  /** Shows a page of this document; false when the anchor names none. */
  openSection?(sectionId: string): boolean
}
export const DOCUMENT_LINKS = createContext<DocumentLinks>({})

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/** In-document anchors navigate the workbench; absolute web links open in a new, unrelated tab. */
export function openDocumentLink(href: string, links: DocumentLinks): void {
  if (href.startsWith('#')) {
    let id = href.slice(1)
    try { id = decodeURIComponent(id) } catch {}
    links.openSection?.(id)
    return
  }
  let url: URL
  try { url = new URL(href) } catch { return }
  if (EXTERNAL_PROTOCOLS.has(url.protocol)) window.open(url.href, '_blank', 'noopener,noreferrer')
}

function OpenLinkButton({ url }: { url: string }) {
  const Components = useComponentsContext()!, t = useMessages(), links = useContext(DOCUMENT_LINKS)
  return <Components.LinkToolbar.Button className="bn-button" mainTooltip={t.openLink} label={t.openLink} isSelected={false}
    onClick={() => openDocumentLink(url, links)} icon={<PmIcon name={url.startsWith('#') ? 'link' : 'external'} />} />
}
export function DocumentLinkToolbar(props: LinkToolbarProps) {
  return <LinkToolbar {...props}>
    <EditLinkButton url={props.url} text={props.text} range={props.range} setToolbarOpen={props.setToolbarOpen} setToolbarPositionFrozen={props.setToolbarPositionFrozen} />
    <OpenLinkButton url={props.url} />
    <DeleteLinkButton range={props.range} setToolbarOpen={props.setToolbarOpen} />
  </LinkToolbar>
}
