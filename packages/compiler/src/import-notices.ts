// What an import could not convert, left in the document as comments on the pages it was on, so that the author finds
// each where it applies and resolves it when done. The text follows the document's `lang`, as text written into a
// document does.
import { IMPORT_COMMENT_AUTHOR } from '@lincyaw/kernel'
import type { DocumentThread, PresmiumDocument } from '@lincyaw/kernel'

/** A piece of the source the import left out: `page` is the index of the page it was on, when the source says. */
export interface ImportNotice {
  page?: number
  kind: 'chart' | 'diagram' | 'object' | 'media' | 'image' | 'slide' | 'content'
}

const TEXT = {
  'zh-CN': {
    kinds: { chart: '图表', diagram: 'SmartArt 图形', object: '嵌入对象', media: '音频或视频', image: '浏览器无法显示的图片（如 EMF、WMF）', slide: '无法读取的幻灯片', content: '无法转换的内容' } as Record<ImportNotice['kind'], string>,
    count: (kind: string, n: number) => (n > 1 ? `${kind}（${n} 处）` : kind),
    page: (list: string) => `导入时没有带入这一页的${list}。请对照原文件补上，例如插入它的截图；处理完后将这条批注标为已解决。`,
    document: (list: string) => `导入时没有带入原文件中的${list}，原文件没有给出位置。请对照原文件检查；处理完后将这条批注标为已解决。`,
    join: (items: string[]) => items.join('、'),
  },
  en: {
    kinds: { chart: 'a chart', diagram: 'a SmartArt graphic', object: 'an embedded object', media: 'audio or video', image: 'a picture browsers cannot show (such as EMF or WMF)', slide: 'a slide that could not be read', content: 'content that could not be converted' } as Record<ImportNotice['kind'], string>,
    count: (kind: string, n: number) => (n > 1 ? `${kind} (${n})` : kind),
    page: (list: string) => `The import left out ${list} on this page. Add it back from the original file, for example as a screenshot, then resolve this comment.`,
    document: (list: string) => `The import left out ${list} from the original file, which does not say where. Check against the original file, then resolve this comment.`,
    join: (items: string[]) => items.join(', '),
  },
}

/** `document` with a comment on each page that has notices; notices without a page go on the first page. */
export function withImportNotices(document: PresmiumDocument, notices: ImportNotice[], now = new Date().toISOString()): PresmiumDocument {
  const first = document.sectionOrder[0]
  if (!notices.length || !first) return document
  const text = TEXT[document.metadata.lang?.startsWith('zh') ? 'zh-CN' : 'en']
  const byPage = new Map<string | undefined, ImportNotice[]>()
  for (const notice of notices) {
    const section = notice.page === undefined ? undefined : document.sectionOrder[notice.page] ?? document.sectionOrder.at(-1)
    byPage.set(section, [...byPage.get(section) ?? [], notice])
  }
  const comments: Record<string, DocumentThread> = { ...document.comments }
  for (const [section, found] of byPage) {
    const counts = new Map<ImportNotice['kind'], number>()
    for (const notice of found) counts.set(notice.kind, (counts.get(notice.kind) ?? 0) + 1)
    const list = text.join([...counts].map(([kind, n]) => text.count(text.kinds[kind], n)))
    const at = section ?? first
    const title = document.sections[at]!.title
    const id = `import-notice-${section ?? 'document'}`
    comments[id] = {
      id, type: 'thread', createdAt: now, updatedAt: now, resolved: false,
      ...title ? { anchor: { from: { blockId: `page:${at}`, offset: 0 }, to: { blockId: `page:${at}`, offset: title.length } } } : {},
      comments: [{
        id: `${id}-comment`, type: 'comment', userId: IMPORT_COMMENT_AUTHOR, createdAt: now, updatedAt: now, reactions: [],
        content: [{ id: `${id}-text`, type: 'paragraph', children: [{ type: 'text', text: section ? text.page(list) : text.document(list) }] }],
      }],
    }
  }
  return { ...document, comments }
}
