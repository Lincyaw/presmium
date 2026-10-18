import { readFile, writeFile } from 'node:fs/promises'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib'

export async function pdfLinks(file: string): Promise<string[][]> {
  const doc = await PDFDocument.load(await readFile(file), { updateMetadata: false })
  return doc.getPages().map((page) => {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
    const uris: string[] = []
    for (let i = 0; i < (annots?.size() ?? 0); i++) {
      const annot = annots!.lookupMaybe(i, PDFDict)
      if (annot?.get(PDFName.of('Subtype')) !== PDFName.of('Link')) continue
      const action = annot.lookupMaybe(PDFName.of('A'), PDFDict)
      const uri = action?.lookupMaybe(PDFName.of('URI'), PDFString, PDFHexString)
      if (uri) uris.push(uri.decodeText())
    }
    return uris
  })
}

export async function keepPages(file: string, keep: (index: number) => boolean): Promise<void> {
  const doc = await PDFDocument.load(await readFile(file), { updateMetadata: false })
  for (let i = doc.getPageCount() - 1; i >= 0; i--) {
    if (!keep(i)) doc.removePage(i)
  }
  await writeFile(file, await doc.save())
}
