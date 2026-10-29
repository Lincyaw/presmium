import type { Dictionary } from '@blocknote/core'
import { en, zh } from '@blocknote/core/locales'
import type { Locale } from '../messages.ts'

type Overrides<T> = { [K in keyof T]?: T[K] extends string ? string : T[K] extends (...args: never[]) => unknown ? T[K] : Overrides<T[K]> }

const basic = { 'zh-CN': '基本内容块', en: 'Basic Blocks' }
const basicGroups = (locale: Locale) => Object.fromEntries(['quote', 'toggle_list', 'numbered_list', 'bullet_list', 'check_list', 'paragraph', 'code_block', 'page_break', 'divider'].map(key => [key, { group: basic[locale] }]))
const kinds = <T extends string>(image: T, video: T, audio: T, file: T) => ({ image, video, audio, file })

// The block editor's own text, changed where it differs from docs/glossary.md (批注 / New Comment, 内容块 / Block,
// 插入 / Insert, commands in Title Case, one “…”). Every other entry stays BlockNote's.
export const BLOCKNOTE_MESSAGES: Record<Locale, Overrides<Dictionary>> = {
  'zh-CN': {
    slash_menu: { ...basicGroups('zh-CN'), image: { title: '图片' }, divider: { subtext: '分隔内容块', group: basic['zh-CN'] } },
    placeholders: { default: '输入文字，或输入“/”使用命令', toggleListItem: '折叠项', new_comment: '输入批注…', edit_comment: '编辑批注…', comment_reply: '回复…' },
    file_blocks: { add_button_text: kinds('插入图片', '插入视频', '插入音频', '插入文件') },
    toggle_blocks: { add_block_button: '空的折叠项。单击以插入内容块。', toggle_button: '显示或隐藏' },
    code_block: { add_source_button_text: '插入代码' },
    side_menu: { add_block_label: '插入内容块', drag_handle_label: '打开内容块菜单' },
    drag_handle: { header_row_menuitem: '标题行', header_column_menuitem: '标题列' },
    table_handle: { delete_column_menuitem: '删除列', delete_row_menuitem: '删除行', split_cell_menuitem: '拆分单元格', merge_cells_menuitem: '合并单元格', background_color_menuitem: '背景色', add_left_menuitem: '在左侧插入列', add_right_menuitem: '在右侧插入列', add_above_menuitem: '在上方插入行', add_below_menuitem: '在下方插入行' },
    formatting_toolbar: {
      strike: { tooltip: '删除线' }, code: { tooltip: '代码' }, link: { tooltip: '插入链接' },
      file_caption: { tooltip: '编辑题注', input_placeholder: '输入题注' },
      file_replace: { tooltip: kinds('替换图片', '替换视频', '替换音频', '替换文件') },
      file_rename: { tooltip: kinds('重命名图片', '重命名视频', '重命名音频', '重命名文件'), input_placeholder: kinds('输入名称', '输入名称', '输入名称', '输入名称') },
      file_download: { tooltip: kinds('下载图片', '下载视频', '下载音频', '下载文件') },
      file_delete: { tooltip: kinds('删除图片', '删除视频', '删除音频', '删除文件') },
      file_preview_toggle: { tooltip: '显示或隐藏预览' },
      nest: { tooltip: '增加缩进' }, unnest: { tooltip: '减少缩进' },
      align_left: { tooltip: '左对齐' }, align_center: { tooltip: '居中' }, align_right: { tooltip: '右对齐' }, align_justify: { tooltip: '两端对齐' },
      comment: { tooltip: '新建批注' },
    },
    file_panel: { upload: { file_placeholder: kinds('上传图片', '上传视频', '上传音频', '上传文件'), upload_error: '无法上传文件' }, embed: { embed_button: kinds('嵌入图片', '嵌入视频', '嵌入音频', '嵌入文件'), url_placeholder: '输入网址' } },
    link_toolbar: { delete: { tooltip: '移除链接' }, edit: { text: '编辑链接' }, open: { tooltip: '在新标签页中打开' }, form: { title_placeholder: '链接文字', url_placeholder: '链接地址' } },
    comments: {
      discard_pending_comment: '要放弃这条批注吗？',
      actions: { add_reaction: '添加回应', edit_comment: '编辑批注', delete_comment: '删除批注', more_actions: '更多' },
    },
    versioning: {
      title: '版本历史', start_of_document: '文稿开头', show_named_only: '仅显示已命名的版本', show_all: '显示所有版本', comparison_on: '开启对比', comparison_off: '关闭对比',
      compare_since_beginning_menuitem: '与最初的版本对比', name_version_menuitem: '命名此版本', compare_with_menuitem: '与此版本对比',
      before_restore: '还原前', restore_menuitem: '还原', more_actions: '更多', action_failed: '无法完成操作，请重试。', history_load_failed: '无法加载版本历史',
    },
    exporter: { open_file: '打开文件', open_video_file: '打开视频', open_audio_file: '打开音频' },
    generic: { loading: '正在加载…', load_more: '加载更多' },
  },
  en: {
    slash_menu: { ...basicGroups('en'), image: { title: 'Picture' }, divider: { subtext: 'Visually divide blocks', group: basic.en } },
    placeholders: { default: 'Enter text, or type “/” for commands', toggleListItem: 'Toggle', new_comment: 'Write a comment…', edit_comment: 'Write a comment…', comment_reply: 'Reply…' },
    file_blocks: { add_button_text: kinds('Insert Picture', 'Insert Video', 'Insert Audio', 'Insert File') },
    toggle_blocks: { add_block_button: 'Empty toggle. Click to insert a block.', toggle_button: 'Show or Hide' },
    code_block: { add_source_button_text: 'Insert Code' },
    side_menu: { add_block_label: 'Insert Block', drag_handle_label: 'Open Block Menu' },
    drag_handle: { header_row_menuitem: 'Header Row', header_column_menuitem: 'Header Column' },
    table_handle: { delete_column_menuitem: 'Delete Column', delete_row_menuitem: 'Delete Row', split_cell_menuitem: 'Split Cell', merge_cells_menuitem: 'Merge Cells', background_color_menuitem: 'Background Color', add_left_menuitem: 'Insert Column Left', add_right_menuitem: 'Insert Column Right', add_above_menuitem: 'Insert Row Above', add_below_menuitem: 'Insert Row Below' },
    formatting_toolbar: {
      strike: { tooltip: 'Strikethrough' }, code: { tooltip: 'Code' }, link: { tooltip: 'Insert Link' },
      file_caption: { tooltip: 'Edit Caption', input_placeholder: 'Enter a caption' },
      file_replace: { tooltip: kinds('Replace Picture', 'Replace Video', 'Replace Audio', 'Replace File') },
      file_rename: { tooltip: kinds('Rename Picture', 'Rename Video', 'Rename Audio', 'Rename File'), input_placeholder: kinds('Enter a name', 'Enter a name', 'Enter a name', 'Enter a name') },
      file_download: { tooltip: kinds('Download Picture', 'Download Video', 'Download Audio', 'Download File') },
      file_delete: { tooltip: kinds('Delete Picture', 'Delete Video', 'Delete Audio', 'Delete File') },
      file_preview_toggle: { tooltip: 'Show or Hide Preview' },
      nest: { tooltip: 'Increase Indent' }, unnest: { tooltip: 'Decrease Indent' },
      align_left: { tooltip: 'Align Left' }, align_center: { tooltip: 'Center' }, align_right: { tooltip: 'Align Right' }, align_justify: { tooltip: 'Justify' },
      comment: { tooltip: 'New Comment' },
    },
    file_panel: { upload: { file_placeholder: kinds('Upload Picture', 'Upload Video', 'Upload Audio', 'Upload File'), upload_error: 'Couldn’t upload the file' }, embed: { embed_button: kinds('Embed Picture', 'Embed Video', 'Embed Audio', 'Embed File'), url_placeholder: 'Enter an address' } },
    link_toolbar: { delete: { tooltip: 'Remove Link' }, edit: { text: 'Edit Link' }, open: { tooltip: 'Open in New Tab' }, form: { title_placeholder: 'Link text', url_placeholder: 'Link address' } },
    comments: {
      discard_pending_comment: 'Discard this comment?',
      actions: { add_reaction: 'Add Reaction', edit_comment: 'Edit Comment', delete_comment: 'Delete Comment', more_actions: 'More' },
    },
    versioning: {
      title: 'Version History', start_of_document: 'Beginning of document', show_named_only: 'Show Named Versions Only', show_all: 'Show All Versions', comparison_on: 'Turn On Comparison', comparison_off: 'Turn Off Comparison',
      compare_since_beginning_menuitem: 'Compare with First Version', name_version_menuitem: 'Name This Version', compare_with_menuitem: 'Compare with This Version',
      before_restore: 'Before restore', restore_menuitem: 'Restore', more_actions: 'More', action_failed: 'Couldn’t finish the operation. Try again.', history_load_failed: 'Couldn’t load Version History',
    },
    exporter: { open_file: 'Open File', open_video_file: 'Open Video', open_audio_file: 'Open Audio' },
    generic: { loading: 'Loading…', load_more: 'Load More' },
  },
}

function merged<T>(base: T, overrides: Overrides<T> | undefined): T {
  if (!overrides || typeof base !== 'object' || base === null) return (overrides ?? base) as T
  const out = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(overrides)) out[key] = merged((base as Record<string, unknown>)[key], value as Overrides<unknown>)
  return out as T
}

const DICTIONARIES: Record<Locale, Dictionary> = { 'zh-CN': merged(zh, BLOCKNOTE_MESSAGES['zh-CN']), en: merged(en, BLOCKNOTE_MESSAGES.en) }

/** BlockNote's dictionary for the interface language, through its public `dictionary` option. */
export function blockNoteDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale]
}
